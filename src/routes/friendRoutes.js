import { FriendModel } from '../db/friendModel.js';
import { UserModel } from '../db/userModel.js';
import { MessageModel } from '../db/messageModel.js';
import { verifyToken } from '../crypto/token.js';

function getAuthUser(request) {
  const token = request.cookies?.token;
  if (!token) return null;
  const verified = verifyToken(token);
  if (!verified?.id) return null;
  return UserModel.findById(verified.id);
}

export async function friendRoutes(fastify) {
  fastify.get('/api/friends', async (request, reply) => {
    const user = getAuthUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHENTICATED' });

    const relations = FriendModel.getUserRelations(user.id);
    const allUsers = UserModel.getAll();

    const friends = [];
    const pendingIncoming = [];
    const pendingOutgoing = [];
    const blocked = [];

    for (const rel of relations) {
      const otherId = rel.user1 === user.id ? rel.user2 : rel.user1;
      const otherUser = allUsers.find(u => u.id === otherId);
      if (!otherUser) continue;
      const item = {
        id: otherUser.id,
        username: otherUser.username,
        displayName: otherUser.displayName,
        avatar: otherUser.avatar,
        voiceAvatar: otherUser.voiceAvatar,
        bio: otherUser.bio,
        customStatus: otherUser.customStatus
      };

      if (rel.status === 'accepted') {
        friends.push(item);
      } else if (rel.status === 'pending') {
        if (rel.senderId === user.id) {
          pendingOutgoing.push(item);
        } else {
          pendingIncoming.push(item);
        }
      } else if (rel.status === 'blocked' && rel.senderId === user.id) {
        blocked.push(item);
      }
    }

    return reply.send({
      friends,
      pendingIncoming,
      pendingOutgoing,
      blocked
    });
  });

  fastify.post('/api/friends/request', async (request, reply) => {
    const user = getAuthUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHENTICATED' });
    const { username, userId } = request.body || {};
    let target = null;
    if (userId) {
      target = UserModel.findById(userId);
    } else if (username) {
      target = UserModel.findByUsername(String(username).trim());
    }
    if (!target) return reply.status(404).send({ error: 'USER_NOT_FOUND', message: 'Không tìm thấy người dùng' });
    if (target.id === user.id) {
      return reply.status(400).send({ error: 'CANNOT_FRIEND_SELF', message: 'Không thể kết bạn với chính mình' });
    }

    const rel = await FriendModel.sendRequest(user.id, target.id);
    if (!rel) {
      return reply.status(400).send({ error: 'ACTION_FAILED', message: 'Không thể gửi yêu cầu kết bạn' });
    }
    return reply.send({ success: true, relation: rel });
  });

  fastify.post('/api/friends/accept', async (request, reply) => {
    const user = getAuthUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHENTICATED' });
    const { targetUserId } = request.body || {};
    const rel = await FriendModel.acceptRequest(user.id, targetUserId);
    if (!rel) return reply.status(400).send({ error: 'ACTION_FAILED', message: 'Không thể chấp nhận yêu cầu' });
    return reply.send({ success: true, relation: rel });
  });

  fastify.post('/api/friends/reject', async (request, reply) => {
    const user = getAuthUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHENTICATED' });
    const { targetUserId } = request.body || {};
    await FriendModel.rejectRequest(user.id, targetUserId);
    return reply.send({ success: true });
  });

  fastify.post('/api/friends/remove', async (request, reply) => {
    const user = getAuthUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHENTICATED' });
    const { targetUserId } = request.body || {};
    await FriendModel.removeFriend(user.id, targetUserId);
    return reply.send({ success: true });
  });

  fastify.post('/api/friends/block', async (request, reply) => {
    const user = getAuthUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHENTICATED' });
    const { targetUserId } = request.body || {};
    await FriendModel.blockUser(user.id, targetUserId);
    return reply.send({ success: true });
  });

  fastify.post('/api/friends/unblock', async (request, reply) => {
    const user = getAuthUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHENTICATED' });
    const { targetUserId } = request.body || {};
    await FriendModel.unblockUser(user.id, targetUserId);
    return reply.send({ success: true });
  });

  fastify.get('/api/dm/conversations', async (request, reply) => {
    const user = getAuthUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHENTICATED' });

    const rawConvs = MessageModel.getDmConversations(user.id);
    const allUsers = UserModel.getAll();
    const results = [];

    for (const conv of rawConvs) {
      const otherUser = allUsers.find(u => u.id === conv.otherUserId);
      if (!otherUser) continue;
      const isFriend = FriendModel.areFriends(user.id, conv.otherUserId);
      const isPendingMessage = !isFriend;

      results.push({
        targetId: conv.targetId,
        otherUser: {
          id: otherUser.id,
          username: otherUser.username,
          displayName: otherUser.displayName,
          avatar: otherUser.avatar,
          voiceAvatar: otherUser.voiceAvatar,
          customStatus: otherUser.customStatus
        },
        isPendingMessage,
        lastMessage: conv.lastMessage
      });
    }

    return reply.send({ conversations: results });
  });
}
