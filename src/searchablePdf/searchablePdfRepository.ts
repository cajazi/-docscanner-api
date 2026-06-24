import type { Prisma, PrismaClient } from '../generated/prisma/client';
import type { SearchablePdfRepository, SearchablePdfTextLayer } from './types';

export class PrismaSearchablePdfRepository implements SearchablePdfRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findDocumentWithOcrPages(documentId: string) {
    return this.prisma.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        pages: {
          orderBy: { pageNumber: 'asc' },
          select: {
            id: true,
            pageNumber: true,
            ocrText: true,
            ocrLayout: true,
            ocrTextLayer: true,
          },
        },
      },
    });
  }

  async updateSearchablePdfMetadata(documentId: string, metadata: SearchablePdfTextLayer) {
    await this.prisma.document.update({
      where: { id: documentId },
      data: {
        searchablePdfMetadata: metadata as unknown as Prisma.InputJsonValue,
      },
    });
  }
}
