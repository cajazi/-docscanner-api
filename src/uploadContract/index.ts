import { env } from '../config/env';
import { createPrismaClient } from '../db/prisma';
import { LocalFileStorage } from '../storage/localFileStorage';
import { PrismaUploadContractRepository } from './uploadContractRepository';
import { UploadContractService } from './uploadContractService';

export function createDefaultUploadContractService() {
  const prisma = createPrismaClient();
  const storage = new LocalFileStorage({
    rootDir: env.UPLOAD_STORAGE_ROOT,
    publicBaseUrl: env.UPLOAD_STORAGE_PUBLIC_BASE_URL,
  });
  const repository = new PrismaUploadContractRepository(prisma);
  const service = new UploadContractService(repository, storage);

  return {
    service,
    async close() {
      await prisma.$disconnect();
    },
  };
}
