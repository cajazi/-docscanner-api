import type { Prisma, PrismaClient } from '../generated/prisma/client';
import type {
  CompleteEnhancementJobInput,
  CreateEnhancementJobInput,
  EnhancementJobRecord,
  EnhancementPageTarget,
  EnhancementRepository,
  FailEnhancementJobInput,
} from './types';

export class PrismaEnhancementRepository implements EnhancementRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findPageTarget(documentId: string, pageId: string): Promise<EnhancementPageTarget | null> {
    return this.prisma.documentPage.findFirst({
      where: { id: pageId, documentId },
      select: {
        id: true,
        documentId: true,
        originalImageUrl: true,
        croppedImageUrl: true,
        enhancedImageUrl: true,
      },
    });
  }

  async findActiveJobForPage(pageId: string): Promise<EnhancementJobRecord | null> {
    return this.prisma.enhancementJob.findFirst({
      where: {
        pageId,
        status: { in: ['PENDING', 'PROCESSING'] },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createJob(input: CreateEnhancementJobInput): Promise<EnhancementJobRecord> {
    return this.prisma.enhancementJob.create({
      data: {
        ...input,
        metadata: input.metadata as Prisma.InputJsonValue,
      },
    });
  }

  async getJob(jobId: string): Promise<EnhancementJobRecord | null> {
    return this.prisma.enhancementJob.findUnique({
      where: { id: jobId },
    });
  }

  async findPendingJobs(limit: number): Promise<EnhancementJobRecord[]> {
    return this.prisma.enhancementJob.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  async claimPendingJob(jobId: string): Promise<EnhancementJobRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const claim = await tx.enhancementJob.updateMany({
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

      return tx.enhancementJob.findUnique({
        where: { id: jobId },
      });
    });
  }

  async completeJob(input: CompleteEnhancementJobInput): Promise<EnhancementJobRecord> {
    return this.prisma.$transaction(async (tx) => {
      await tx.documentPage.update({
        where: { id: input.pageId },
        data: {
          enhancedImageUrl: input.enhancedImageUrl,
        },
      });

      return tx.enhancementJob.update({
        where: { id: input.jobId },
        data: {
          status: 'COMPLETED',
          enhancedImageUrl: input.enhancedImageUrl,
          metadata: input.metadata as Prisma.InputJsonValue,
        },
      });
    });
  }

  async failJob(input: FailEnhancementJobInput): Promise<EnhancementJobRecord> {
    return this.prisma.enhancementJob.update({
      where: { id: input.jobId },
      data: {
        status: 'FAILED',
        errorMessage: input.errorMessage,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
