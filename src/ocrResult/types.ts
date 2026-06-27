export type OCRResultStatus = 'COMPLETED' | 'EMPTY';

export type OCRPageResultRecord = {
  documentId: string;
  pageId: string;
  ocrText: string | null;
  textLayer: unknown | null;
  searchableText: string | null;
  updatedAt: Date;
};

export type OCRResultResponse = {
  documentId: string;
  pageId: string;
  status: OCRResultStatus;
  ocrText: string;
  extractedText: string;
  searchableText: string;
  textLayer: unknown;
  updatedAt: Date;
};

export interface OCRResultRepository {
  findPageResult(documentId: string, pageId: string): Promise<OCRPageResultRecord | null>;
}
