import type { OCRImageRole, OCRJobRecord, OCRPipelineRepository, OCRProvider } from './types';
import { resolvePageImageSource, ScanSourceResolutionError } from '../scanSource/scanSourceResolver';
import { ScanConsumer, type ResolvedScanSource } from '../scanSource/types';

export type StartPageOCRInput = {
  documentId: string;
  pageId: string;
  language?: string;
};

export class OCRPipelineError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}

export class OCRPipelineService {
  constructor(
    private readonly repository: OCRPipelineRepository,
    private readonly provider: OCRProvider,
  ) {}

  async startPageOCR(input: StartPageOCRInput): Promise<OCRJobRecord> {
    const page = await this.repository.findPageTarget(input.documentId, input.pageId);
    if (!page) {
      throw new OCRPipelineError('PAGE_NOT_FOUND', 'Document page was not found', 404);
    }

    const resolvedSource = this.resolveSource(page);
    if (!resolvedSource.imageUrl) {
      throw new OCRPipelineError('PAGE_IMAGE_MISSING', 'Document page does not have an OCR source image', 409);
    }

    const language = input.language ?? 'eng';
    const job = await this.repository.createJob({
      documentId: input.documentId,
      pageId: input.pageId,
      provider: this.provider.name,
      language,
      sourceImageUrl: resolvedSource.imageUrl,
      sourceImageRole: resolvedSource.role as OCRImageRole,
    });

    await this.repository.markJobProcessing(job.id, input.pageId);

    try {
      const result = await this.provider.recognizePage({
        imageUri: resolvedSource.imageUrl,
        language,
      });

      return await this.repository.completeJob({
        jobId: job.id,
        pageId: input.pageId,
        documentId: input.documentId,
        provider: this.provider.name,
        language,
        sourceImageUrl: resolvedSource.imageUrl,
        sourceImageRole: resolvedSource.role as OCRImageRole,
        result,
      });
    } catch (error) {
      const failed = await this.repository.failJob({
        jobId: job.id,
        pageId: input.pageId,
        code: 'OCR_PROVIDER_FAILED',
        message: error instanceof Error ? error.message : 'OCR provider failed',
      });

      return failed;
    }
  }

  async getJob(jobId: string): Promise<OCRJobRecord> {
    const job = await this.repository.getJob(jobId);
    if (!job) {
      throw new OCRPipelineError('OCR_JOB_NOT_FOUND', 'OCR job was not found', 404);
    }

    return job;
  }

  private resolveSource(page: {
    originalImageUrl: string | null;
    croppedImageUrl: string | null;
    enhancedImageUrl: string | null;
  }): ResolvedScanSource {
    try {
      return resolvePageImageSource(page, ScanConsumer.OCR);
    } catch (error) {
      if (error instanceof ScanSourceResolutionError) {
        throw new OCRPipelineError('PAGE_IMAGE_MISSING', error.message, 409);
      }

      throw error;
    }
  }
}
