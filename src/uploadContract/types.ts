export type UploadImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp';

export type CreateUploadDocumentInput = {
  title?: string;
};

export type UploadDocumentResponse = {
  id: string;
  title: string;
  createdAt: Date;
};

export type StoreUploadedImageInput = {
  data: Buffer;
  mimeType: UploadImageMimeType;
  originalFilename: string;
};

export type UploadedImageResponse = {
  storagePath: string;
  mimeType: UploadImageMimeType;
  sizeBytes: number;
  originalFilename: string;
};

export type CreateUploadPageInput = {
  documentId: string;
  storagePath: string;
  type: 'ORIGINAL';
};

export type UploadPageResponse = {
  id: string;
  documentId: string;
  pageNumber: number;
  originalImageUrl: string | null;
  croppedImageUrl: string | null;
  enhancedImageUrl: string | null;
};

export interface UploadContractRepository {
  createDocument(input: { title: string; userId: string }): Promise<UploadDocumentResponse>;
  documentExists(documentId: string): Promise<boolean>;
  createOriginalPage(input: { documentId: string; originalImageUrl: string }): Promise<UploadPageResponse>;
  ensureUploadOwner(input: { userId: string; email: string }): Promise<void>;
}
