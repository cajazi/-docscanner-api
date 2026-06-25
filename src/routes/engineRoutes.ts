import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { OCRPipelineError, type OCRPipelineService } from '../ocr/ocrPipelineService';
import { EnhancementPipelineError, type EnhancementService } from '../enhancement/enhancementService';
import { EdgeDetectionPipelineError, type EdgeDetectionService } from '../edgeDetection/edgeDetectionService';
import { PdfExportPipelineError, type PdfExportService } from '../pdfExport/pdfExportService';
import { ScanPipelineError, toProcessPageResponse, type ScanPipelineService } from '../scanPipeline/scanPipelineService';
import { getOpenCvCapabilities } from '../opencv';
import { env } from '../config/env';
import {
  isSupportedImageMimeType,
  UploadContractError,
  type UploadContractService,
} from '../uploadContract/uploadContractService';

type EngineRoutesOptions = {
  ocrPipelineService: OCRPipelineService;
  enhancementService: EnhancementService;
  edgeDetectionService: EdgeDetectionService;
  pdfExportService: PdfExportService;
  scanPipelineService: ScanPipelineService;
  uploadContractService: UploadContractService;
};

const createDocumentSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

const createPageSchema = z
  .object({
    storagePath: z.string().trim().min(1).max(4096),
    type: z.enum(['ORIGINAL']),
  })
  .strict();

const startOCRJobSchema = z.object({
  language: z.string().trim().min(2).max(32).default('eng'),
});

const createEnhancementJobSchema = z.object({
  params: z
    .object({
      mode: z.enum(['document', 'grayscale', 'color', 'AUTO', 'COLOR', 'GRAYSCALE', 'BLACK_WHITE', 'MAGIC_COLOR', 'DOCUMENT']).default('DOCUMENT'),
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
  app.post('/engine/documents', async (request, reply) => {
    const body = createDocumentSchema.parse(request.body ?? {});
    const document = await options.uploadContractService.createDocument(body);

    return reply.code(201).send(document);
  });

  app.post('/engine/uploads/images', async (request, reply) => {
    const file = await request.file();
    if (!file) {
      throw new UploadContractError('UPLOAD_FILE_REQUIRED', 'Multipart field "file" is required', 400);
    }

    if (file.fieldname !== 'file') {
      throw new UploadContractError('UPLOAD_FILE_REQUIRED', 'Multipart field "file" is required', 400);
    }

    if (!isSupportedImageMimeType(file.mimetype)) {
      throw new UploadContractError('UNSUPPORTED_IMAGE_TYPE', 'Only JPEG, PNG, and WebP images are supported', 415);
    }

    const upload = await options.uploadContractService.storeImage({
      data: await file.toBuffer(),
      mimeType: file.mimetype,
      originalFilename: file.filename,
    });

    return reply.code(201).send(upload);
  });

  app.post('/engine/documents/:documentId/pages', async (request, reply) => {
    const params = z
      .object({
        documentId: z.string().min(1),
      })
      .parse(request.params);
    const body = createPageSchema.parse(request.body ?? {});
    const page = await options.uploadContractService.createPage({
      documentId: params.documentId,
      storagePath: body.storagePath,
      type: body.type,
    });

    return reply.code(201).send(page);
  });

  app.get('/engine/capabilities', async () => {
    const cvPipeline = getOpenCvCapabilities(env.CV_PROVIDER);

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
        provider: 'SHARP_V2',
        jobLifecycle: true,
        atomicJobClaiming: true,
        pageLevelEnhancedImageStorage: true,
        v2Implemented: true,
        modes: ['AUTO', 'COLOR', 'GRAYSCALE', 'BLACK_WHITE', 'MAGIC_COLOR', 'DOCUMENT'],
        outputContentType: 'image/jpeg',
        outputQuality: 92,
        shadowCorrectionFoundation: true,
        adaptiveThresholdFoundation: true,
        blurDetectionImplemented: true,
        futureDeskew: true,
        futurePerspectiveCorrection: true,
        futureOcrReadyImageConsumption: true,
      },
      edgeDetection: {
        status: 'real-foundation',
        provider: cvPipeline.provider,
        supportsFourCorners: true,
        supportsPerspectiveCorrection: false,
        supportsCroppedOutput: true,
        contourDetectionImplemented: true,
        quadDetectionImplemented: true,
        cvPipelineImplemented: true,
        nativeOpenCvImplemented: false,
        detectionMode: 'cv-pipeline-foundation',
        perspectiveCorrectionImplemented: false,
        notes: 'OpenCV-style CV pipeline foundation is implemented in TypeScript; native OpenCV and full CamScanner parity remain future work',
      },
      cvPipeline,
      pdfExport: {
        status: 'foundation',
        provider: 'pdf-lib',
        supportsImagePdf: true,
        supportsSearchablePdf: false,
        usesScanSourceResolver: true,
      },
      searchablePdf: {
        status: 'foundation',
        invisibleTextLayerImplemented: true,
        textLayerMetadataImplemented: true,
      },
      scanPipeline: {
        status: 'integrated',
        automaticSourceSelection: true,
        quadDetectionIntegrated: true,
        perspectiveIntegrated: true,
        enhancementIntegrated: true,
        ocrIntegrated: true,
        searchablePdfIntegrated: true,
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

  app.post('/engine/documents/:documentId/pages/:pageId/process', async (request, reply) => {
    const params = z
      .object({
        documentId: z.string().min(1),
        pageId: z.string().min(1),
      })
      .parse(request.params);

    const result = await options.scanPipelineService.processPage({
      documentId: params.documentId,
      pageId: params.pageId,
    });

    return reply.code(202).send(toProcessPageResponse(result));
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
      error instanceof PdfExportPipelineError ||
      error instanceof ScanPipelineError ||
      error instanceof UploadContractError
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
