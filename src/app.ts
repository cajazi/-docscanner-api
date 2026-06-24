import Fastify from 'fastify';
import cors from '@fastify/cors';
import { engineRoutes } from './routes/engineRoutes';
import { createDefaultOCRPipelineService } from './ocr';
import type { OCRPipelineService } from './ocr/ocrPipelineService';
import { createDefaultEnhancementPipeline } from './enhancement';
import type { EnhancementService } from './enhancement/enhancementService';
import { createDefaultEdgeDetectionPipeline } from './edgeDetection';
import type { EdgeDetectionService } from './edgeDetection/edgeDetectionService';
import { createDefaultPdfExportPipeline } from './pdfExport';
import type { PdfExportService } from './pdfExport/pdfExportService';

type BuildAppOptions = {
  ocrPipelineService?: OCRPipelineService;
  enhancementService?: EnhancementService;
  edgeDetectionService?: EdgeDetectionService;
  pdfExportService?: PdfExportService;
};

export async function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({ logger: true });
  const ocrPipeline = options.ocrPipelineService
    ? { service: options.ocrPipelineService, close: async () => undefined }
    : createDefaultOCRPipelineService();
  const enhancementPipeline = options.enhancementService
    ? { service: options.enhancementService, processor: null, close: async () => undefined }
    : createDefaultEnhancementPipeline();
  const edgeDetectionPipeline = options.edgeDetectionService
    ? { service: options.edgeDetectionService, processor: null, close: async () => undefined }
    : createDefaultEdgeDetectionPipeline();
  const pdfExportPipeline = options.pdfExportService
    ? { service: options.pdfExportService, processor: null, close: async () => undefined }
    : createDefaultPdfExportPipeline();

  enhancementPipeline.processor?.start();
  edgeDetectionPipeline.processor?.start();
  pdfExportPipeline.processor?.start();

  await app.register(cors, {
    origin: true,
  });

  app.get('/health', async () => ({
    status: 'ok',
    service: 'docscanner-api',
  }));

  app.addHook('onClose', async () => {
    await ocrPipeline.close();
    await enhancementPipeline.close();
    await edgeDetectionPipeline.close();
    await pdfExportPipeline.close();
  });

  await app.register(engineRoutes, {
    ocrPipelineService: ocrPipeline.service,
    enhancementService: enhancementPipeline.service,
    edgeDetectionService: edgeDetectionPipeline.service,
    pdfExportService: pdfExportPipeline.service,
  });

  return app;
}
