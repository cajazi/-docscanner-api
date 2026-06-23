import Fastify from 'fastify';
import cors from '@fastify/cors';
import { engineRoutes } from './routes/engineRoutes';

export async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: true,
  });

  app.get('/health', async () => ({
    status: 'ok',
    service: 'docscanner-api',
  }));

  await app.register(engineRoutes);

  return app;
}
