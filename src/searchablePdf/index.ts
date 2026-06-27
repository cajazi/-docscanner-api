import { createPrismaClient } from '../db/prisma';
import { PrismaSearchablePdfRepository } from './searchablePdfRepository';
import { SearchablePdfService } from './searchablePdfService';

export function createDefaultSearchablePdfService() {
  const prisma = createPrismaClient();
  const repository = new PrismaSearchablePdfRepository(prisma);

  return {
    service: new SearchablePdfService(repository),
    async close() {
      await prisma.$disconnect();
    },
  };
}
