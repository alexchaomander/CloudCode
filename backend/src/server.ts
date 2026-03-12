import { buildApp } from './app.js';
import { loadEnv } from './env.js';

const env = loadEnv();
const app = await buildApp();
await app.listen({ port: env.PORT, host: env.HOST });
