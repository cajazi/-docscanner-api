import { env } from '../config/env';
import { createPrismaClient } from '../db/prisma';
import { LocalFileStorage } from '../storage/localFileStorage';
import { PrismaEdgeDetectionRepository } from './edgeDetectionRepository';
import { createEdgeDetectionProcessor, shouldEnableEdgeDetectionProcessor } from './edgeDetectionProcessor';
import { EdgeDetectionService } from './edgeDetectionService';
import { HeuristicEdgeDetectionProvider } from './providers/heuristicEdgeDetectionProvider';

export function createDefaultEdgeDetectionPipeline() {
  const prisma = createPrismaClient();
  const storage = new LocalFileStorage({
    rootDir: env.EDGE_DETECTION_STORAGE_ROOT,
    publicBaseUrl: env.EDGE_DETECTION_STORAGE_PUBLIC_BASE_URL,
  });
  const repository = new PrismaEdgeDetectionRepository(prisma);
  const provider = new HeuristicEdgeDetectionProvider(storage);
  const service = new EdgeDetectionService(repository, provider);
  const processor = createEdgeDetectionProcessor(service, {
    enabled: shouldEnableEdgeDetectionProcessor(env.NODE_ENV, env.EDGE_DETECTION_PROCESSOR_ENABLED),
    pollMs: env.EDGE_DETECTION_POLL_INTERVAL_MS,
    batchSize: env.EDGE_DETECTION_BATCH_SIZE,
  });

  return {
    service,
    processor,
    async close() {
      processor?.stop();
      await prisma.$disconnect();
    },
  };
}
