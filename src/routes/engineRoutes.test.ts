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
import { ScanPipelineError, ScanPipelineService } from '../scanPipeline/scanPipelineService';
import type { ScanPipelineResult } from '../scanPipeline/scanPipelineTypes';
import type { SearchablePdfService } from '../searchablePdf/searchablePdfService';
import { UploadContractError, type UploadContractService } from '../uploadContract/uploadContractService';

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

function createUploadContractService(overrides: Partial<UploadContractService> = {}) {
  return Object.assign(
    {
      async createDocument() {
        throw new Error('createDocument was not mocked');
      },
      async storeImage() {
        throw new Error('storeImage was not mocked');
      },
      async createPage() {
        throw new Error('createPage was not mocked');
      },
    } as unknown as UploadContractService,
    overrides,
  );
}

function createMultipartPayload(input: { fieldName?: string; filename: string; mimeType: string; content: Buffer }) {
  const boundary = `----docscanner-${Math.random().toString(16).slice(2)}`;
  const head = Buffer.from(
    [
      `--${boundary}`,
      `Content-Disposition: form-data; name="${input.fieldName ?? 'file'}"; filename="${input.filename}"`,
      `Content-Type: ${input.mimeType}`,
      '',
      '',
    ].join('\r\n'),
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);

  return {
    payload: Buffer.concat([head, input.content, tail]),
    headers: {
      'content-type': `multipart/form-data; boundary=${boundary}`,
    },
  };
}

const processJobUpdatedAt = new Date('2026-06-25T10:00:02.000Z');

function createProcessRun(overrides: Partial<ScanPipelineResult> = {}): ScanPipelineResult {
  return {
    pipelineId: 'pipeline_1',
    documentId: 'doc_1',
    pageId: 'page_1',
    pipelineVersion: 'scan-pipeline-v1',
    completedStages: ['QUAD_DETECTION', 'ENHANCEMENT', 'OCR', 'SEARCHABLE_METADATA'],
    failedStages: [],
    fallbackStages: [],
    finalImageRole: 'ENHANCED' as ScanPipelineResult['finalImageRole'],
    processingDurationMs: 12,
    searchableReady: true,
    edgeDetectionJob: null,
    enhancementJob: null,
    ocrJob: null,
    searchableTextLayer: null,
    ...overrides,
  };
}

function createProcessEdgeJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'edge_job_1',
    pageId: 'page_1',
    status: 'COMPLETED',
    provider: 'cv',
    sourceImageUrl: 'original.jpg',
    croppedImageUrl: 'cropped.jpg',
    corners: null,
    confidence: null,
    errorMessage: null,
    metadata: {},
    createdAt: new Date('2026-06-25T10:00:00.000Z'),
    updatedAt: processJobUpdatedAt,
    ...overrides,
  } as ScanPipelineResult['edgeDetectionJob'];
}

function createProcessEnhancementJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'enhancement_job_1',
    pageId: 'page_1',
    status: 'COMPLETED',
    provider: 'SHARP',
    originalImageUrl: 'cropped.jpg',
    enhancedImageUrl: 'enhanced.jpg',
    errorMessage: null,
    metadata: {
      sourceRole: 'CROPPED',
    },
    createdAt: new Date('2026-06-25T10:00:00.000Z'),
    updatedAt: processJobUpdatedAt,
    ...overrides,
  } as ScanPipelineResult['enhancementJob'];
}

