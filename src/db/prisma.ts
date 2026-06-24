import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { env } from '../config/env';

export function createPrismaClient() {
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to use the OCR pipeline');
  }

  const adapter = new PrismaPg(env.DATABASE_URL);
  return new PrismaClient({ adapter });
}
