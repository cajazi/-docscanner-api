export type ProcessingStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type OCRProviderName = 'TESSERACT_CLI';
export type OCRImageRole = 'ORIGINAL' | 'ENHANCED' | 'CROPPED';

export type OCRWord = {
  text: string;
  confidence: number | null;
  boundingBox: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
};

export type OCRLine = {
  text: string;
  confidence: number | null;
  words: OCRWord[];
};

export type OCRBlock = {
  lines: OCRLine[];
};

export type OCRLayout = {
  schemaVersion: 1;
  provider: OCRProviderName;
  blocks: OCRBlock[];
};

export type OCRTextLayer = {
  schemaVersion: 1;
  source: 'ocr';
  lines: Array<{
    text: string;
    words: OCRWord[];
  }>;
};

export type OCRProviderInput = {
  imageUri: string;
  language: string;
};

export type OCRProviderResult = {
  text: string;
  layout: OCRLayout;
  textLayer: OCRTextLayer;
};

export interface OCRProvider {
  readonly name: OCRProviderName;
  recognizePage(input: OCRProviderInput): Promise<OCRProviderResult>;
}

export type PageOCRTarget = {
  id: string;
  documentId: string;
  originalImageUrl: string | null;
  enhancedImageUrl: string | null;
};

export type OCRJobRecord = {
  id: string;
  documentId: string;
  pageId: string;
  provider: OCRProviderName;
  status: ProcessingStatus;
  language: string;
  sourceImageUrl: string;
  sourceImageRole: OCRImageRole;
  extractedText: string | null;
  layout?: unknown;
  textLayer?: unknown;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateOCRJobInput = {
  documentId: string;
  pageId: string;
  provider: OCRProviderName;
  language: string;
  sourceImageUrl: string;
  sourceImageRole: OCRImageRole;
};

export type CompleteOCRJobInput = {
  jobId: string;
  pageId: string;
  documentId: string;
  provider: OCRProviderName;
  language: string;
  sourceImageUrl: string;
  sourceImageRole: OCRImageRole;
  result: OCRProviderResult;
};

export type FailOCRJobInput = {
  jobId: string;
  pageId: string;
  code: string;
  message: string;
};

export interface OCRPipelineRepository {
  findPageTarget(documentId: string, pageId: string): Promise<PageOCRTarget | null>;
  createJob(input: CreateOCRJobInput): Promise<OCRJobRecord>;
  markJobProcessing(jobId: string, pageId: string): Promise<OCRJobRecord>;
  completeJob(input: CompleteOCRJobInput): Promise<OCRJobRecord>;
  failJob(input: FailOCRJobInput): Promise<OCRJobRecord>;
  getJob(jobId: string): Promise<OCRJobRecord | null>;
}
