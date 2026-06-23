import type { FastifyInstance } from 'fastify';

export async function engineRoutes(app: FastifyInstance) {
  app.get('/engine/capabilities', async () => {
    return {
      engine: 'docscanner-api',
      parityTarget: 'CamScanner-style document scanning engine',
      nonNegotiableParity: true
    };
  });
}
