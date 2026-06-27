import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { env } from './config/env';
import { engineRoutes } from './routes/engineRoutes';
import { createDefaultOCRPipelineService } from './ocr';
import type { OCRPipelineService } from './ocr/ocrPipelineService';
import { createDefaultEnhancementPipeline } from './enhancement';
import type { EnhancementService } from './enhancement/enhancementService';
import { createDefaultEdgeDetectionPipeline } from './edgeDetection';
import type { EdgeDetectionService } from './edgeDetection/edgeDetectionService';
import { createDefaultPdfExportPipeline } from './pdfExport';
import type { PdfExportService } from './pdfExport/pdfExportService';
import { createDefaultSearchablePdfService } from './searchablePdf';
import type { SearchablePdfService } from './searchablePdf/searchablePdfService';
import { ScanPipelineService } from './scanPipeline/scanPipelineService';
import { createDefaultUploadContractService } from './uploadContract';
import type { UploadContractService } from './uploadContract/uploadContractService';
import { createDefaultOCRResultService } from './ocrResult';
import type { OCRResultService } from './ocrResult/ocrResultService';

type BuildAppOptions = {
  ocrPipelineService?: OCRPipelineService;
  enhancementService?: EnhancementService;
  edgeDetectionService?: EdgeDetectionService;
  pdfExportService?: PdfExportService;
  searchablePdfService?: SearchablePdfService;
  scanPipelineService?: ScanPipelineService;
  uploadContractService?: UploadContractService;
  ocrResultService?: OCRResultService;
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
  const searchablePdfPipeline = options.searchablePdfService
    ? { service: options.searchablePdfService, close: async () => undefined }
    : env.NODE_ENV === 'test'
      ? {
          service: {
            async buildTextLayer() {
              return {
                documentId: 'test-document',
                pages: [],
                searchableText: '',
                pageCount: 0,
              };
            },
          } as unknown as SearchablePdfService,
          close: async () => undefined,
        }
      : createDefaultSearchablePdfService();
  const scanPipeline = options.scanPipelineService
    ? { service: options.scanPipelineService, close: async () => undefined }
    : {
        service: new ScanPipelineService({
          edgeDetectionService: edgeDetectionPipeline.service,
          enhancementService: enhancementPipeline.service,
          ocrPipelineService: ocrPipeline.service,
          searchablePdfService: searchablePdfPipeline.service,
        }),
        close: async () => undefined,
      };
  const uploadContract = options.uploadContractService
    ? { service: options.uploadContractService, close: async () => undefined }
    : env.NODE_ENV === 'test'
      ? {
          service: {
            async createDocument() {
              throw new Error('Upload contract service test double was not configured');
            },
            async storeImage() {
              throw new Error('Upload contract service test double was not configured');
            },
            async createPage() {
              throw new Error('Upload contract service test double was not configured');
            },
          } as unknown as UploadContractService,
          close: async () => undefined,
        }
      : createDefaultUploadContractService();

  const ocrResult = options.ocrResultService
    ? { service: options.ocrResultService, close: async () => undefined }
    : env.NODE_ENV === 'test'
      ? {
          service: {
            async getPageResult() {
              throw new Error('OCR result service test double was not configured');
            },
          } as unknown as OCRResultService,
          close: async () => undefined,
        }
      : createDefaultOCRResultService();

  enhancementPipeline.processor?.start();
  edgeDetectionPipeline.processor?.start();
  pdfExportPipeline.processor?.start();

  await app.register(cors, {
    origin: true,
  });
  await app.register(multipart, {
    limits: {
      files: 1,
      fileSize: 10 * 1024 * 1024,
    },
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
    await searchablePdfPipeline.close();
    await scanPipeline.close();
    await uploadContract.close();
    await ocrResult.close();
  });

  await app.register(engineRoutes, {
    ocrPipelineService: ocrPipeline.service,
    enhancementService: enhancementPipeline.service,
    edgeDetectionService: edgeDetectionPipeline.service,
    pdfExportService: pdfExportPipeline.service,
    scanPipelineService: scanPipeline.service,
    uploadContractService: uploadContract.service,
    ocrResultService: ocrResult.service,
  });

  return app;
}
