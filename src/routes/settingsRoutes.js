import { UserModel } from '../db/userModel.js';
import { verifyToken } from '../crypto/token.js';
import { VAPID_PUBLIC_KEY } from '../config/keys.js';

function getAuthUser(request) {
  const token = request.cookies?.token;
  if (!token) return null;
  const verified = verifyToken(token);
  if (!verified?.id) return null;
  return UserModel.findById(verified.id);
}

export async function settingsRoutes(fastify) {
  fastify.get('/api/settings', async (request, reply) => {
    const user = getAuthUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHENTICATED' });
    return reply.send({ settings: user.settings || {} });
  });

  fastify.post('/api/settings', async (request, reply) => {
    const user = getAuthUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHENTICATED' });
    const current = user.settings || {};
    const updatedSettings = {
      ...current,
      ...(request.body || {})
    };
    await UserModel.updateUser(user.id, { settings: updatedSettings });
    return reply.send({ success: true, settings: updatedSettings });
  });

  fastify.get('/api/push/vapid-public-key', async (request, reply) => {
    return reply.send({ publicKey: VAPID_PUBLIC_KEY });
  });

  fastify.post('/api/push/subscribe', async (request, reply) => {
    const user = getAuthUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHENTICATED' });
    const subscription = request.body;
    await UserModel.updateUser(user.id, { pushSubscription: subscription });
    return reply.send({ success: true });
  });

  fastify.post('/api/push/unsubscribe', async (request, reply) => {
    const user = getAuthUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHENTICATED' });
    await UserModel.updateUser(user.id, { pushSubscription: null });
    return reply.send({ success: true });
  });
}
