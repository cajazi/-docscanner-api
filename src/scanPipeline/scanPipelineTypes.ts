import type { EdgeDetectionJobResponse } from '../edgeDetection/types';
import type { EnhancementJobRecord } from '../enhancement/types';
import type { OCRJobRecord } from '../ocr/types';
import type { ScanSourceRole } from '../scanSource/types';
import type { SearchablePdfTextLayer } from '../searchablePdf/types';

export type ScanPipelineStage =
  | 'QUAD_DETECTION'
  | 'PERSPECTIVE_CORRECTION'
  | 'ENHANCEMENT'
  | 'OCR'
  | 'SEARCHABLE_METADATA';

export type ProcessPageInput = {
  documentId: string;
  pageId: string;
  language?: string;
};

export type StageFailure = {
  stage: ScanPipelineStage;
  errorMessage: string;
};

export type ScanPipelineMetadata = {
  pipelineVersion: 'scan-pipeline-v1';
  completedStages: ScanPipelineStage[];
  failedStages: StageFailure[];
  fallbackStages: ScanPipelineStage[];
  finalImageRole: ScanSourceRole | null;
  processingDurationMs: number;
};

export type ScanPipelineResult = ScanPipelineMetadata & {
  pipelineId: string;
  documentId: string;
  pageId: string;
  searchableReady: boolean;
  edgeDetectionJob: EdgeDetectionJobResponse | null;
  enhancementJob: EnhancementJobRecord | null;
  ocrJob: OCRJobRecord | null;
  searchableTextLayer: SearchablePdfTextLayer | null;
};

export type ProcessPageResponse = {
  pipelineId: string;
  completedStages: ScanPipelineStage[];
  failedStages: StageFailure[];
  finalImageRole: ScanSourceRole | null;
  searchableReady: boolean;
};
