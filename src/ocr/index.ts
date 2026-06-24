import { env } from '../config/env';
import { createPrismaClient } from '../db/prisma';
import { OCRPipelineService } from './ocrPipelineService';
import { PrismaOCRPipelineRepository } from './ocrPipelineRepository';
import { TesseractCliOCRProvider } from './providers/tesseractCliProvider';

export function createDefaultOCRPipelineService() {
  const prisma = createPrismaClient();
  const repository = new PrismaOCRPipelineRepository(prisma);
  const provider = new TesseractCliOCRProvider({
    binaryPath: env.OCR_TESSERACT_BINARY,
  });

  return {
    service: new OCRPipelineService(repository, provider),
    async close() {
      await prisma.$disconnect();
    },
  };
}
