import type { PrismaClient } from '../generated/prisma/client';
import type { UploadContractRepository, UploadDocumentResponse, UploadPageResponse } from './types';

export class PrismaUploadContractRepository implements UploadContractRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async ensureUploadOwner(input: { userId: string; email: string }): Promise<void> {
    await this.prisma.user.upsert({
      where: { id: input.userId },
      update: {},
      create: {
        id: input.userId,
        email: input.email,
        passwordHash: 'not-authenticated-upload-contract-user',
        displayName: 'Android Upload Contract',
      },
    });
  }

  async createDocument(input: { title: string; userId: string }): Promise<UploadDocumentResponse> {
    return this.prisma.document.create({
      data: {
        userId: input.userId,
        title: input.title,
        sourceType: 'ANDROID_UPLOAD',
      },
      select: {
        id: true,
        title: true,
        createdAt: true,
      },
    });
  }

  async documentExists(documentId: string): Promise<boolean> {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: { id: true },
    });

    return Boolean(document);
  }

  async createOriginalPage(input: { documentId: string; originalImageUrl: string }): Promise<UploadPageResponse> {
    return this.prisma.$transaction(async (tx) => {
      const pageNumber = await tx.documentPage
        .aggregate({
          where: { documentId: input.documentId },
          _max: { pageNumber: true },
        })
        .then((result) => (result._max.pageNumber ?? 0) + 1);

      return tx.documentPage.create({
        data: {
          documentId: input.documentId,
          pageNumber,
          originalImageUrl: input.originalImageUrl,
        },
        select: {
          id: true,
          documentId: true,
          pageNumber: true,
          originalImageUrl: true,
          croppedImageUrl: true,
          enhancedImageUrl: true,
        },
      });
    });
  }
}
