import { createPrismaClient } from '../db/prisma';
import { OCRResultService } from './ocrResultService';
import { PrismaOCRResultRepository } from './ocrResultRepository';

export function createDefaultOCRResultService() {
  const prisma = createPrismaClient();
  const repository = new PrismaOCRResultRepository(prisma);

  return {
    service: new OCRResultService(repository),
    async close() {
      await prisma.$disconnect();
    },
  };
}
