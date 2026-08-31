import { MessageModel } from '../db/messageModel.js';
import { UserModel } from '../db/userModel.js';
import { verifyToken } from '../crypto/token.js';

function getAuthUser(request) {
  const token = request.cookies?.token;
  if (!token) return null;
  const verified = verifyToken(token);
  if (!verified?.id) return null;
  return UserModel.findById(verified.id);
}

function enrichMessages(messages) {
  const allUsers = UserModel.getAll();
  return messages.map(msg => {
    let author = null;
    if (msg.webhook) {
      author = {
        id: `webhook_${msg.webhook.id}`,
        username: msg.webhook.name,
        displayName: msg.webhook.name,
        avatar: msg.webhook.avatar,
        isWebhook: true
      };
    } else {
      const u = allUsers.find(x => x.id === msg.authorId);
      author = {
        id: msg.authorId,
        username: u?.username || 'Unknown',
        displayName: u?.displayName || u?.username || 'Unknown',
        avatar: u?.avatar || '',
        voiceAvatar: u?.voiceAvatar || '',
        customStatus: u?.customStatus || { icon: 'smile', text: '' }
      };
    }
    return { ...msg, author };
  });
}

export async function messageRoutes(fastify, io) {
  fastify.get('/api/channels/:channelId/messages', async (request, reply) => {
    const user = getAuthUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHENTICATED' });
    const { channelId } = request.params;
    const { limit, before } = request.query || {};
    const messages = MessageModel.getByChannel(channelId, {
      limit: limit ? parseInt(limit, 10) : 50,
      before
    });
    const visible = messages.filter(m => !m.deletedFor?.includes(user.id));
    return reply.send({ messages: enrichMessages(visible) });
  });

  fastify.get('/api/dm/:userId/messages', async (request, reply) => {
    const user = getAuthUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHENTICATED' });
    const { userId: otherUserId } = request.params;
    const { limit, before } = request.query || {};
    const messages = MessageModel.getDmConversation(user.id, otherUserId, {
      limit: limit ? parseInt(limit, 10) : 50,
      before
    });
    const targetId = [user.id, otherUserId].sort().join('_');
    const visible = messages.filter(m => !m.deletedFor?.includes(user.id));
    return reply.send({ targetId, messages: enrichMessages(visible) });
  });

  fastify.post('/api/messages/:id/reaction', async (request, reply) => {
    const user = getAuthUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHENTICATED' });
    const { id } = request.params;
    const { reaction } = request.body || {};
    if (!reaction) return reply.status(400).send({ error: 'MISSING_REACTION' });

    const result = await MessageModel.toggleReaction(id, user.id, reaction);
    if (!result) return reply.status(404).send({ error: 'MESSAGE_NOT_FOUND' });

    if (io) {
      io.to(`room_${result.targetId}`).emit('message_reaction_updated', {
        messageId: id,
        reactions: result.reactions
      });
    }

    return reply.send({ success: true, ...result });
  });

  fastify.post('/api/messages/:id/pin', async (request, reply) => {
    const user = getAuthUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHENTICATED' });
    const { id } = request.params;

    const result = await MessageModel.togglePin(id);
    if (!result) return reply.status(404).send({ error: 'MESSAGE_NOT_FOUND' });

    if (io) {
      io.to(`room_${result.message.targetId}`).emit('message_pin_updated', {
        messageId: id,
        isPinned: result.isPinned
      });
    }

    return reply.send({ success: true, ...result });
  });

  fastify.get('/api/messages/pinned/:targetId', async (request, reply) => {
    const user = getAuthUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHENTICATED' });
    const { targetId } = request.params;
    const pinned = MessageModel.getPinnedMessages(targetId);
    return reply.send({ pinnedMessages: enrichMessages(pinned) });
  });

  fastify.delete('/api/messages/:id/for-me', async (request, reply) => {
    const user = getAuthUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHENTICATED' });
    const { id } = request.params;
    await MessageModel.deleteForMe(id, user.id);
    return reply.send({ success: true });
  });

  fastify.delete('/api/messages/:id/for-everyone', async (request, reply) => {
    const user = getAuthUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHENTICATED' });
    const { id } = request.params;
    const msg = MessageModel.findById(id);
    if (!msg) return reply.status(404).send({ error: 'MESSAGE_NOT_FOUND' });
    if (msg.authorId !== user.id) {
      return reply.status(403).send({ error: 'FORBIDDEN', message: 'Bạn không có quyền xóa tin nhắn này' });
    }
    await MessageModel.deleteForEveryone(id);
    if (io) {
      io.to(`room_${msg.targetId}`).emit('message_deleted_for_everyone', {
        messageId: id,
        targetId: msg.targetId
      });
    }
    return reply.send({ success: true });
  });
}
