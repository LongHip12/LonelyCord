import { WebhookModel } from '../db/webhookModel.js';
import { MessageModel } from '../db/messageModel.js';
import { GroupModel } from '../db/groupModel.js';
import { UserModel } from '../db/userModel.js';
import { verifyToken } from '../crypto/token.js';

function getAuthUser(request) {
  const token = request.cookies?.token;
  if (!token) return null;
  const verified = verifyToken(token);
  if (!verified?.id) return null;
  return UserModel.findById(verified.id);
}

export async function webhookRoutes(fastify, io) {
  fastify.get('/api/channels/:channelId/webhooks', async (request, reply) => {
    const user = getAuthUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHENTICATED' });
    const { channelId } = request.params;
    const webhooks = WebhookModel.getByChannel(channelId);
    return reply.send({ webhooks });
  });

  fastify.post('/api/channels/:channelId/webhooks', async (request, reply) => {
    const user = getAuthUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHENTICATED' });
    const { channelId } = request.params;
    const { name, avatar } = request.body || {};
    const webhook = await WebhookModel.createWebhook({
      channelId,
      name: String(name || 'Webhook Bot').trim(),
      avatar: String(avatar || '').trim()
    });
    return reply.send({ success: true, webhook });
  });

  fastify.delete('/api/webhooks/:id', async (request, reply) => {
    const user = getAuthUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHENTICATED' });
    const { id } = request.params;
    await WebhookModel.deleteWebhook(id);
    return reply.send({ success: true });
  });

  fastify.get('/api/webhooks/:id/:token', async (request, reply) => {
    const { id, token } = request.params;
    const webhook = WebhookModel.findById(id);
    if (!webhook || webhook.token !== token) {
      return reply.status(404).send({ error: 'WEBHOOK_NOT_FOUND', message: 'Không tìm thấy Webhook' });
    }
    return reply.send({
      id: webhook.id,
      name: webhook.name,
      channelId: webhook.channelId,
      avatar: webhook.avatar,
      createdAt: webhook.createdAt
    });
  });

  fastify.post('/api/webhooks/:id/:token', async (request, reply) => {
    const { id, token } = request.params;
    const webhook = WebhookModel.findById(id);
    if (!webhook || webhook.token !== token) {
      return reply.status(404).send({ error: 'WEBHOOK_NOT_FOUND', message: 'Không tìm thấy Webhook' });
    }

    const { content, username, avatar_url, embeds, attachments } = request.body || {};

    const message = await MessageModel.createMessage({
      targetType: 'channel',
      targetId: webhook.channelId,
      authorId: `webhook_${webhook.id}`,
      content: content || '',
      attachments: attachments || [],
      webhook: {
        id: webhook.id,
        name: username || webhook.name,
        avatar: avatar_url || webhook.avatar
      },
      embeds: Array.isArray(embeds) ? embeds : []
    });

    const enrichedMessage = {
      ...message,
      author: {
        id: `webhook_${webhook.id}`,
        username: username || webhook.name,
        displayName: username || webhook.name,
        avatar: avatar_url || webhook.avatar,
        isWebhook: true
      }
    };

    if (io) {
      io.to(`room_${webhook.channelId}`).emit('new_message', enrichedMessage);
    }
    return reply.send({ success: true, message: enrichedMessage });
  });
}
