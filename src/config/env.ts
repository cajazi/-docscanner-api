import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().optional(),
  OCR_PROVIDER: z.enum(['TESSERACT_CLI']).default('TESSERACT_CLI'),
  OCR_TESSERACT_BINARY: z.string().default('tesseract'),
});

export const env = envSchema.parse(process.env);
