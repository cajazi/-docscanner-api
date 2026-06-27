import { describe, expect, it } from 'vitest';
import { ScanSourceRole } from '../scanSource/types';
import { SearchablePdfService } from '../searchablePdf/searchablePdfService';
import { PdfExportPipelineError, PdfExportService } from './pdfExportService';
import type {
  CompletePdfExportJobInput,
  CreatePdfExportJobInput,
  FailPdfExportJobInput,
  PdfExportDocument,
  PdfExportJobRecord,
  PdfExportProvider,
  PdfExportProviderInput,
  PdfExportRepository,
} from './types';

class InMemoryPdfExportRepository implements PdfExportRepository {
  jobs: PdfExportJobRecord[] = [];
  completedInput: CompletePdfExportJobInput | null = null;
  failedInput: FailPdfExportJobInput | null = null;

  constructor(private readonly document: PdfExportDocument | null) {}

  async findDocumentWithPages() {
    return this.document;
  }

  async findActiveByDocumentId(documentId: string) {
    return (
      this.jobs.find(
        (job) => job.documentId === documentId && (job.status === 'PENDING' || job.status === 'PROCESSING'),
      ) ?? null
    );
  }

  async create(input: CreatePdfExportJobInput) {
    const job: PdfExportJobRecord = {
      id: `pdf_export_job_${this.jobs.length + 1}`,
      documentId: input.documentId,
      status: 'PENDING',
      provider: input.provider,
      outputPdfUrl: null,
      pageCount: null,
      errorMessage: null,
      metadata: input.metadata,
      createdAt: new Date('2026-06-24T00:00:00.000Z'),
      updatedAt: new Date('2026-06-24T00:00:00.000Z'),
    };
    this.jobs.push(job);
    return job;
  }

  async findById(jobId: string) {
    return this.jobs.find((job) => job.id === jobId) ?? null;
  }

  async findPendingJobs(limit: number) {
    return this.jobs.filter((job) => job.status === 'PENDING').slice(0, limit);
  }

  async claimJob(jobId: string) {
    const job = this.jobs.find((candidate) => candidate.id === jobId);
    if (!job || job.status !== 'PENDING') {
      return null;
    }

    job.status = 'PROCESSING';
    return job;
  }

  async markCompleted(input: CompletePdfExportJobInput) {
    this.completedInput = input;
    const job = this.mustGetJob(input.jobId);
    job.status = 'COMPLETED';
    job.outputPdfUrl = input.outputPdfUrl;
    job.pageCount = input.pageCount;
    job.metadata = input.metadata;
    return job;
  }

  async markFailed(input: FailPdfExportJobInput) {
    this.failedInput = input;
    const job = this.mustGetJob(input.jobId);
    job.status = 'FAILED';
    job.errorMessage = input.errorMessage;
    job.metadata = input.metadata ?? job.metadata;
    return job;
  }

  private mustGetJob(jobId: string) {
    const job = this.jobs.find((candidate) => candidate.id === jobId);
    if (!job) {
      throw new Error(`Job ${jobId} was not found`);
    }
    return job;
  }
}

function documentFixture(): PdfExportDocument {
  return {
    id: 'doc_1',
    pages: [
      {
        id: 'page_2',
        pageNumber: 2,
        originalImageUrl: 'page-2-original.jpg',
        croppedImageUrl: 'page-2-cropped.jpg',
        enhancedImageUrl: 'page-2-enhanced.jpg',
      },
      {
        id: 'page_1',
        pageNumber: 1,
        originalImageUrl: 'page-1-original.jpg',
        croppedImageUrl: null,
        enhancedImageUrl: 'page-1-enhanced.jpg',
      },
    ],
  };
}

