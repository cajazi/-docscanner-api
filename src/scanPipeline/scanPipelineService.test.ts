import { describe, expect, it, vi } from 'vitest';
import type { EdgeDetectionService } from '../edgeDetection/edgeDetectionService';
import type { EdgeDetectionJobResponse } from '../edgeDetection/types';
import type { EnhancementService } from '../enhancement/enhancementService';
import type { EnhancementJobRecord } from '../enhancement/types';
import type { OCRPipelineService } from '../ocr/ocrPipelineService';
import type { OCRJobRecord } from '../ocr/types';
import { ScanSourceRole } from '../scanSource/types';
import type { SearchablePdfService } from '../searchablePdf/searchablePdfService';
import type { SearchablePdfTextLayer } from '../searchablePdf/types';
import { ScanPipelineService } from './scanPipelineService';

const now = new Date('2026-06-24T00:00:00.000Z');

describe('ScanPipelineService', () => {
  it('runs the full scan pipeline and updates searchable metadata', async () => {
    const context = createPipelineContext();
    const service = createService(context);

    const result = await service.processPage({ documentId: 'doc_1', pageId: 'page_1' });

    expect(context.calls).toEqual([
      'edge.create',
      'edge.process',
      'enhancement.create',
      'enhancement.process',
      'ocr.start',
      'searchable.build',
    ]);
    expect(result.completedStages).toEqual([
      'QUAD_DETECTION',
      'PERSPECTIVE_CORRECTION',
      'ENHANCEMENT',
      'OCR',
      'SEARCHABLE_METADATA',
    ]);
    expect(result.failedStages).toEqual([]);
    expect(result.fallbackStages).toEqual([]);
    expect(result.finalImageRole).toBe(ScanSourceRole.ENHANCED);
    expect(result.searchableReady).toBe(true);
    expect(result.processingDurationMs).toBeGreaterThanOrEqual(0);
    expect(service.getPipelineRun(result.pipelineId)).toBe(result);
  });

  it('records perspective fallback and continues through enhancement and OCR', async () => {
    const context = createPipelineContext({
      edgeCompleted: edgeJob({
        metadata: {
          result: {
            quadDetectionImplemented: true,
            quadDetectionSucceeded: true,
            perspectiveCorrectionImplemented: false,
            correctionFallbackUsed: true,
          },
        },
      }),
    });
    const service = createService(context);

    const result = await service.processPage({ documentId: 'doc_1', pageId: 'page_1' });

    expect(result.completedStages).toContain('QUAD_DETECTION');
    expect(result.completedStages).toContain('ENHANCEMENT');
    expect(result.completedStages).toContain('OCR');
    expect(result.fallbackStages).toContain('PERSPECTIVE_CORRECTION');
    expect(result.failedStages).toEqual([]);
    expect(result.searchableReady).toBe(true);
  });

  it('continues to OCR when enhancement fails', async () => {
    const context = createPipelineContext({
      enhancementCompleted: enhancementJob({
        status: 'FAILED',
        enhancedImageUrl: null,
        errorMessage: 'enhancement provider failed',
      }),
      ocrCompleted: ocrJob({ sourceImageRole: 'CROPPED' }),
    });
    const service = createService(context);

    const result = await service.processPage({ documentId: 'doc_1', pageId: 'page_1' });

    expect(context.calls).toContain('ocr.start');
    expect(result.completedStages).toContain('OCR');
    expect(result.failedStages).toEqual([
      {
        stage: 'ENHANCEMENT',
        errorMessage: 'enhancement provider failed',
      },
    ]);
    expect(result.fallbackStages).toContain('ENHANCEMENT');
    expect(result.finalImageRole).toBe(ScanSourceRole.CROPPED);
  });

  it('does not lose enhancement output when OCR fails', async () => {
    const context = createPipelineContext({
      ocrCompleted: ocrJob({
        status: 'FAILED',
        extractedText: null,
        errorCode: 'OCR_PROVIDER_FAILED',
        errorMessage: 'tesseract failed',
        sourceImageRole: 'ENHANCED',
      }),
    });
    const service = createService(context);

    const result = await service.processPage({ documentId: 'doc_1', pageId: 'page_1' });

    expect(result.completedStages).toContain('ENHANCEMENT');
    expect(result.completedStages).not.toContain('SEARCHABLE_METADATA');
    expect(context.calls).not.toContain('searchable.build');
    expect(result.failedStages).toEqual([
      {
        stage: 'OCR',
        errorMessage: 'tesseract failed',
      },
    ]);
    expect(result.finalImageRole).toBe(ScanSourceRole.ENHANCED);
    expect(result.searchableReady).toBe(false);
  });

  it('passes stage parameters that preserve scan-source resolver ownership', async () => {
    const context = createPipelineContext();
    const service = createService(context);

    await service.processPage({ documentId: 'doc_1', pageId: 'page_1', language: 'eng' });

    expect(context.edgeCreate).toHaveBeenCalledWith({
      documentId: 'doc_1',
      pageId: 'page_1',
      params: {
        perspectiveCorrection: true,
        outputCroppedImage: true,
      },
    });
    expect(context.enhancementCreate).toHaveBeenCalledWith({
      documentId: 'doc_1',
      pageId: 'page_1',
      params: {
        mode: 'document',
        perspectiveCorrection: false,
      },
    });
    expect(context.ocrStart).toHaveBeenCalledWith({
      documentId: 'doc_1',
      pageId: 'page_1',
      language: 'eng',
    });
  });
});

