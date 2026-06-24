import { describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import { OCRPipelineError, OCRPipelineService } from '../ocr/ocrPipelineService';
import type { OCRPipelineRepository, OCRProvider } from '../ocr/types';
import { EnhancementPipelineError, EnhancementService } from '../enhancement/enhancementService';
import type { EnhancementProvider, EnhancementRepository } from '../enhancement/types';
import { EdgeDetectionPipelineError, EdgeDetectionService } from '../edgeDetection/edgeDetectionService';
import type { EdgeDetectionProvider } from '../edgeDetection/providers/edgeDetectionProvider';
import type { EdgeDetectionRepository } from '../edgeDetection/types';
import { PdfExportPipelineError, PdfExportService } from '../pdfExport/pdfExportService';
import type { PdfExportProvider, PdfExportRepository } from '../pdfExport/types';
import { ScanPipelineService } from '../scanPipeline/scanPipelineService';
import type { SearchablePdfService } from '../searchablePdf/searchablePdfService';

function createOCRService(overrides: Partial<OCRPipelineService> = {}) {
  const repository = {} as OCRPipelineRepository;
  const provider = {} as OCRProvider;

  return Object.assign(new OCRPipelineService(repository, provider), overrides);
}

function createEnhancementService(overrides: Partial<EnhancementService> = {}) {
  const repository = {} as EnhancementRepository;
  const provider = {} as EnhancementProvider;

  return Object.assign(new EnhancementService(repository, provider), overrides);
}

function createEdgeDetectionService(overrides: Partial<EdgeDetectionService> = {}) {
  const repository = {} as EdgeDetectionRepository;
  const provider = {} as EdgeDetectionProvider;

  return Object.assign(new EdgeDetectionService(repository, provider), overrides);
}

function createPdfExportService(overrides: Partial<PdfExportService> = {}) {
  const repository = {} as PdfExportRepository;
  const provider = {} as PdfExportProvider;

  return Object.assign(new PdfExportService(repository, provider), overrides);
}

function createScanPipelineService(overrides: Partial<ScanPipelineService> = {}) {
  return Object.assign(
    new ScanPipelineService({
      edgeDetectionService: createEdgeDetectionService(),
      enhancementService: createEnhancementService(),
      ocrPipelineService: createOCRService(),
      searchablePdfService: {} as SearchablePdfService,
    }),
    overrides,
  );
}

describe('engineRoutes', () => {
  it('reports OCR, enhancement, edge detection, and PDF export pipeline capabilities', async () => {
    const app = await buildApp({
      ocrPipelineService: createOCRService(),
      enhancementService: createEnhancementService(),
      edgeDetectionService: createEdgeDetectionService(),
      pdfExportService: createPdfExportService(),
      scanPipelineService: createScanPipelineService(),
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
      enhancement: {
        providerAbstraction: true,
        provider: 'SHARP',
        jobLifecycle: true,
        atomicJobClaiming: true,
        pageLevelEnhancedImageStorage: true,
        modes: ['document', 'grayscale', 'color'],
        futureOcrReadyImageConsumption: true,
      },
      edgeDetection: {
        status: 'real-foundation',
        provider: 'contour',
        supportsFourCorners: true,
        supportsPerspectiveCorrection: false,
        supportsCroppedOutput: true,
        contourDetectionImplemented: true,
        quadDetectionImplemented: true,
        detectionMode: 'quad-capable-contour-foundation',
        perspectiveCorrectionImplemented: false,
      },
      pdfExport: {
        status: 'foundation',
        provider: 'pdf-lib',
        supportsImagePdf: true,
        supportsSearchablePdf: false,
        usesScanSourceResolver: true,
      },
      searchablePdf: {
        status: 'foundation',
        invisibleTextLayerImplemented: true,
        textLayerMetadataImplemented: true,
      },
      scanPipeline: {
        status: 'integrated',
        automaticSourceSelection: true,
        quadDetectionIntegrated: true,
        perspectiveIntegrated: true,
        enhancementIntegrated: true,
        ocrIntegrated: true,
        searchablePdfIntegrated: true,
      },
    });
  });

  it('starts page OCR through the pipeline service', async () => {
    const app = await buildApp({
      ocrPipelineService: createOCRService({
        async startPageOCR(input) {
          return {
            id: 'ocr_job_1',
            documentId: input.documentId,
            pageId: input.pageId,
            provider: 'TESSERACT_CLI',
            status: 'COMPLETED',
            language: input.language ?? 'eng',
            sourceImageUrl: 'C:\\tmp\\scan.jpg',
            sourceImageRole: 'ENHANCED',
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
      enhancementService: createEnhancementService(),
      edgeDetectionService: createEdgeDetectionService(),
      pdfExportService: createPdfExportService(),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/engine/documents/doc_1/pages/page_1/ocr-jobs',
      payload: {
        language: 'eng',
      },
    });

    await app.close();

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      job: {
        id: 'ocr_job_1',
        status: 'COMPLETED',
        extractedText: 'Detected text',
        sourceImageRole: 'ENHANCED',
      },
    });
  });

  it('translates OCR pipeline errors into API errors', async () => {
    const app = await buildApp({
      ocrPipelineService: createOCRService({
        async getJob() {
          throw new OCRPipelineError('OCR_JOB_NOT_FOUND', 'OCR job was not found', 404);
        },
      }),
      enhancementService: createEnhancementService(),
      edgeDetectionService: createEdgeDetectionService(),
      pdfExportService: createPdfExportService(),
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

  it('starts page enhancement through the enhancement service', async () => {
    const app = await buildApp({
      ocrPipelineService: createOCRService(),
      enhancementService: createEnhancementService({
        async createJob(input) {
          return {
            id: 'enhancement_job_1',
            pageId: input.pageId,
            status: 'PENDING',
            provider: 'SHARP',
            originalImageUrl: 'C:\\tmp\\scan.jpg',
            enhancedImageUrl: null,
            errorMessage: null,
            metadata: {
              params: input.params,
            },
            createdAt: new Date('2026-06-24T00:00:00.000Z'),
            updatedAt: new Date('2026-06-24T00:00:00.000Z'),
          };
        },
      }),
      edgeDetectionService: createEdgeDetectionService(),
      pdfExportService: createPdfExportService(),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/engine/documents/doc_1/pages/page_1/enhancement-jobs',
      payload: {
        params: {
          mode: 'grayscale',
          brightness: 1.1,
          contrast: 1.15,
          deskew: true,
          perspectiveCorrection: true,
        },
      },
    });

    await app.close();

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      job: {
        id: 'enhancement_job_1',
        status: 'PENDING',
        provider: 'SHARP',
      },
    });
  });

  it('gets enhancement job status through the enhancement service', async () => {
    const app = await buildApp({
      ocrPipelineService: createOCRService(),
      enhancementService: createEnhancementService({
        async getJob(jobId) {
          return {
            id: jobId,
            pageId: 'page_1',
            status: 'COMPLETED',
            provider: 'SHARP',
            originalImageUrl: 'C:\\tmp\\scan.jpg',
            enhancedImageUrl: 'C:\\tmp\\enhanced.jpg',
            errorMessage: null,
            metadata: {
              result: {
                outputQuality: 92,
              },
            },
            createdAt: new Date('2026-06-24T00:00:00.000Z'),
            updatedAt: new Date('2026-06-24T00:00:01.000Z'),
          };
        },
      }),
      edgeDetectionService: createEdgeDetectionService(),
      pdfExportService: createPdfExportService(),
    });

    const response = await app.inject({
      method: 'GET',
      url: '/engine/enhancement-jobs/enhancement_job_1',
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      job: {
        id: 'enhancement_job_1',
        status: 'COMPLETED',
        enhancedImageUrl: 'C:\\tmp\\enhanced.jpg',
      },
    });
  });

  it('translates enhancement pipeline errors into API errors', async () => {
    const app = await buildApp({
      ocrPipelineService: createOCRService(),
      enhancementService: createEnhancementService({
        async getJob() {
          throw new EnhancementPipelineError('ENHANCEMENT_JOB_NOT_FOUND', 'Enhancement job was not found', 404);
        },
      }),
      edgeDetectionService: createEdgeDetectionService(),
      pdfExportService: createPdfExportService(),
    });

    const response = await app.inject({
      method: 'GET',
      url: '/engine/enhancement-jobs/missing',
    });

    await app.close();

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: {
        code: 'ENHANCEMENT_JOB_NOT_FOUND',
        message: 'Enhancement job was not found',
      },
    });
  });

  it('starts page edge detection through the edge detection service', async () => {
    const app = await buildApp({
      ocrPipelineService: createOCRService(),
      enhancementService: createEnhancementService(),
      edgeDetectionService: createEdgeDetectionService({
        async createJob(input) {
          return {
            id: 'edge_job_1',
            pageId: input.pageId,
            status: 'PENDING',
            provider: 'heuristic',
            sourceImageUrl: 'C:\\tmp\\original.jpg',
            croppedImageUrl: null,
            corners: null,
            confidence: null,
            errorMessage: null,
            metadata: {
              params: input.params,
            },
            createdAt: new Date('2026-06-24T00:00:00.000Z'),
            updatedAt: new Date('2026-06-24T00:00:00.000Z'),
          };
        },
      }),
      pdfExportService: createPdfExportService(),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/engine/documents/doc_1/pages/page_1/edge-detection-jobs',
      payload: {
        params: {
          perspectiveCorrection: true,
          outputCroppedImage: true,
        },
      },
    });

    await app.close();

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      job: {
        id: 'edge_job_1',
        status: 'PENDING',
        provider: 'heuristic',
      },
    });
  });

  it('gets edge detection job status through the edge detection service', async () => {
    const app = await buildApp({
      ocrPipelineService: createOCRService(),
      enhancementService: createEnhancementService(),
      edgeDetectionService: createEdgeDetectionService({
        async getJob(jobId) {
          return {
            id: jobId,
            pageId: 'page_1',
            status: 'COMPLETED',
            provider: 'heuristic',
            sourceImageUrl: 'C:\\tmp\\original.jpg',
            croppedImageUrl: 'C:\\tmp\\cropped.jpg',
            corners: {
              topLeft: { x: 0, y: 0 },
              topRight: { x: 1, y: 0 },
              bottomRight: { x: 1, y: 1 },
              bottomLeft: { x: 0, y: 1 },
            },
            confidence: 0.5,
            errorMessage: null,
            metadata: {
              result: {
                edgeDetectionMode: 'full-page-placeholder',
              },
            },
            createdAt: new Date('2026-06-24T00:00:00.000Z'),
            updatedAt: new Date('2026-06-24T00:00:01.000Z'),
          };
        },
      }),
      pdfExportService: createPdfExportService(),
    });

    const response = await app.inject({
      method: 'GET',
      url: '/engine/edge-detection-jobs/edge_job_1',
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      job: {
        id: 'edge_job_1',
        status: 'COMPLETED',
        croppedImageUrl: 'C:\\tmp\\cropped.jpg',
        confidence: 0.5,
      },
    });
  });

  it('translates edge detection missing-job errors into API errors', async () => {
    const app = await buildApp({
      ocrPipelineService: createOCRService(),
      enhancementService: createEnhancementService(),
      edgeDetectionService: createEdgeDetectionService({
        async getJob() {
          throw new EdgeDetectionPipelineError('EDGE_DETECTION_JOB_NOT_FOUND', 'Edge detection job was not found', 404);
        },
      }),
      pdfExportService: createPdfExportService(),
    });

    const response = await app.inject({
      method: 'GET',
      url: '/engine/edge-detection-jobs/missing',
    });

    await app.close();

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: {
        code: 'EDGE_DETECTION_JOB_NOT_FOUND',
        message: 'Edge detection job was not found',
      },
    });
  });

  it('processes a page through the integrated scan pipeline service', async () => {
    const app = await buildApp({
      ocrPipelineService: createOCRService(),
      enhancementService: createEnhancementService(),
      edgeDetectionService: createEdgeDetectionService(),
      pdfExportService: createPdfExportService(),
      scanPipelineService: createScanPipelineService({
        async processPage(input) {
          return {
            pipelineId: 'pipeline_1',
            documentId: input.documentId,
            pageId: input.pageId,
            pipelineVersion: 'scan-pipeline-v1',
            completedStages: ['QUAD_DETECTION', 'ENHANCEMENT', 'OCR', 'SEARCHABLE_METADATA'],
            failedStages: [],
            fallbackStages: ['PERSPECTIVE_CORRECTION'],
            finalImageRole: 'ENHANCED',
            processingDurationMs: 12,
            searchableReady: true,
            edgeDetectionJob: null,
            enhancementJob: null,
            ocrJob: null,
            searchableTextLayer: null,
          };
        },
      }),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/engine/documents/doc_1/pages/page_1/process',
    });

    await app.close();

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({
      pipelineId: 'pipeline_1',
      completedStages: ['QUAD_DETECTION', 'ENHANCEMENT', 'OCR', 'SEARCHABLE_METADATA'],
      failedStages: [],
      finalImageRole: 'ENHANCED',
      searchableReady: true,
    });
  });

  it('starts PDF export through the PDF export service', async () => {
    const app = await buildApp({
      ocrPipelineService: createOCRService(),
      enhancementService: createEnhancementService(),
      edgeDetectionService: createEdgeDetectionService(),
      pdfExportService: createPdfExportService({
        async createJob(input) {
          return {
            id: 'pdf_export_job_1',
            documentId: input.documentId,
            status: 'PENDING',
            provider: 'pdf-lib',
            outputPdfUrl: null,
            pageCount: null,
            errorMessage: null,
            metadata: {
              options: input.options,
            },
            createdAt: new Date('2026-06-24T00:00:00.000Z'),
            updatedAt: new Date('2026-06-24T00:00:00.000Z'),
          };
        },
      }),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/engine/documents/doc_1/pdf-export-jobs',
      payload: {
        options: {
          searchable: true,
          pageSize: 'A4',
          includeOcrTextLayer: true,
        },
      },
    });

    await app.close();

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      job: {
        id: 'pdf_export_job_1',
        status: 'PENDING',
        provider: 'pdf-lib',
      },
    });
  });

  it('gets PDF export job status through the PDF export service', async () => {
    const app = await buildApp({
      ocrPipelineService: createOCRService(),
      enhancementService: createEnhancementService(),
      edgeDetectionService: createEdgeDetectionService(),
      pdfExportService: createPdfExportService({
        async getJob(jobId) {
          return {
            id: jobId,
            documentId: 'doc_1',
            status: 'COMPLETED',
            provider: 'pdf-lib',
            outputPdfUrl: 'C:\\tmp\\pdf-exports\\doc_1\\pdf_export_job_1.pdf',
            pageCount: 2,
            errorMessage: null,
            metadata: {
              result: {
                searchablePdfImplemented: false,
              },
            },
            createdAt: new Date('2026-06-24T00:00:00.000Z'),
            updatedAt: new Date('2026-06-24T00:00:01.000Z'),
          };
        },
      }),
    });

    const response = await app.inject({
      method: 'GET',
      url: '/engine/pdf-export-jobs/pdf_export_job_1',
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      job: {
        id: 'pdf_export_job_1',
        status: 'COMPLETED',
        outputPdfUrl: 'C:\\tmp\\pdf-exports\\doc_1\\pdf_export_job_1.pdf',
        pageCount: 2,
      },
    });
  });

  it('translates PDF export missing-job errors into API errors', async () => {
    const app = await buildApp({
      ocrPipelineService: createOCRService(),
      enhancementService: createEnhancementService(),
      edgeDetectionService: createEdgeDetectionService(),
      pdfExportService: createPdfExportService({
        async getJob() {
          throw new PdfExportPipelineError('PDF_EXPORT_JOB_NOT_FOUND', 'PDF export job was not found', 404);
        },
      }),
    });

    const response = await app.inject({
      method: 'GET',
      url: '/engine/pdf-export-jobs/missing',
    });

    await app.close();

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: {
        code: 'PDF_EXPORT_JOB_NOT_FOUND',
        message: 'PDF export job was not found',
      },
    });
  });
});
