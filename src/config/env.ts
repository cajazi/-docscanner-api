import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().optional(),
  OCR_PROVIDER: z.enum(['TESSERACT_CLI']).default('TESSERACT_CLI'),
  OCR_TESSERACT_BINARY: z.string().default('tesseract'),
  ENHANCEMENT_PROCESSOR_ENABLED: z.preprocess(
    (value) => (typeof value === 'string' ? value.toLowerCase() !== 'false' : value),
    z.boolean().default(false),
  ),
  ENHANCEMENT_PROCESSOR_POLL_MS: z.coerce.number().int().positive().default(5000),
  ENHANCEMENT_PROCESSOR_BATCH_SIZE: z.coerce.number().int().positive().max(10).default(3),
  ENHANCEMENT_PROVIDER: z.enum(['sharp', 'v2']).default('v2'),
  ENHANCEMENT_STORAGE_ROOT: z.string().default('C:\\tmp\\docscanner-api\\enhancements'),
  ENHANCEMENT_STORAGE_PUBLIC_BASE_URL: z.string().optional(),
  EDGE_DETECTION_PROCESSOR_ENABLED: z.preprocess(
    (value) => (typeof value === 'string' ? value.toLowerCase() !== 'false' : value),
    z.boolean().default(false),
  ),
  EDGE_DETECTION_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
  EDGE_DETECTION_BATCH_SIZE: z.coerce.number().int().positive().max(10).default(3),
  EDGE_DETECTION_PROVIDER: z.enum(['heuristic', 'contour', 'cv']).default('cv'),
  CV_PROVIDER: z.enum(['native', 'typescript']).default('native'),
  EDGE_DETECTION_STORAGE_ROOT: z.string().default('C:\\tmp\\docscanner-api\\edge-detection'),
  EDGE_DETECTION_STORAGE_PUBLIC_BASE_URL: z.string().optional(),
  PDF_EXPORT_PROCESSOR_ENABLED: z.preprocess(
    (value) => (typeof value === 'string' ? value.toLowerCase() !== 'false' : value),
    z.boolean().default(false),
  ),
  PDF_EXPORT_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
  PDF_EXPORT_BATCH_SIZE: z.coerce.number().int().positive().max(10).default(3),
  PDF_EXPORT_STORAGE_ROOT: z.string().default('C:\\tmp\\docscanner-api\\pdf-exports'),
  PDF_EXPORT_STORAGE_PUBLIC_BASE_URL: z.string().optional(),
});

export const env = envSchema.parse(process.env);
