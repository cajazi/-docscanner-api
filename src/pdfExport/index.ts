import { env } from '../config/env';
import { createPrismaClient } from '../db/prisma';
import { LocalFileStorage } from '../storage/localFileStorage';
import { PrismaPdfExportRepository } from './pdfExportRepository';
import { createPdfExportProcessor, shouldEnablePdfExportProcessor } from './pdfExportProcessor';
import { PdfExportService } from './pdfExportService';
import { PdfLibPdfExportProvider } from './providers/pdfLibPdfExportProvider';

export function createDefaultPdfExportPipeline() {
  const prisma = createPrismaClient();
  const storage = new LocalFileStorage({
    rootDir: env.PDF_EXPORT_STORAGE_ROOT,
    publicBaseUrl: env.PDF_EXPORT_STORAGE_PUBLIC_BASE_URL,
  });
  const repository = new PrismaPdfExportRepository(prisma);
  const provider = new PdfLibPdfExportProvider(storage);
  const service = new PdfExportService(repository, provider);
  const processor = createPdfExportProcessor(service, {
    enabled: shouldEnablePdfExportProcessor(env.NODE_ENV, env.PDF_EXPORT_PROCESSOR_ENABLED),
    pollMs: env.PDF_EXPORT_POLL_INTERVAL_MS,
    batchSize: env.PDF_EXPORT_BATCH_SIZE,
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
