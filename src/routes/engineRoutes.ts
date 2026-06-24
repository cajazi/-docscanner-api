import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { OCRPipelineError, type OCRPipelineService } from '../ocr/ocrPipelineService';
import { EnhancementPipelineError, type EnhancementService } from '../enhancement/enhancementService';
import { EdgeDetectionPipelineError, type EdgeDetectionService } from '../edgeDetection/edgeDetectionService';
import { PdfExportPipelineError, type PdfExportService } from '../pdfExport/pdfExportService';

type EngineRoutesOptions = {
  ocrPipelineService: OCRPipelineService;
  enhancementService: EnhancementService;
  edgeDetectionService: EdgeDetectionService;
  pdfExportService: PdfExportService;
};

const startOCRJobSchema = z.object({
  language: z.string().trim().min(2).max(32).default('eng'),
});

const createEnhancementJobSchema = z.object({
  params: z
    .object({
      mode: z.enum(['document', 'grayscale', 'color']).default('document'),
      brightness: z.number().min(0.5).max(1.5).optional(),
      contrast: z.number().min(0.5).max(1.8).optional(),
      deskew: z.boolean().optional(),
      perspectiveCorrection: z.boolean().optional(),
    })
    .optional(),
});

const createEdgeDetectionJobSchema = z.object({
  params: z
    .object({
      perspectiveCorrection: z.boolean().optional(),
      outputCroppedImage: z.boolean().optional(),
    })
    .optional(),
});

const createPdfExportJobSchema = z.object({
  options: z
    .object({
      searchable: z.boolean().optional(),
      pageSize: z.enum(['A4', 'AUTO']).optional(),
      includeOcrTextLayer: z.boolean().optional(),
    })
    .optional(),
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
      enhancement: {
        providerAbstraction: true,
        provider: 'SHARP',
        jobLifecycle: true,
        atomicJobClaiming: true,
        pageLevelEnhancedImageStorage: true,
        modes: ['document', 'grayscale', 'color'],
        outputContentType: 'image/jpeg',
        outputQuality: 92,
        futureDeskew: true,
        futurePerspectiveCorrection: true,
        futureOcrReadyImageConsumption: true,
      },
      edgeDetection: {
        status: 'foundation',
        provider: 'heuristic',
        supportsFourCorners: true,
        supportsPerspectiveCorrection: false,
        supportsCroppedOutput: true,
        notes: 'Full CamScanner-style contour detection is future work',
      },
      pdfExport: {
        status: 'foundation',
        provider: 'pdf-lib',
        supportsImagePdf: true,
        supportsSearchablePdf: false,
        usesScanSourceResolver: true,
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

  app.post('/engine/documents/:documentId/pages/:pageId/enhancement-jobs', async (request, reply) => {
    const params = z
      .object({
        documentId: z.string().min(1),
        pageId: z.string().min(1),
      })
      .parse(request.params);

    const body = createEnhancementJobSchema.parse(request.body ?? {});
    const job = await options.enhancementService.createJob({
      documentId: params.documentId,
      pageId: params.pageId,
      params: body.params,
    });

    return reply.code(201).send({ job });
  });

  app.get('/engine/enhancement-jobs/:jobId', async (request) => {
    const params = z
      .object({
        jobId: z.string().min(1),
      })
      .parse(request.params);

    const job = await options.enhancementService.getJob(params.jobId);
    return { job };
  });

  app.post('/engine/documents/:documentId/pages/:pageId/edge-detection-jobs', async (request, reply) => {
    const params = z
      .object({
        documentId: z.string().min(1),
        pageId: z.string().min(1),
      })
      .parse(request.params);

    const body = createEdgeDetectionJobSchema.parse(request.body ?? {});
    const job = await options.edgeDetectionService.createJob({
      documentId: params.documentId,
      pageId: params.pageId,
      params: body.params,
    });

    return reply.code(201).send({ job });
  });

  app.get('/engine/edge-detection-jobs/:jobId', async (request) => {
    const params = z
      .object({
        jobId: z.string().min(1),
      })
      .parse(request.params);

    const job = await options.edgeDetectionService.getJob(params.jobId);
    return { job };
  });

  app.post('/engine/documents/:documentId/pdf-export-jobs', async (request, reply) => {
    const params = z
      .object({
        documentId: z.string().min(1),
      })
      .parse(request.params);

    const body = createPdfExportJobSchema.parse(request.body ?? {});
    const job = await options.pdfExportService.createJob({
      documentId: params.documentId,
      options: body.options,
    });

    return reply.code(201).send({ job });
  });

  app.get('/engine/pdf-export-jobs/:jobId', async (request) => {
    const params = z
      .object({
        jobId: z.string().min(1),
      })
      .parse(request.params);

    const job = await options.pdfExportService.getJob(params.jobId);
    return { job };
  });

  app.setErrorHandler((error, _request, reply) => {
    if (
      error instanceof OCRPipelineError ||
      error instanceof EnhancementPipelineError ||
      error instanceof EdgeDetectionPipelineError ||
      error instanceof PdfExportPipelineError
    ) {
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
