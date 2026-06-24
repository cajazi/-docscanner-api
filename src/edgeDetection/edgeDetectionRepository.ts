import type { Prisma, PrismaClient } from '../generated/prisma/client';
import type {
  CompleteEdgeDetectionJobInput,
  CreateEdgeDetectionJobRecordInput,
  EdgeDetectionJobResponse,
  EdgeDetectionPageTarget,
  EdgeDetectionRepository,
  FailEdgeDetectionJobInput,
} from './types';

export class PrismaEdgeDetectionRepository implements EdgeDetectionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateEdgeDetectionJobRecordInput): Promise<EdgeDetectionJobResponse> {
    return this.prisma.edgeDetectionJob.create({
      data: {
        ...input,
        metadata: input.metadata as Prisma.InputJsonValue,
      },
    });
  }

  async findById(jobId: string): Promise<EdgeDetectionJobResponse | null> {
    return this.prisma.edgeDetectionJob.findUnique({
      where: { id: jobId },
    });
  }

  async findActiveByPageId(pageId: string): Promise<EdgeDetectionJobResponse | null> {
    return this.prisma.edgeDetectionJob.findFirst({
      where: {
        pageId,
        status: { in: ['PENDING', 'PROCESSING'] },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findPendingJobs(limit: number): Promise<EdgeDetectionJobResponse[]> {
    return this.prisma.edgeDetectionJob.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  async findPageTarget(documentId: string, pageId: string): Promise<EdgeDetectionPageTarget | null> {
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

  async claimJob(jobId: string): Promise<EdgeDetectionJobResponse | null> {
    return this.prisma.$transaction(async (tx) => {
      const claim = await tx.edgeDetectionJob.updateMany({
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

      return tx.edgeDetectionJob.findUnique({
        where: { id: jobId },
      });
    });
  }

  async markCompleted(input: CompleteEdgeDetectionJobInput): Promise<EdgeDetectionJobResponse> {
    return this.prisma.$transaction(async (tx) => {
      if (input.croppedImageUrl) {
        await tx.documentPage.update({
          where: { id: input.pageId },
          data: {
            croppedImageUrl: input.croppedImageUrl,
          },
        });
      }

      return tx.edgeDetectionJob.update({
        where: { id: input.jobId },
        data: {
          status: 'COMPLETED',
          corners: input.corners as unknown as Prisma.InputJsonValue,
          confidence: input.confidence,
          croppedImageUrl: input.croppedImageUrl,
          metadata: input.metadata as Prisma.InputJsonValue,
        },
      });
    });
  }

  async markFailed(input: FailEdgeDetectionJobInput): Promise<EdgeDetectionJobResponse> {
    return this.prisma.edgeDetectionJob.update({
      where: { id: input.jobId },
      data: {
        status: 'FAILED',
        errorMessage: input.errorMessage,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
