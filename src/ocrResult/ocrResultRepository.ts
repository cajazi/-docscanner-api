import type { PrismaClient } from '../generated/prisma/client';
import type { OCRPageResultRecord, OCRResultRepository } from './types';

export class PrismaOCRResultRepository implements OCRResultRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findPageResult(documentId: string, pageId: string): Promise<OCRPageResultRecord | null> {
    const page = await this.prisma.documentPage.findFirst({
      where: { id: pageId, documentId },
      select: {
        id: true,
        documentId: true,
        ocrText: true,
        ocrTextLayer: true,
        updatedAt: true,
        document: {
          select: { searchableText: true },
        },
      },
    });

    if (!page) {
      return null;
    }

    return {
      documentId: page.documentId,
      pageId: page.id,
      ocrText: page.ocrText,
      textLayer: page.ocrTextLayer,
      searchableText: page.document.searchableText,
      updatedAt: page.updatedAt,
    };
  }
}
