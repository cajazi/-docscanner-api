import { resolvePageImageSource, ScanSourceResolutionError } from '../scanSource/scanSourceResolver';
import { ScanConsumer } from '../scanSource/types';
import type {
  PdfExportJobRecord,
  PdfExportOptions,
  PdfExportPage,
  PdfExportProvider,
  PdfExportRepository,
} from './types';

export type CreatePdfExportJobRequest = {
  documentId: string;
  options?: Partial<PdfExportOptions>;
};

export class PdfExportPipelineError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}

const defaultOptions: PdfExportOptions = {
  searchable: false,
  pageSize: 'A4',
  includeOcrTextLayer: false,
};

export class PdfExportService {
  constructor(
    private readonly repository: PdfExportRepository,
    private readonly provider: PdfExportProvider,
  ) {}

  async createJob(input: CreatePdfExportJobRequest): Promise<PdfExportJobRecord> {
    const document = await this.repository.findDocumentWithPages(input.documentId);
    if (!document) {
      throw new PdfExportPipelineError('DOCUMENT_NOT_FOUND', 'Document was not found', 404);
    }

    const options = normalizeOptions(input.options);
    const pages = this.resolvePages(document.pages);
    const activeJob = await this.repository.findActiveByDocumentId(input.documentId);
    if (activeJob) {
      return activeJob;
    }

    return this.repository.create({
      documentId: input.documentId,
      provider: this.provider.name,
      metadata: {
        options,
        pageCount: pages.length,
        resolvedPages: pages.map((page) => ({
          pageId: page.pageId,
          pageNumber: page.pageNumber,
          sourceRole: page.sourceRole,
        })),
      },
    });
  }

  async processJob(jobId: string): Promise<PdfExportJobRecord | null> {
    const claimedJob = await this.repository.claimJob(jobId);
    if (!claimedJob) {
      return null;
    }

    const options = readOptions(claimedJob.metadata);

    try {
      const document = await this.repository.findDocumentWithPages(claimedJob.documentId);
      if (!document) {
        throw new PdfExportPipelineError('DOCUMENT_NOT_FOUND', 'Document was not found', 404);
      }

      const pages = this.resolvePages(document.pages);
      const result = await this.provider.export({
        documentId: claimedJob.documentId,
        pages,
        outputStorageKey: buildOutputKey(claimedJob.documentId, claimedJob.id),
        options,
      });

      return this.repository.markCompleted({
        jobId: claimedJob.id,
        documentId: claimedJob.documentId,
        outputPdfUrl: result.outputPdfUrl,
        pageCount: result.pageCount,
        metadata: {
          ...readMetadataObject(claimedJob.metadata),
          result: result.metadata,
        },
      });
    } catch (error) {
      return this.repository.markFailed({
        jobId: claimedJob.id,
        errorMessage: error instanceof Error ? error.message : 'PDF export provider failed',
        metadata: {
          ...readMetadataObject(claimedJob.metadata),
          failureStage: error instanceof PdfExportPipelineError ? 'document' : 'provider',
        },
      });
    }
  }

  async processNextPendingJobs(limit: number): Promise<PromiseSettledResult<PdfExportJobRecord | null>[]> {
    const jobs = await this.repository.findPendingJobs(limit);
    return Promise.allSettled(jobs.map((job) => this.processJob(job.id)));
  }

  async getJob(jobId: string): Promise<PdfExportJobRecord> {
    const job = await this.repository.findById(jobId);
    if (!job) {
      throw new PdfExportPipelineError('PDF_EXPORT_JOB_NOT_FOUND', 'PDF export job was not found', 404);
    }

    return job;
  }

  private resolvePages(
    pages: Array<{
      id: string;
      pageNumber: number;
      originalImageUrl: string | null;
      croppedImageUrl: string | null;
      enhancedImageUrl: string | null;
    }>,
  ): PdfExportPage[] {
    if (pages.length === 0) {
      throw new PdfExportPipelineError('DOCUMENT_HAS_NO_PAGES', 'Document does not have pages to export', 409);
    }

    return [...pages]
      .sort((a, b) => a.pageNumber - b.pageNumber)
      .map((page) => {
        try {
          const source = resolvePageImageSource(page, ScanConsumer.PDF_EXPORT);
          return {
            pageId: page.id,
            pageNumber: page.pageNumber,
            imageUrl: source.imageUrl,
            sourceRole: source.role,
          };
        } catch (error) {
          if (error instanceof ScanSourceResolutionError) {
            throw new PdfExportPipelineError(
              'PAGE_IMAGE_MISSING',
              `Page ${page.pageNumber} does not have a usable image for PDF export`,
              409,
            );
          }

          throw error;
        }
      });
  }
}

export function normalizeOptions(options: Partial<PdfExportOptions> | undefined): PdfExportOptions {
  return {
    searchable: options?.searchable ?? defaultOptions.searchable,
    pageSize: options?.pageSize ?? defaultOptions.pageSize,
    includeOcrTextLayer: options?.includeOcrTextLayer ?? defaultOptions.includeOcrTextLayer,
  };
}

function readOptions(metadata: unknown) {
  const object = readMetadataObject(metadata);
  const options = object.options;

  if (!options || typeof options !== 'object') {
    return defaultOptions;
  }

  return normalizeOptions(options as Partial<PdfExportOptions>);
}

function buildOutputKey(documentId: string, jobId: string) {
  return `pdf-exports/${documentId}/${jobId}.pdf`;
}

function readMetadataObject(metadata: unknown): Record<string, unknown> {
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? { ...metadata } : {};
}
