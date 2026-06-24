export type EdgeDetectionStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export type EdgeDetectionParams = {
  perspectiveCorrection: boolean;
  outputCroppedImage: boolean;
};

export type DocumentCorner = {
  x: number;
  y: number;
};

export type DocumentCorners = {
  topLeft: DocumentCorner;
  topRight: DocumentCorner;
  bottomRight: DocumentCorner;
  bottomLeft: DocumentCorner;
};

export type EdgeDetectionResult = {
  corners: DocumentCorners;
  confidence: number;
  croppedImageUrl?: string;
  metadata: Record<string, unknown>;
};

export type EdgeDetectionJobResponse = {
  id: string;
  pageId: string;
  status: EdgeDetectionStatus;
  provider: string;
  sourceImageUrl: string;
  croppedImageUrl: string | null;
  corners: unknown;
  confidence: number | null;
  errorMessage: string | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateEdgeDetectionJobInput = {
  documentId: string;
  pageId: string;
  params?: Partial<EdgeDetectionParams>;
};

export type EdgeDetectionPageTarget = {
  id: string;
  documentId: string;
  originalImageUrl: string | null;
  croppedImageUrl: string | null;
  enhancedImageUrl: string | null;
};

export type CreateEdgeDetectionJobRecordInput = {
  pageId: string;
  provider: string;
  sourceImageUrl: string;
  metadata: Record<string, unknown>;
};

export type CompleteEdgeDetectionJobInput = {
  jobId: string;
  pageId: string;
  corners: DocumentCorners;
  confidence: number;
  croppedImageUrl?: string;
  metadata: Record<string, unknown>;
};

export type FailEdgeDetectionJobInput = {
  jobId: string;
  errorMessage: string;
  metadata?: Record<string, unknown>;
};

export interface EdgeDetectionRepository {
  create(input: CreateEdgeDetectionJobRecordInput): Promise<EdgeDetectionJobResponse>;
  findById(jobId: string): Promise<EdgeDetectionJobResponse | null>;
  findActiveByPageId(pageId: string): Promise<EdgeDetectionJobResponse | null>;
  findPendingJobs(limit: number): Promise<EdgeDetectionJobResponse[]>;
  findPageTarget(documentId: string, pageId: string): Promise<EdgeDetectionPageTarget | null>;
  claimJob(jobId: string): Promise<EdgeDetectionJobResponse | null>;
  markCompleted(input: CompleteEdgeDetectionJobInput): Promise<EdgeDetectionJobResponse>;
  markFailed(input: FailEdgeDetectionJobInput): Promise<EdgeDetectionJobResponse>;
}
