import type { PrismaClient } from '../generated/prisma/client';
import type {
  CompleteOCRJobInput,
  CreateOCRJobInput,
  FailOCRJobInput,
  OCRJobRecord,
  OCRPipelineRepository,
  PageOCRTarget,
} from './types';

export class PrismaOCRPipelineRepository implements OCRPipelineRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findPageTarget(documentId: string, pageId: string): Promise<PageOCRTarget | null> {
    return this.prisma.documentPage.findFirst({
      where: { id: pageId, documentId },
      select: {
        id: true,
        documentId: true,
        originalImageUrl: true,
        enhancedImageUrl: true,
      },
    });
  }

  async createJob(input: CreateOCRJobInput): Promise<OCRJobRecord> {
    return this.prisma.oCRJob.create({
      data: input,
    });
  }

  async markJobProcessing(jobId: string, pageId: string): Promise<OCRJobRecord> {
    return this.prisma.$transaction(async (tx) => {
      await tx.documentPage.update({
        where: { id: pageId },
        data: {
          processingStatus: 'PROCESSING',
        },
      });

      return tx.oCRJob.update({
        where: { id: jobId },
        data: {
          status: 'PROCESSING',
          startedAt: new Date(),
        },
      });
    });
  }

  async completeJob(input: CompleteOCRJobInput): Promise<OCRJobRecord> {
    const completedAt = new Date();
    const job = await this.prisma.$transaction(async (tx) => {
      await tx.documentPage.update({
        where: { id: input.pageId },
        data: {
          ocrText: input.result.text,
          ocrLanguage: input.language,
          ocrProvider: input.provider,
          ocrLayout: input.result.layout,
          ocrTextLayer: input.result.textLayer,
          ocrSourceImageUrl: input.sourceImageUrl,
          ocrSourceImageRole: input.sourceImageRole,
          ocrCompletedAt: completedAt,
          processingStatus: 'COMPLETED',
        },
      });

      const updatedJob = await tx.oCRJob.update({
        where: { id: input.jobId },
        data: {
          status: 'COMPLETED',
          extractedText: input.result.text,
          layout: input.result.layout,
          textLayer: input.result.textLayer,
          completedAt,
        },
      });

      const pages = await tx.documentPage.findMany({
        where: { documentId: input.documentId },
        orderBy: { pageNumber: 'asc' },
        select: { ocrText: true },
      });

      await tx.document.update({
        where: { id: input.documentId },
        data: {
          searchableText: pages
            .map((page) => page.ocrText?.trim())
            .filter((text): text is string => Boolean(text))
            .join('\n\n'),
        },
      });

      return updatedJob;
    });

    return job;
  }

  async failJob(input: FailOCRJobInput): Promise<OCRJobRecord> {
    return this.prisma.$transaction(async (tx) => {
      await tx.documentPage.update({
        where: { id: input.pageId },
        data: {
          processingStatus: 'FAILED',
        },
      });

      return tx.oCRJob.update({
        where: { id: input.jobId },
        data: {
          status: 'FAILED',
          errorCode: input.code,
          errorMessage: input.message,
          completedAt: new Date(),
        },
      });
    });
  }

  async getJob(jobId: string): Promise<OCRJobRecord | null> {
    return this.prisma.oCRJob.findUnique({
      where: { id: jobId },
    });
  }
}
