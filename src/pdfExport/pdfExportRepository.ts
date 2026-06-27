import type { Prisma, PrismaClient } from '../generated/prisma/client';
import type {
  CompletePdfExportJobInput,
  CreatePdfExportJobInput,
  FailPdfExportJobInput,
  PdfExportDocument,
  PdfExportJobRecord,
  PdfExportRepository,
} from './types';

export class PrismaPdfExportRepository implements PdfExportRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findDocumentWithPages(documentId: string): Promise<PdfExportDocument | null> {
    return this.prisma.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        pages: {
          orderBy: { pageNumber: 'asc' },
          select: {
            id: true,
            pageNumber: true,
            originalImageUrl: true,
            croppedImageUrl: true,
            enhancedImageUrl: true,
            ocrText: true,
            ocrTextLayer: true,
          },
        },
      },
    });
  }

  async findActiveByDocumentId(documentId: string): Promise<PdfExportJobRecord | null> {
    return this.prisma.pdfExportJob.findFirst({
      where: {
        documentId,
        status: { in: ['PENDING', 'PROCESSING'] },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(input: CreatePdfExportJobInput): Promise<PdfExportJobRecord> {
    return this.prisma.pdfExportJob.create({
      data: {
        ...input,
        metadata: input.metadata as Prisma.InputJsonValue,
      },
    });
  }

  async findById(jobId: string): Promise<PdfExportJobRecord | null> {
    return this.prisma.pdfExportJob.findUnique({
      where: { id: jobId },
    });
  }

  async findPendingJobs(limit: number): Promise<PdfExportJobRecord[]> {
    return this.prisma.pdfExportJob.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  async claimJob(jobId: string): Promise<PdfExportJobRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const claim = await tx.pdfExportJob.updateMany({
        where: {
          id: jobId,
          status: 'PENDING',
        },
        data: {
          status: 'PROCESSING',
        },
      });

      if (claim.count !== 1) {
        return null;
      }

      return tx.pdfExportJob.findUnique({
        where: { id: jobId },
      });
    });
  }

  async markCompleted(input: CompletePdfExportJobInput): Promise<PdfExportJobRecord> {
    return this.prisma.$transaction(async (tx) => {
      await tx.document.update({
        where: { id: input.documentId },
        data: {
          pdfUrl: input.outputPdfUrl,
        },
      });

      return tx.pdfExportJob.update({
        where: { id: input.jobId },
        data: {
          status: 'COMPLETED',
          outputPdfUrl: input.outputPdfUrl,
          pageCount: input.pageCount,
          metadata: input.metadata as Prisma.InputJsonValue,
        },
      });
    });
  }

  async markFailed(input: FailPdfExportJobInput): Promise<PdfExportJobRecord> {
    return this.prisma.pdfExportJob.update({
      where: { id: input.jobId },
      data: {
        status: 'FAILED',
        errorMessage: input.errorMessage,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
