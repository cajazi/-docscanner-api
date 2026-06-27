import crypto from 'node:crypto';
import path from 'node:path';
import type { ObjectStorage } from '../storage/types';
import type {
  CreateUploadDocumentInput,
  CreateUploadPageInput,
  StoreUploadedImageInput,
  UploadContractRepository,
  UploadedImageResponse,
  UploadDocumentResponse,
  UploadImageMimeType,
  UploadPageResponse,
} from './types';

export class UploadContractError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}

const defaultUploadOwner = {
  userId: 'android_upload_contract_user',
  email: 'android-upload-contract@docscanner.local',
};

const mimeExtensions: Record<UploadImageMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export class UploadContractService {
  constructor(
    private readonly repository: UploadContractRepository,
    private readonly storage: ObjectStorage,
    private readonly uploadOwner = defaultUploadOwner,
  ) {}

  async createDocument(input: CreateUploadDocumentInput): Promise<UploadDocumentResponse> {
    await this.repository.ensureUploadOwner(this.uploadOwner);

    return this.repository.createDocument({
      userId: this.uploadOwner.userId,
      title: input.title?.trim() || 'Untitled document',
    });
  }

  async storeImage(input: StoreUploadedImageInput): Promise<UploadedImageResponse> {
    if (!isSupportedImageMimeType(input.mimeType)) {
      throw new UploadContractError('UNSUPPORTED_IMAGE_TYPE', 'Only JPEG, PNG, and WebP images are supported', 415);
    }

    if (input.data.length === 0) {
      throw new UploadContractError('EMPTY_UPLOAD', 'Uploaded image is empty', 400);
    }

    const extension = mimeExtensions[input.mimeType];
    const objectKey = path.posix.join('uploads', 'images', `${new Date().toISOString().slice(0, 10)}`, `${crypto.randomUUID()}.${extension}`);
    const stored = await this.storage.write(objectKey, input.data, input.mimeType);

    return {
      storagePath: stored.url,
      mimeType: input.mimeType,
      sizeBytes: input.data.length,
      originalFilename: input.originalFilename,
    };
  }

  async createPage(input: CreateUploadPageInput): Promise<UploadPageResponse> {
    const exists = await this.repository.documentExists(input.documentId);
    if (!exists) {
      throw new UploadContractError('DOCUMENT_NOT_FOUND', 'Document was not found', 404);
    }

    return this.repository.createOriginalPage({
      documentId: input.documentId,
      originalImageUrl: input.storagePath,
    });
  }
}

export function isSupportedImageMimeType(value: string): value is UploadImageMimeType {
  return value === 'image/jpeg' || value === 'image/png' || value === 'image/webp';
}
