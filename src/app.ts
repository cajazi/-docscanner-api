import Fastify from 'fastify';
import cors from '@fastify/cors';
import { engineRoutes } from './routes/engineRoutes';
import { createDefaultOCRPipelineService } from './ocr';
import type { OCRPipelineService } from './ocr/ocrPipelineService';

type BuildAppOptions = {
  ocrPipelineService?: OCRPipelineService;
};

export async function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({ logger: true });
  const ocrPipeline = options.ocrPipelineService
    ? { service: options.ocrPipelineService, close: async () => undefined }
    : createDefaultOCRPipelineService();

  await app.register(cors, {
    origin: true,
  });

  app.get('/health', async () => ({
    status: 'ok',
    service: 'docscanner-api',
  }));

  app.addHook('onClose', async () => {
    await ocrPipeline.close();
  });

  await app.register(engineRoutes, {
    ocrPipelineService: ocrPipeline.service,
  });

  return app;
}
