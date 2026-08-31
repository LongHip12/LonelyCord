import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import fs from 'node:fs';

import { PORT, HOST } from './config/keys.js';
import { setupSocketServer } from './realtime/socketServer.js';
import { authRoutes } from './routes/authRoutes.js';
import { userRoutes } from './routes/userRoutes.js';
import { groupRoutes } from './routes/groupRoutes.js';
import { friendRoutes } from './routes/friendRoutes.js';
import { messageRoutes } from './routes/messageRoutes.js';
import { webhookRoutes } from './routes/webhookRoutes.js';
import { uploadRoutes } from './routes/uploadRoutes.js';
import { settingsRoutes } from './routes/settingsRoutes.js';

const fastify = Fastify({
  logger: false
});

await fastify.register(fastifyCookie);

await fastify.register(fastifyMultipart, {
  limits: {
    fileSize: 50 * 1024 * 1024
  }
});

const publicDir = path.resolve(process.cwd(), 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

await fastify.register(fastifyStatic, {
  root: publicDir,
  prefix: '/'
});

const io = setupSocketServer(fastify.server);

await authRoutes(fastify);
await userRoutes(fastify);
await groupRoutes(fastify);
await friendRoutes(fastify);
await messageRoutes(fastify);
await webhookRoutes(fastify, io);
await uploadRoutes(fastify);
await settingsRoutes(fastify);

fastify.setNotFoundHandler((request, reply) => {
  if (request.raw.url && request.raw.url.startsWith('/api/')) {
    return reply.status(404).send({ error: 'ENDPOINT_NOT_FOUND' });
  }
  const indexPath = path.join(publicDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    return reply.type('text/html').send(fs.readFileSync(indexPath, 'utf8'));
  }
  return reply.status(404).send('Not Found');
});

const start = async () => {
  try {
    await fastify.listen({ port: Number(PORT), host: HOST });
    console.log(`LonelyChat Server running on http://${HOST}:${PORT}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

start();