type PipelineContext = ReturnType<typeof createPipelineContext>;

function createPipelineContext(overrides: Partial<{
  edgeCreated: EdgeDetectionJobResponse;
  edgeCompleted: EdgeDetectionJobResponse | null;
  enhancementCreated: EnhancementJobRecord;
  enhancementCompleted: EnhancementJobRecord | null;
  ocrCompleted: OCRJobRecord;
  searchableTextLayer: SearchablePdfTextLayer;
}> = {}) {
  const calls: string[] = [];
  const edgeCreated = overrides.edgeCreated ?? edgeJob({ status: 'PENDING' });
  const edgeCompleted = overrides.edgeCompleted ?? edgeJob();
  const enhancementCreated = overrides.enhancementCreated ?? enhancementJob({ status: 'PENDING' });
  const enhancementCompleted = overrides.enhancementCompleted ?? enhancementJob();
  const ocrCompleted = overrides.ocrCompleted ?? ocrJob();
  const searchableTextLayer = overrides.searchableTextLayer ?? textLayer();

  const edgeCreate = vi.fn(async () => {
    calls.push('edge.create');
    return edgeCreated;
  });
  const edgeProcess = vi.fn(async () => {
    calls.push('edge.process');
    return edgeCompleted;
  });
  const enhancementCreate = vi.fn(async () => {
    calls.push('enhancement.create');
    return enhancementCreated;
  });
  const enhancementProcess = vi.fn(async () => {
    calls.push('enhancement.process');
    return enhancementCompleted;
  });
  const ocrStart = vi.fn(async () => {
    calls.push('ocr.start');
    return ocrCompleted;
  });
  const searchableBuild = vi.fn(async () => {
    calls.push('searchable.build');
    return searchableTextLayer;
  });

  return {
    calls,
    edgeCreate,
    edgeProcess,
    enhancementCreate,
    enhancementProcess,
    ocrStart,
    searchableBuild,
  };
}

function createService(context: PipelineContext) {
  return new ScanPipelineService({
    edgeDetectionService: {
      createJob: context.edgeCreate,
      processJob: context.edgeProcess,
    } as unknown as EdgeDetectionService,
    enhancementService: {
      createJob: context.enhancementCreate,
      processJob: context.enhancementProcess,
    } as unknown as EnhancementService,
    ocrPipelineService: {
      startPageOCR: context.ocrStart,
    } as unknown as OCRPipelineService,
    searchablePdfService: {
      buildTextLayer: context.searchableBuild,
    } as unknown as SearchablePdfService,
  });
}

function edgeJob(overrides: Partial<EdgeDetectionJobResponse> = {}): EdgeDetectionJobResponse {
  return {
    id: 'edge_job_1',
    pageId: 'page_1',
    status: 'COMPLETED',
    provider: 'contour',
    sourceImageUrl: 'original.jpg',
    croppedImageUrl: 'cropped.jpg',
    corners: {
      topLeft: { x: 0.1, y: 0.1 },
      topRight: { x: 0.9, y: 0.1 },
      bottomRight: { x: 0.9, y: 0.9 },
      bottomLeft: { x: 0.1, y: 0.9 },
    },
    confidence: 0.9,
    errorMessage: null,
    metadata: {
      result: {
        quadDetectionImplemented: true,
        quadDetectionSucceeded: true,
        perspectiveCorrectionImplemented: true,
      },
    },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function enhancementJob(overrides: Partial<EnhancementJobRecord> = {}): EnhancementJobRecord {
  return {
    id: 'enhancement_job_1',
    pageId: 'page_1',
    status: 'COMPLETED',
    provider: 'SHARP',
    originalImageUrl: 'cropped.jpg',
    enhancedImageUrl: 'enhanced.jpg',
    errorMessage: null,
    metadata: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function ocrJob(overrides: Partial<OCRJobRecord> = {}): OCRJobRecord {
  return {
    id: 'ocr_job_1',
    documentId: 'doc_1',
    pageId: 'page_1',
    provider: 'TESSERACT_CLI',
    status: 'COMPLETED',
    language: 'eng',
    sourceImageUrl: 'enhanced.jpg',
    sourceImageRole: 'ENHANCED',
    extractedText: 'Detected text',
    layout: {},
    textLayer: {},
    errorCode: null,
    errorMessage: null,
    startedAt: now,
    completedAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function textLayer(): SearchablePdfTextLayer {
  return {
    documentId: 'doc_1',
    pages: [
      {
        pageId: 'page_1',
        pageNumber: 1,
        text: 'Detected text',
        blocks: [],
        lines: [],
        words: [],
      },
    ],
    searchableText: 'Detected text',
    pageCount: 1,
  };
}
