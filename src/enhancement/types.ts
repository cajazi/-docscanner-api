export type EnhancementStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
export type EnhancementMode = 'document' | 'grayscale' | 'color';

export type EnhancementParams = {
  mode: EnhancementMode;
  brightness: number;
  contrast: number;
  deskew: boolean;
  perspectiveCorrection: boolean;
};

export type EnhancementProviderInput = {
  originalImageUrl: string;
  outputKey: string;
  params: EnhancementParams;
};

export type EnhancementProviderResult = {
  enhancedImageUrl: string;
  metadata: Record<string, unknown>;
};

export interface EnhancementProvider {
  readonly name: string;
  enhance(input: EnhancementProviderInput): Promise<EnhancementProviderResult>;
}

export type EnhancementPageTarget = {
  id: string;
  documentId: string;
  originalImageUrl: string | null;
  enhancedImageUrl: string | null;
};

export type EnhancementJobRecord = {
  id: string;
  pageId: string;
  status: EnhancementStatus;
  provider: string;
  originalImageUrl: string;
  enhancedImageUrl: string | null;
  errorMessage: string | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateEnhancementJobInput = {
  pageId: string;
  provider: string;
  originalImageUrl: string;
  metadata: Record<string, unknown>;
};

export type CompleteEnhancementJobInput = {
  jobId: string;
  pageId: string;
  enhancedImageUrl: string;
  metadata: Record<string, unknown>;
};

export type FailEnhancementJobInput = {
  jobId: string;
  errorMessage: string;
  metadata?: Record<string, unknown>;
};

export interface EnhancementRepository {
  findPageTarget(documentId: string, pageId: string): Promise<EnhancementPageTarget | null>;
  findActiveJobForPage(pageId: string): Promise<EnhancementJobRecord | null>;
  createJob(input: CreateEnhancementJobInput): Promise<EnhancementJobRecord>;
  getJob(jobId: string): Promise<EnhancementJobRecord | null>;
  findPendingJobs(limit: number): Promise<EnhancementJobRecord[]>;
  claimPendingJob(jobId: string): Promise<EnhancementJobRecord | null>;
  completeJob(input: CompleteEnhancementJobInput): Promise<EnhancementJobRecord>;
  failJob(input: FailEnhancementJobInput): Promise<EnhancementJobRecord>;
}