function createProvider(overrides: Partial<PdfExportProvider> = {}) {
  const calls: PdfExportProviderInput[] = [];
  const provider: PdfExportProvider = {
    name: 'pdf-lib',
    async export(input) {
      calls.push(input);
      return {
        outputPdfUrl: 'C:\\tmp\\pdf-exports\\doc_1\\pdf_export_job_1.pdf',
        pageCount: input.pages.length,
        metadata: {
          provider: 'pdf-lib',
          searchablePdfImplemented: false,
          pages: input.pages.map((page) => ({
            pageId: page.pageId,
            pageNumber: page.pageNumber,
            sourceRole: page.sourceRole,
          })),
        },
      };
    },
    ...overrides,
  };

  return { provider, calls };
}

function createSearchablePdfService() {
  const calls: string[] = [];
  const service = new SearchablePdfService({
    async findDocumentWithOcrPages(documentId) {
      calls.push(documentId);
      return {
        id: documentId,
        pages: [
          { id: 'page_1', pageNumber: 1, ocrText: 'First searchable page', ocrLayout: null, ocrTextLayer: null },
          { id: 'page_2', pageNumber: 2, ocrText: 'Second searchable page', ocrLayout: null, ocrTextLayer: null },
        ],
      };
    },
    async updateSearchablePdfMetadata() {
      return undefined;
    },
  });

  return { service, calls };
}

