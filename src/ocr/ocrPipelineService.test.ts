import { describe, expect, it } from 'vitest';
import { OCRPipelineError, OCRPipelineService } from './ocrPipelineService';
import type {
  CompleteOCRJobInput,
  CreateOCRJobInput,
  FailOCRJobInput,
  OCRJobRecord,
  OCRPipelineRepository,
  OCRProvider,
  PageOCRTarget,
} from './types';

class InMemoryOCRRepository implements OCRPipelineRepository {
  job: OCRJobRecord | null = null;
  completedInput: CompleteOCRJobInput | null = null;
  failedInput: FailOCRJobInput | null = null;
  pageProcessingStatus: string | null = null;

  constructor(private readonly page: PageOCRTarget | null) {}

  async findPageTarget() {
    return this.page;
  }

  async createJob(input: CreateOCRJobInput) {
    this.job = {
      id: 'ocr_job_1',
      documentId: input.documentId,
      pageId: input.pageId,
      provider: input.provider,
      status: 'PENDING',
      language: input.language,
      sourceImageUrl: input.sourceImageUrl,
      sourceImageRole: input.sourceImageRole,
      extractedText: null,
      errorCode: null,
      errorMessage: null,
      startedAt: null,
      completedAt: null,
      createdAt: new Date('2026-06-24T00:00:00.000Z'),
      updatedAt: new Date('2026-06-24T00:00:00.000Z'),
    };

    return this.job;
  }

  async markJobProcessing(jobId: string) {
    this.pageProcessingStatus = 'PROCESSING';
    this.job = {
      ...this.mustGetJob(jobId),
      status: 'PROCESSING',
      startedAt: new Date('2026-06-24T00:00:01.000Z'),
    };

    return this.job;
  }

  async completeJob(input: CompleteOCRJobInput) {
    this.completedInput = input;
    this.pageProcessingStatus = 'COMPLETED';
    this.job = {
      ...this.mustGetJob(input.jobId),
      status: 'COMPLETED',
      extractedText: input.result.text,
      layout: input.result.layout,
      textLayer: input.result.textLayer,
      completedAt: new Date('2026-06-24T00:00:02.000Z'),
    };

    return this.job;
  }

  async failJob(input: FailOCRJobInput) {
    this.failedInput = input;
    this.pageProcessingStatus = 'FAILED';
    this.job = {
      ...this.mustGetJob(input.jobId),
      status: 'FAILED',
      errorCode: input.code,
      errorMessage: input.message,
      completedAt: new Date('2026-06-24T00:00:02.000Z'),
    };

    return this.job;
  }

  async getJob(jobId: string) {
    return this.job?.id === jobId ? this.job : null;
  }

  private mustGetJob(jobId: string) {
    if (!this.job || this.job.id !== jobId) {
      throw new Error(`Job ${jobId} was not found`);
    }

    return this.job;
  }
}

function createProvider(overrides: Partial<OCRProvider> = {}): OCRProvider {
  return {
    name: 'TESSERACT_CLI',
    async recognizePage() {
      return {
        text: 'Invoice total $42.00',
        layout: {
          schemaVersion: 1,
          provider: 'TESSERACT_CLI',
          blocks: [
            {
              lines: [
                {
                  text: 'Invoice total $42.00',
                  confidence: 98,
                  words: [],
                },
              ],
            },
          ],
        },
        textLayer: {
          schemaVersion: 1,
          source: 'ocr',
          lines: [
            {
              text: 'Invoice total $42.00',
              words: [],
            },
          ],
        },
      };
    },
    ...overrides,
  };
}

describe('OCRPipelineService', () => {
  it('creates, processes, and completes a page OCR job with layout metadata', async () => {
    const repository = new InMemoryOCRRepository({
      id: 'page_1',
      documentId: 'doc_1',
      originalImageUrl: 'C:\\tmp\\scan.jpg',
      croppedImageUrl: null,
      enhancedImageUrl: 'C:\\tmp\\scan-enhanced.jpg',
    });
    const service = new OCRPipelineService(repository, createProvider());

    const job = await service.startPageOCR({
      documentId: 'doc_1',
      pageId: 'page_1',
      language: 'eng',
    });

    expect(job.status).toBe('COMPLETED');
    expect(job.extractedText).toBe('Invoice total $42.00');
    expect(repository.pageProcessingStatus).toBe('COMPLETED');
    expect(repository.completedInput?.sourceImageUrl).toBe('C:\\tmp\\scan-enhanced.jpg');
    expect(repository.completedInput?.result.layout.blocks[0]?.lines[0]?.text).toBe('Invoice total $42.00');
  });

  it('falls back to the original image when enhanced image is unavailable', async () => {
    const repository = new InMemoryOCRRepository({
      id: 'page_1',
      documentId: 'doc_1',
      originalImageUrl: 'C:\\tmp\\scan.jpg',
      croppedImageUrl: null,
      enhancedImageUrl: null,
    });
    const service = new OCRPipelineService(repository, createProvider());

    await service.startPageOCR({
      documentId: 'doc_1',
      pageId: 'page_1',
    });

    expect(repository.completedInput?.sourceImageUrl).toBe('C:\\tmp\\scan.jpg');
    expect(repository.completedInput?.sourceImageRole).toBe('ORIGINAL');
  });

  it('uses the cropped image first through the scan source resolver', async () => {
    const repository = new InMemoryOCRRepository({
      id: 'page_1',
      documentId: 'doc_1',
      originalImageUrl: 'C:\\tmp\\scan.jpg',
      croppedImageUrl: 'C:\\tmp\\scan-cropped.jpg',
      enhancedImageUrl: 'C:\\tmp\\scan-enhanced.jpg',
    });
    const service = new OCRPipelineService(repository, createProvider());

    await service.startPageOCR({
      documentId: 'doc_1',
      pageId: 'page_1',
    });

    expect(repository.completedInput?.sourceImageUrl).toBe('C:\\tmp\\scan-cropped.jpg');
    expect(repository.completedInput?.sourceImageRole).toBe('CROPPED');
  });

  it('marks the job failed when the OCR provider fails', async () => {
    const repository = new InMemoryOCRRepository({
      id: 'page_1',
      documentId: 'doc_1',
      originalImageUrl: 'C:\\tmp\\scan.jpg',
      croppedImageUrl: null,
      enhancedImageUrl: null,
    });
    const service = new OCRPipelineService(
      repository,
      createProvider({
        async recognizePage() {
          throw new Error('tesseract is not installed');
        },
      }),
    );

    const job = await service.startPageOCR({
      documentId: 'doc_1',
      pageId: 'page_1',
    });

    expect(job.status).toBe('FAILED');
    expect(repository.pageProcessingStatus).toBe('FAILED');
    expect(repository.failedInput?.pageId).toBe('page_1');
    expect(job.errorCode).toBe('OCR_PROVIDER_FAILED');
    expect(job.errorMessage).toContain('tesseract is not installed');
  });

  it('rejects OCR when the page has no usable image source', async () => {
    const repository = new InMemoryOCRRepository({
      id: 'page_1',
      documentId: 'doc_1',
      originalImageUrl: null,
      croppedImageUrl: null,
      enhancedImageUrl: null,
    });
    const service = new OCRPipelineService(repository, createProvider());

    await expect(
      service.startPageOCR({
        documentId: 'doc_1',
        pageId: 'page_1',
      }),
    ).rejects.toMatchObject({
      code: 'PAGE_IMAGE_MISSING',
      statusCode: 409,
    });
  });
});