describe('engineRoutes', () => {
  it('creates a document through the upload contract service', async () => {
    const app = await buildApp({
      ocrPipelineService: createOCRService(),
      enhancementService: createEnhancementService(),
      edgeDetectionService: createEdgeDetectionService(),
      pdfExportService: createPdfExportService(),
      scanPipelineService: createScanPipelineService(),
      uploadContractService: createUploadContractService({
        async createDocument(input) {
          return {
            id: 'doc_1',
            title: input.title ?? 'Untitled document',
            createdAt: new Date('2026-06-25T10:00:00.000Z'),
          };
        },
      }),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/engine/documents',
      payload: {
        title: 'Receipt',
      },
    });

    await app.close();

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      id: 'doc_1',
      title: 'Receipt',
      createdAt: '2026-06-25T10:00:00.000Z',
    });
  });

  it('rejects non-image uploads', async () => {
    const app = await buildApp({
      ocrPipelineService: createOCRService(),
      enhancementService: createEnhancementService(),
      edgeDetectionService: createEdgeDetectionService(),
      pdfExportService: createPdfExportService(),
      scanPipelineService: createScanPipelineService(),
      uploadContractService: createUploadContractService(),
    });
    const multipart = createMultipartPayload({
      filename: 'notes.txt',
      mimeType: 'text/plain',
      content: Buffer.from('not an image'),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/engine/uploads/images',
      ...multipart,
    });

    await app.close();

    expect(response.statusCode).toBe(415);
    expect(response.json()).toEqual({
      error: {
        code: 'UNSUPPORTED_IMAGE_TYPE',
        message: 'Only JPEG, PNG, and WebP images are supported',
      },
    });
  });

  it.each([
    ['image/jpeg', 'scan.jpg'],
    ['image/png', 'scan.png'],
    ['image/webp', 'scan.webp'],
  ])('accepts %s image uploads', async (mimeType, filename) => {
    const app = await buildApp({
      ocrPipelineService: createOCRService(),
      enhancementService: createEnhancementService(),
      edgeDetectionService: createEdgeDetectionService(),
      pdfExportService: createPdfExportService(),
      scanPipelineService: createScanPipelineService(),
      uploadContractService: createUploadContractService({
        async storeImage(input) {
          return {
            storagePath: `C:\\tmp\\docscanner-api\\uploads\\${input.originalFilename}`,
            mimeType: input.mimeType,
            sizeBytes: input.data.length,
            originalFilename: input.originalFilename,
          };
        },
      }),
    });
    const multipart = createMultipartPayload({
      filename,
      mimeType,
      content: Buffer.from([1, 2, 3]),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/engine/uploads/images',
      ...multipart,
    });

    await app.close();

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      storagePath: `C:\\tmp\\docscanner-api\\uploads\\${filename}`,
      mimeType,
      sizeBytes: 3,
      originalFilename: filename,
    });
  });

  it('creates a page linked to an uploaded original image', async () => {
    const app = await buildApp({
      ocrPipelineService: createOCRService(),
      enhancementService: createEnhancementService(),
      edgeDetectionService: createEdgeDetectionService(),
      pdfExportService: createPdfExportService(),
      scanPipelineService: createScanPipelineService(),
      uploadContractService: createUploadContractService({
        async createPage(input) {
          return {
            id: 'page_1',
            documentId: input.documentId,
            pageNumber: 1,
            originalImageUrl: input.storagePath,
            croppedImageUrl: null,
            enhancedImageUrl: null,
          };
        },
      }),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/engine/documents/doc_1/pages',
      payload: {
        storagePath: 'C:\\tmp\\docscanner-api\\uploads\\scan.jpg',
        type: 'ORIGINAL',
      },
    });

    await app.close();

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      id: 'page_1',
      documentId: 'doc_1',
      pageNumber: 1,
      originalImageUrl: 'C:\\tmp\\docscanner-api\\uploads\\scan.jpg',
      croppedImageUrl: null,
      enhancedImageUrl: null,
    });
  });

  it('returns 404 when creating a page for a missing document', async () => {
    const app = await buildApp({
      ocrPipelineService: createOCRService(),
      enhancementService: createEnhancementService(),
      edgeDetectionService: createEdgeDetectionService(),
      pdfExportService: createPdfExportService(),
      scanPipelineService: createScanPipelineService(),
      uploadContractService: createUploadContractService({
        async createPage() {
          throw new UploadContractError('DOCUMENT_NOT_FOUND', 'Document was not found', 404);
        },
      }),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/engine/documents/missing/pages',
      payload: {
        storagePath: 'C:\\tmp\\docscanner-api\\uploads\\scan.jpg',
        type: 'ORIGINAL',
      },
    });

    await app.close();

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: {
        code: 'DOCUMENT_NOT_FOUND',
        message: 'Document was not found',
      },
    });
  });

  it('returns validation errors for invalid upload contract requests', async () => {
    const app = await buildApp({
      ocrPipelineService: createOCRService(),
      enhancementService: createEnhancementService(),
      edgeDetectionService: createEdgeDetectionService(),
      pdfExportService: createPdfExportService(),
      scanPipelineService: createScanPipelineService(),
      uploadContractService: createUploadContractService(),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/engine/documents/doc_1/pages',
      payload: {
        storagePath: '',
        type: 'CROPPED',
      },
    });

    await app.close();

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
      },
    });
  });

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
        provider: 'SHARP_V2',
        jobLifecycle: true,
        atomicJobClaiming: true,
        pageLevelEnhancedImageStorage: true,
        v2Implemented: true,
        modes: ['AUTO', 'COLOR', 'GRAYSCALE', 'BLACK_WHITE', 'MAGIC_COLOR', 'DOCUMENT'],
        shadowCorrectionFoundation: true,
        adaptiveThresholdFoundation: true,
        blurDetectionImplemented: true,
        futureOcrReadyImageConsumption: true,
      },
      edgeDetection: {
        status: 'real-foundation',
        provider: 'typescript-cv',
        supportsFourCorners: true,
        supportsPerspectiveCorrection: false,
        supportsCroppedOutput: true,
        contourDetectionImplemented: true,
        quadDetectionImplemented: true,
        cvPipelineImplemented: true,
        nativeOpenCvImplemented: false,
        detectionMode: 'cv-pipeline-foundation',
        perspectiveCorrectionImplemented: false,
      },
      cvPipeline: {
        nativeOpenCvImplemented: false,
        nativeAvailable: false,
        provider: 'typescript-cv',
        fallbackSupported: true,
        opencvVersion: null,
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

  it('gets process job status through the scan pipeline service', async () => {
    const app = await buildApp({
      ocrPipelineService: createOCRService(),
      enhancementService: createEnhancementService(),
      edgeDetectionService: createEdgeDetectionService(),
      pdfExportService: createPdfExportService(),
      scanPipelineService: createScanPipelineService({
        getPipelineRun(jobId) {
          return createProcessRun({
            pipelineId: jobId,
            fallbackStages: ['PERSPECTIVE_CORRECTION'],
            edgeDetectionJob: createProcessEdgeJob({ updatedAt: new Date('2026-06-25T10:00:01.000Z') }),
            enhancementJob: createProcessEnhancementJob({ updatedAt: new Date('2026-06-25T10:00:01.000Z') }),
          });
        },
      }),
    });

    const response = await app.inject({
      method: 'GET',
      url: '/engine/process-jobs/pipeline_1',
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      id: 'pipeline_1',
      status: 'COMPLETED',
      completedStages: ['QUAD_DETECTION', 'ENHANCEMENT', 'OCR', 'SEARCHABLE_METADATA'],
      failedStages: [],
      fallbackStages: ['PERSPECTIVE_CORRECTION'],
      finalImageRole: 'ENHANCED',
      originalImageUrl: 'original.jpg',
      croppedImageUrl: 'cropped.jpg',
      enhancedImageUrl: 'enhanced.jpg',
      processedImageUrl: 'enhanced.jpg',
      searchableReady: true,
      errorMessage: null,
      updatedAt: '2026-06-25T10:00:01.000Z',
    });
  });

  it('returns enhancedImageUrl as processedImageUrl for completed process jobs', async () => {
    const app = await buildApp({
      ocrPipelineService: createOCRService(),
      enhancementService: createEnhancementService(),
      edgeDetectionService: createEdgeDetectionService(),
      pdfExportService: createPdfExportService(),
      scanPipelineService: createScanPipelineService({
        getPipelineRun() {
          return createProcessRun({
            edgeDetectionJob: createProcessEdgeJob(),
            enhancementJob: createProcessEnhancementJob(),
          });
        },
      }),
    });

    const response = await app.inject({
      method: 'GET',
      url: '/engine/process-jobs/pipeline_1',
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      originalImageUrl: 'original.jpg',
      croppedImageUrl: 'cropped.jpg',
      enhancedImageUrl: 'enhanced.jpg',
      processedImageUrl: 'enhanced.jpg',
      finalImageRole: 'ENHANCED',
    });
  });

  it('falls back to croppedImageUrl when enhancedImageUrl is missing', async () => {
    const app = await buildApp({
      ocrPipelineService: createOCRService(),
      enhancementService: createEnhancementService(),
      edgeDetectionService: createEdgeDetectionService(),
      pdfExportService: createPdfExportService(),
      scanPipelineService: createScanPipelineService({
        getPipelineRun() {
          return createProcessRun({
            edgeDetectionJob: createProcessEdgeJob(),
            enhancementJob: createProcessEnhancementJob({
              status: 'FAILED',
              enhancedImageUrl: null,
              errorMessage: 'enhancement failed',
            }),
          });
        },
      }),
    });

    const response = await app.inject({
      method: 'GET',
      url: '/engine/process-jobs/pipeline_1',
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      originalImageUrl: 'original.jpg',
      croppedImageUrl: 'cropped.jpg',
      enhancedImageUrl: null,
      processedImageUrl: 'cropped.jpg',
      finalImageRole: 'CROPPED',
    });
  });

  it('falls back to originalImageUrl when cropped and enhanced URLs are missing', async () => {
    const app = await buildApp({
      ocrPipelineService: createOCRService(),
      enhancementService: createEnhancementService(),
      edgeDetectionService: createEdgeDetectionService(),
      pdfExportService: createPdfExportService(),
      scanPipelineService: createScanPipelineService({
        getPipelineRun() {
          return createProcessRun({
            edgeDetectionJob: createProcessEdgeJob({ croppedImageUrl: null }),
            enhancementJob: null,
          });
        },
      }),
    });

    const response = await app.inject({
      method: 'GET',
      url: '/engine/process-jobs/pipeline_1',
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      originalImageUrl: 'original.jpg',
      croppedImageUrl: null,
      enhancedImageUrl: null,
      processedImageUrl: 'original.jpg',
      finalImageRole: 'ORIGINAL',
    });
  });

  it('returns null processedImageUrl when no image URL exists', async () => {
    const app = await buildApp({
      ocrPipelineService: createOCRService(),
      enhancementService: createEnhancementService(),
      edgeDetectionService: createEdgeDetectionService(),
      pdfExportService: createPdfExportService(),
      scanPipelineService: createScanPipelineService({
        getPipelineRun() {
          return createProcessRun({
            finalImageRole: 'ORIGINAL' as ScanPipelineResult['finalImageRole'],
            edgeDetectionJob: null,
            enhancementJob: null,
            ocrJob: null,
          });
        },
      }),
    });

    const response = await app.inject({
      method: 'GET',
      url: '/engine/process-jobs/pipeline_1',
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      originalImageUrl: null,
      croppedImageUrl: null,
      enhancedImageUrl: null,
      processedImageUrl: null,
      finalImageRole: null,
    });
  });

  it('returns 404 when process job status is missing', async () => {
    const app = await buildApp({
      ocrPipelineService: createOCRService(),
      enhancementService: createEnhancementService(),
      edgeDetectionService: createEdgeDetectionService(),
      pdfExportService: createPdfExportService(),
      scanPipelineService: createScanPipelineService({
        getPipelineRun() {
          throw new ScanPipelineError('SCAN_PIPELINE_NOT_FOUND', 'Scan pipeline run was not found', 404);
        },
      }),
    });

    const response = await app.inject({
      method: 'GET',
      url: '/engine/process-jobs/missing',
    });

    await app.close();

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: {
        code: 'SCAN_PIPELINE_NOT_FOUND',
        message: 'Scan pipeline run was not found',
      },
    });
  });

  it('returns the Android process job response shape for failed runs', async () => {
    const app = await buildApp({
      ocrPipelineService: createOCRService(),
      enhancementService: createEnhancementService(),
      edgeDetectionService: createEdgeDetectionService(),
      pdfExportService: createPdfExportService(),
      scanPipelineService: createScanPipelineService({
        getPipelineRun(jobId) {
          return createProcessRun({
            pipelineId: jobId,
            completedStages: ['QUAD_DETECTION'],
            failedStages: [{ stage: 'OCR', errorMessage: 'OCR failed' }],
            fallbackStages: ['PERSPECTIVE_CORRECTION'],
            searchableReady: false,
            edgeDetectionJob: createProcessEdgeJob(),
            enhancementJob: null,
            ocrJob: {
              id: 'ocr_job_1',
              documentId: 'doc_1',
              pageId: 'page_1',
              provider: 'TESSERACT_CLI',
              status: 'FAILED',
              language: 'eng',
              sourceImageUrl: 'cropped.jpg',
              sourceImageRole: 'CROPPED',
              extractedText: null,
              layout: null,
              textLayer: null,
              errorCode: 'OCR_FAILED',
              errorMessage: 'OCR failed',
              startedAt: new Date('2026-06-25T10:00:00.000Z'),
              completedAt: new Date('2026-06-25T10:00:02.000Z'),
              createdAt: new Date('2026-06-25T10:00:00.000Z'),
              updatedAt: new Date('2026-06-25T10:00:02.000Z'),
            },
            searchableTextLayer: null,
          });
        },
      }),
    });

    const response = await app.inject({
      method: 'GET',
      url: '/engine/process-jobs/pipeline_failed',
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    expect(Object.keys(response.json())).toEqual([
      'id',
      'status',
      'completedStages',
      'failedStages',
      'fallbackStages',
      'finalImageRole',
      'originalImageUrl',
      'croppedImageUrl',
      'enhancedImageUrl',
      'processedImageUrl',
      'searchableReady',
      'errorMessage',
      'updatedAt',
    ]);
    expect(response.json()).toMatchObject({
      id: 'pipeline_failed',
      status: 'FAILED',
      completedStages: ['QUAD_DETECTION'],
      failedStages: [{ stage: 'OCR', errorMessage: 'OCR failed' }],
      fallbackStages: ['PERSPECTIVE_CORRECTION'],
      finalImageRole: 'CROPPED',
      originalImageUrl: 'original.jpg',
      croppedImageUrl: 'cropped.jpg',
      enhancedImageUrl: null,
      processedImageUrl: 'cropped.jpg',
      searchableReady: false,
      errorMessage: 'OCR failed',
      updatedAt: '2026-06-25T10:00:02.000Z',
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