describe('PdfExportService', () => {
  it('creates a PDF export job with resolved ordered pages metadata', async () => {
    const repository = new InMemoryPdfExportRepository(documentFixture());
    const { provider } = createProvider();
    const service = new PdfExportService(repository, provider);

    const job = await service.createJob({
      documentId: 'doc_1',
      options: { searchable: true, includeOcrTextLayer: true },
    });

    expect(job.status).toBe('PENDING');
    expect(job.provider).toBe('pdf-lib');
    expect(job.metadata).toMatchObject({
      options: { searchable: true, pageSize: 'A4', includeOcrTextLayer: true },
      pageCount: 2,
      resolvedPages: [
        { pageId: 'page_1', pageNumber: 1, sourceRole: ScanSourceRole.ENHANCED },
        { pageId: 'page_2', pageNumber: 2, sourceRole: ScanSourceRole.ENHANCED },
      ],
    });
  });

  it('reuses an existing pending or processing job for the same document', async () => {
    const repository = new InMemoryPdfExportRepository(documentFixture());
    const { provider } = createProvider();
    const service = new PdfExportService(repository, provider);

    const first = await service.createJob({ documentId: 'doc_1' });
    const second = await service.createJob({ documentId: 'doc_1' });
    first.status = 'PROCESSING';
    const third = await service.createJob({ documentId: 'doc_1' });

    expect(second.id).toBe(first.id);
    expect(third.id).toBe(first.id);
    expect(repository.jobs).toHaveLength(1);
  });

  it('orders pages by pageNumber and passes resolved image URLs to provider', async () => {
    const repository = new InMemoryPdfExportRepository(documentFixture());
    const { provider, calls } = createProvider();
    const service = new PdfExportService(repository, provider);
    const pending = await service.createJob({ documentId: 'doc_1' });

    await service.processJob(pending.id);

    expect(calls[0]?.pages.map((page) => page.pageNumber)).toEqual([1, 2]);
    expect(calls[0]?.pages.map((page) => page.imageUrl)).toEqual(['page-1-enhanced.jpg', 'page-2-enhanced.jpg']);
    expect(calls[0]?.pages.every((page) => page.sourceRole === ScanSourceRole.ENHANCED)).toBe(true);
  });

  it('uses ScanConsumer.PDF_EXPORT fallback order when enhanced is missing', async () => {
    const repository = new InMemoryPdfExportRepository({
      id: 'doc_1',
      pages: [
        {
          id: 'page_1',
          pageNumber: 1,
          originalImageUrl: 'original.jpg',
          croppedImageUrl: 'cropped.jpg',
          enhancedImageUrl: null,
        },
      ],
    });
    const { provider, calls } = createProvider();
    const service = new PdfExportService(repository, provider);
    const pending = await service.createJob({ documentId: 'doc_1' });

    await service.processJob(pending.id);

    expect(calls[0]?.pages[0]).toMatchObject({
      imageUrl: 'cropped.jpg',
      sourceRole: ScanSourceRole.CROPPED,
    });
  });

  it('marks completed with outputPdfUrl and pageCount', async () => {
    const repository = new InMemoryPdfExportRepository(documentFixture());
    const { provider } = createProvider();
    const service = new PdfExportService(repository, provider);
    const pending = await service.createJob({ documentId: 'doc_1' });

    const completed = await service.processJob(pending.id);

    expect(completed?.status).toBe('COMPLETED');
    expect(completed?.outputPdfUrl).toContain('pdf-exports');
    expect(completed?.pageCount).toBe(2);
    expect(repository.completedInput?.metadata).toMatchObject({
      result: {
        searchablePdfImplemented: false,
      },
    });
  });

  it('stores searchable text layer metadata when requested', async () => {
    const repository = new InMemoryPdfExportRepository(documentFixture());
    const { provider, calls } = createProvider({
      async export(input) {
        calls.push(input);
        return {
          outputPdfUrl: 'C:\\tmp\\pdf-exports\\doc_1\\pdf_export_job_1.pdf',
          pageCount: input.pages.length,
          metadata: {
            searchablePdfImplemented: true,
            invisibleTextLayerImplemented: true,
            pagesWithTextLayer: 2,
            pagesWithoutTextLayer: 0,
          },
        };
      },
    });
    const searchablePdf = createSearchablePdfService();
    const service = new PdfExportService(repository, provider, searchablePdf.service);
    const pending = await service.createJob({
      documentId: 'doc_1',
      options: { searchable: true, includeOcrTextLayer: true },
    });

    const completed = await service.processJob(pending.id);

    expect(searchablePdf.calls).toEqual(['doc_1']);
    expect(calls[0]?.textLayer).toMatchObject({
      documentId: 'doc_1',
      searchableText: 'First searchable page\n\nSecond searchable page',
    });
    expect(completed?.metadata).toMatchObject({
      searchablePdf: {
        requested: true,
        textLayerMetadataImplemented: true,
        invisibleTextLayerImplemented: true,
        textLayer: {
          documentId: 'doc_1',
          searchableText: 'First searchable page\n\nSecond searchable page',
          pageCount: 2,
        },
      },
    });
  });

  it('marks failed with provider error without throwing from processor path', async () => {
    const repository = new InMemoryPdfExportRepository(documentFixture());
    const { provider } = createProvider({
      async export() {
        throw new Error('pdf image embed failed');
      },
    });
    const service = new PdfExportService(repository, provider);
    const pending = await service.createJob({ documentId: 'doc_1' });

    const failed = await service.processJob(pending.id);

    expect(failed?.status).toBe('FAILED');
    expect(failed?.errorMessage).toBe('pdf image embed failed');
    expect(repository.failedInput?.errorMessage).toBe('pdf image embed failed');
  });

  it('does not process a job that cannot be atomically claimed', async () => {
    const repository = new InMemoryPdfExportRepository(documentFixture());
    const { provider } = createProvider();
    const service = new PdfExportService(repository, provider);
    const pending = await service.createJob({ documentId: 'doc_1' });
    await service.processJob(pending.id);

    const secondAttempt = await service.processJob(pending.id);

    expect(secondAttempt).toBeNull();
  });

  it('throws explicit error when a document has no pages', async () => {
    const repository = new InMemoryPdfExportRepository({ id: 'doc_1', pages: [] });
    const { provider } = createProvider();
    const service = new PdfExportService(repository, provider);

    await expect(service.createJob({ documentId: 'doc_1' })).rejects.toMatchObject({
      code: 'DOCUMENT_HAS_NO_PAGES',
      statusCode: 409,
    });
  });

  it('returns 404 when a PDF export job is missing', async () => {
    const repository = new InMemoryPdfExportRepository(null);
    const { provider } = createProvider();
    const service = new PdfExportService(repository, provider);

    await expect(service.getJob('missing')).rejects.toMatchObject({
      code: 'PDF_EXPORT_JOB_NOT_FOUND',
      statusCode: 404,
    });
  });
});
