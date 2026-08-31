import { UserModel } from '../db/userModel.js';
import { FriendModel } from '../db/friendModel.js';
import { verifyToken } from '../crypto/token.js';
import { hashPassword } from '../crypto/hash.js';

function getAuthUser(request) {
  const token = request.cookies?.token;
  if (!token) return null;
  const verified = verifyToken(token);
  if (!verified?.id) return null;
  return UserModel.findById(verified.id);
}

export async function userRoutes(fastify) {
  fastify.get('/api/users/me', async (request, reply) => {
    const user = getAuthUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHENTICATED' });
    return reply.send({
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatar: user.avatar,
      voiceAvatar: user.voiceAvatar,
      bio: user.bio,
      joinedAt: user.joinedAt,
      customStatus: user.customStatus,
      settings: user.settings
    });
  });

  fastify.post('/api/users/profile', async (request, reply) => {
    const user = getAuthUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHENTICATED' });

    const { displayName, avatar, voiceAvatar, bio, oldPassword, newPassword } = request.body || {};
    const updates = {};

    if (displayName !== undefined) updates.displayName = String(displayName).trim() || user.username;
    if (avatar !== undefined) updates.avatar = String(avatar).trim();
    if (voiceAvatar !== undefined) updates.voiceAvatar = String(voiceAvatar).trim();
    if (bio !== undefined) updates.bio = String(bio).trim();

    if (newPassword) {
      if (!oldPassword) {
        return reply.status(400).send({ error: 'MISSING_OLD_PASSWORD', message: 'Vui lòng nhập mật khẩu cũ' });
      }
      const oldHash = hashPassword(oldPassword);
      if (user.passwordHash !== oldHash) {
        return reply.status(400).send({ error: 'WRONG_OLD_PASSWORD', message: 'Mật khẩu cũ không chính xác' });
      }
      if (String(newPassword).length < 6) {
        return reply.status(400).send({ error: 'WEAK_PASSWORD', message: 'Mật khẩu mới phải từ 6 ký tự' });
      }
      updates.passwordHash = hashPassword(newPassword);
    }

    const updated = await UserModel.updateUser(user.id, updates);
    return reply.send({
      success: true,
      user: {
        id: updated.id,
        username: updated.username,
        displayName: updated.displayName,
        avatar: updated.avatar,
        voiceAvatar: updated.voiceAvatar,
        bio: updated.bio,
        joinedAt: updated.joinedAt,
        customStatus: updated.customStatus,
        settings: updated.settings
      }
    });
  });

  fastify.post('/api/users/custom-status', async (request, reply) => {
    const user = getAuthUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHENTICATED' });
    const { icon, text } = request.body || {};
    const customStatus = {
      icon: icon || 'smile',
      text: String(text || '').slice(0, 100)
    };
    await UserModel.updateUser(user.id, { customStatus });
    return reply.send({ success: true, customStatus });
  });

  fastify.post('/api/users/notes/:targetUserId', async (request, reply) => {
    const user = getAuthUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHENTICATED' });
    const { targetUserId } = request.params;
    const { note } = request.body || {};
    const notes = user.notes || {};
    notes[targetUserId] = String(note || '');
    await UserModel.updateUser(user.id, { notes });
    return reply.send({ success: true, note: notes[targetUserId] });
  });

  fastify.get('/api/users/search', async (request, reply) => {
    const user = getAuthUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHENTICATED' });
    const { q } = request.query || {};
    const results = UserModel.searchUsers(q);
    return reply.send({ results });
  });

  fastify.get('/api/users/:id/profile', async (request, reply) => {
    const user = getAuthUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHENTICATED' });
    const { id } = request.params;
    const targetUser = UserModel.findById(id);
    if (!targetUser) return reply.status(404).send({ error: 'USER_NOT_FOUND', message: 'Không tìm thấy người dùng' });

    const relation = FriendModel.getRelation(user.id, targetUser.id);
    const personalNote = user.notes?.[targetUser.id] || '';

    return reply.send({
      user: {
        id: targetUser.id,
        username: targetUser.username,
        displayName: targetUser.displayName,
        avatar: targetUser.avatar,
        voiceAvatar: targetUser.voiceAvatar,
        bio: targetUser.bio,
        joinedAt: targetUser.joinedAt,
        customStatus: targetUser.customStatus
      },
      note: personalNote,
      relation: relation ? {
        status: relation.status,
        senderId: relation.senderId
      } : null
    });
  });

  fastify.delete('/api/users/account', async (request, reply) => {
    const user = getAuthUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHENTICATED' });
    await UserModel.deleteUser(user.id);
    reply.clearCookie('name', { path: '/' });
    reply.clearCookie('token', { path: '/' });
    reply.clearCookie('loginRemember', { path: '/' });
    return reply.send({ success: true });
  });
}
