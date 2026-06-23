import 'dotenv/config';
import { buildApp } from './app';
import { env } from './config/env';

async function main() {
  const app = await buildApp();

  await app.listen({
    host: env.HOST,
    port: env.PORT,
  });
}

main();
