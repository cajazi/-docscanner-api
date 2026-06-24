import { env } from '../config/env';
import { createPrismaClient } from '../db/prisma';
import { LocalFileStorage } from '../storage/localFileStorage';
import { PrismaEnhancementRepository } from './enhancementRepository';
import { createEnhancementProcessor, shouldEnableEnhancementProcessor } from './enhancementProcessor';
import { EnhancementService } from './enhancementService';
import { SharpEnhancementProvider } from './providers/sharpEnhancementProvider';

export function createDefaultEnhancementPipeline() {
  const prisma = createPrismaClient();
  const storage = new LocalFileStorage({
    rootDir: env.ENHANCEMENT_STORAGE_ROOT,
    publicBaseUrl: env.ENHANCEMENT_STORAGE_PUBLIC_BASE_URL,
  });
  const repository = new PrismaEnhancementRepository(prisma);
  const provider = new SharpEnhancementProvider(storage);
  const service = new EnhancementService(repository, provider);
  const processor = createEnhancementProcessor(service, {
    enabled: shouldEnableEnhancementProcessor(env.NODE_ENV, env.ENHANCEMENT_PROCESSOR_ENABLED),
    pollMs: env.ENHANCEMENT_PROCESSOR_POLL_MS,
    batchSize: env.ENHANCEMENT_PROCESSOR_BATCH_SIZE,
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
