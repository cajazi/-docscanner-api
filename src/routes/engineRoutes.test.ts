import { describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import { OCRPipelineError, OCRPipelineService } from '../ocr/ocrPipelineService';
import type { OCRPipelineRepository, OCRProvider } from '../ocr/types';

function createService(overrides: Partial<OCRPipelineService> = {}) {
  const repository = {} as OCRPipelineRepository;
  const provider = {} as OCRProvider;

  return Object.assign(new OCRPipelineService(repository, provider), overrides);
}

describe('engineRoutes', () => {
  it('reports OCR pipeline capabilities', async () => {
    const app = await buildApp({
      ocrPipelineService: createService(),
    });

    const response = await app.inject({
      method: 'GET',
      url: '/engine/capabilities',
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      nonNegotiableParity: true,
      ocr: {
        providerAbstraction: true,
        jobLifecycle: true,
        pageLevelTextStorage: true,
        futureSearchablePdfTextLayer: true,
      },
    });
  });

  it('starts page OCR through the pipeline service', async () => {
    const app = await buildApp({
      ocrPipelineService: createService({
        async startPageOCR(input) {
          return {
            id: 'ocr_job_1',
            documentId: input.documentId,
            pageId: input.pageId,
            provider: 'TESSERACT_CLI',
            status: 'COMPLETED',
            language: input.language ?? 'eng',
            sourceImageUrl: input.sourceImageUrl ?? 'C:\\tmp\\scan.jpg',
            sourceImageRole: input.sourceImageRole ?? 'ENHANCED',
            extractedText: 'Detected text',
            errorCode: null,
            errorMessage: null,
            startedAt: new Date('2026-06-24T00:00:00.000Z'),
            completedAt: new Date('2026-06-24T00:00:01.000Z'),
            createdAt: new Date('2026-06-24T00:00:00.000Z'),
            updatedAt: new Date('2026-06-24T00:00:01.000Z'),
          };
        },
      }),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/engine/documents/doc_1/pages/page_1/ocr-jobs',
      payload: {
        language: 'eng',
        sourceImageRole: 'ORIGINAL',
        sourceImageUrl: 'C:\\tmp\\scan.jpg',
      },
    });

    await app.close();

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      job: {
        id: 'ocr_job_1',
        status: 'COMPLETED',
        extractedText: 'Detected text',
        sourceImageRole: 'ORIGINAL',
      },
    });
  });

  it('translates OCR pipeline errors into API errors', async () => {
    const app = await buildApp({
      ocrPipelineService: createService({
        async getJob() {
          throw new OCRPipelineError('OCR_JOB_NOT_FOUND', 'OCR job was not found', 404);
        },
      }),
    });

    const response = await app.inject({
      method: 'GET',
      url: '/engine/ocr-jobs/missing',
    });

    await app.close();

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: {
        code: 'OCR_JOB_NOT_FOUND',
        message: 'OCR job was not found',
      },
    });
  });
});
