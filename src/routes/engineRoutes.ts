import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { OCRPipelineError, type OCRPipelineService } from '../ocr/ocrPipelineService';

type EngineRoutesOptions = {
  ocrPipelineService: OCRPipelineService;
};

const startOCRJobSchema = z.object({
  language: z.string().trim().min(2).max(32).default('eng'),
  sourceImageRole: z.enum(['ORIGINAL', 'ENHANCED', 'CROPPED']).default('ENHANCED'),
  sourceImageUrl: z.string().trim().min(1).optional(),
});

export async function engineRoutes(app: FastifyInstance, options: EngineRoutesOptions) {
  app.get('/engine/capabilities', async () => {
    return {
      engine: 'docscanner-api',
      parityTarget: 'CamScanner-style document scanning engine',
      nonNegotiableParity: true,
      ocr: {
        providerAbstraction: true,
        jobLifecycle: true,
        pageLevelTextStorage: true,
        futureSearchablePdfTextLayer: true,
        futureLayoutBlocksLinesWords: true,
        futureEnhancementCropAwareOCR: true,
      },
    };
  });

  app.post('/engine/documents/:documentId/pages/:pageId/ocr-jobs', async (request, reply) => {
    const params = z
      .object({
        documentId: z.string().min(1),
        pageId: z.string().min(1),
      })
      .parse(request.params);

    const body = startOCRJobSchema.parse(request.body ?? {});
    const job = await options.ocrPipelineService.startPageOCR({
      documentId: params.documentId,
      pageId: params.pageId,
      language: body.language,
      sourceImageRole: body.sourceImageRole,
      sourceImageUrl: body.sourceImageUrl,
    });

    return reply.code(201).send({ job });
  });

  app.get('/engine/ocr-jobs/:jobId', async (request) => {
    const params = z
      .object({
        jobId: z.string().min(1),
      })
      .parse(request.params);

    const job = await options.ocrPipelineService.getJob(params.jobId);
    return { job };
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof OCRPipelineError) {
      return reply.code(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
        },
      });
    }

    if (error instanceof z.ZodError) {
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          issues: error.issues,
        },
      });
    }

    return reply.send(error);
  });
}
