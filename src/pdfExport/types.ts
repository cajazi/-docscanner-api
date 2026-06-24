import type { ScanSourceRole } from '../scanSource/types';
import type { SearchablePdfTextLayer } from '../searchablePdf/types';

export type PdfExportStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
export type PdfPageSize = 'A4' | 'AUTO';

export type PdfExportOptions = {
  searchable: boolean;
  pageSize: PdfPageSize;
  includeOcrTextLayer: boolean;
};

export type PdfExportPage = {
  pageId: string;
  pageNumber: number;
  imageUrl: string;
  sourceRole: ScanSourceRole;
};

export type PdfExportProviderInput = {
  documentId: string;
  pages: PdfExportPage[];
  outputStorageKey: string;
  options: PdfExportOptions;
  textLayer?: SearchablePdfTextLayer | null;
};

export type PdfExportProviderResult = {
  outputPdfUrl: string;
  pageCount: number;
  metadata: Record<string, unknown>;
};

export interface PdfExportProvider {
  readonly name: string;
  export(input: PdfExportProviderInput): Promise<PdfExportProviderResult>;
}

export type PdfExportJobRecord = {
  id: string;
  documentId: string;
  status: PdfExportStatus;
  provider: string;
  outputPdfUrl: string | null;
  pageCount: number | null;
  errorMessage: string | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
};

export type PdfExportDocument = {
  id: string;
  pages: Array<{
    id: string;
    pageNumber: number;
    originalImageUrl: string | null;
    croppedImageUrl: string | null;
    enhancedImageUrl: string | null;
    ocrText?: string | null;
    ocrTextLayer?: unknown;
  }>;
};

export type CreatePdfExportJobInput = {
  documentId: string;
  provider: string;
  metadata: Record<string, unknown>;
};

export type CompletePdfExportJobInput = {
  jobId: string;
  documentId: string;
  outputPdfUrl: string;
  pageCount: number;
  metadata: Record<string, unknown>;
};

export type FailPdfExportJobInput = {
  jobId: string;
  errorMessage: string;
  metadata?: Record<string, unknown>;
};

export interface PdfExportRepository {
  findDocumentWithPages(documentId: string): Promise<PdfExportDocument | null>;
  findActiveByDocumentId(documentId: string): Promise<PdfExportJobRecord | null>;
  create(input: CreatePdfExportJobInput): Promise<PdfExportJobRecord>;
  findById(jobId: string): Promise<PdfExportJobRecord | null>;
  findPendingJobs(limit: number): Promise<PdfExportJobRecord[]>;
  claimJob(jobId: string): Promise<PdfExportJobRecord | null>;
  markCompleted(input: CompletePdfExportJobInput): Promise<PdfExportJobRecord>;
  markFailed(input: FailPdfExportJobInput): Promise<PdfExportJobRecord>;
}
