import { createDefaultEdgeDetectionPipeline } from '../edgeDetection';
import { createDefaultEnhancementPipeline } from '../enhancement';
import { createDefaultOCRPipelineService } from '../ocr';
import { createDefaultSearchablePdfService } from '../searchablePdf';
import { ScanPipelineService } from './scanPipelineService';

export function createDefaultScanPipeline() {
  const edgeDetection = createDefaultEdgeDetectionPipeline();
  const enhancement = createDefaultEnhancementPipeline();
  const ocr = createDefaultOCRPipelineService();
  const searchablePdf = createDefaultSearchablePdfService();

  return {
    service: new ScanPipelineService({
      edgeDetectionService: edgeDetection.service,
      enhancementService: enhancement.service,
      ocrPipelineService: ocr.service,
      searchablePdfService: searchablePdf.service,
    }),
    async close() {
      await edgeDetection.close();
      await enhancement.close();
      await ocr.close();
      await searchablePdf.close();
    },
  };
}
