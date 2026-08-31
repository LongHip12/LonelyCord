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

export async function groupRoutes(fastify) {
  fastify.get('/api/groups', async (request, reply) => {
    const user = getAuthUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHENTICATED' });
    const groups = GroupModel.getUserGroups(user.id);
    return reply.send({ groups });
  });

  fastify.post('/api/groups', async (request, reply) => {
    const user = getAuthUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHENTICATED' });
    const { name, icon } = request.body || {};
    if (!name) return reply.status(400).send({ error: 'MISSING_NAME', message: 'Vui lòng nhập tên máy chủ' });
    const group = await GroupModel.createGroup({
      name: String(name).trim(),
      icon: String(icon || '').trim(),
      ownerId: user.id
    });
    return reply.send({ success: true, group });
  });

  fastify.get('/api/groups/:id', async (request, reply) => {
    const user = getAuthUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHENTICATED' });
    const { id } = request.params;
    const group = GroupModel.findById(id);
    if (!group) return reply.status(404).send({ error: 'GROUP_NOT_FOUND', message: 'Không tìm thấy máy chủ' });
    if (!group.members.some(m => m.userId === user.id)) {
      return reply.status(403).send({ error: 'FORBIDDEN', message: 'Bạn không phải là thành viên của máy chủ này' });
    }

    const allUsers = UserModel.getAll();
    const enrichedMembers = group.members.map(m => {
      const u = allUsers.find(x => x.id === m.userId);
      return {
        userId: m.userId,
        roles: m.roles,
        joinedAt: m.joinedAt,
        username: u?.username || 'Unknown',
        displayName: u?.displayName || u?.username || 'Unknown',
        avatar: u?.avatar || '',
        voiceAvatar: u?.voiceAvatar || '',
        customStatus: u?.customStatus || { icon: 'smile', text: '' }
      };
    });

    return reply.send({
      group: {
        ...group,
        members: enrichedMembers
      }
    });
  });

  fastify.put('/api/groups/:id', async (request, reply) => {
    const user = getAuthUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHENTICATED' });
    const { id } = request.params;
    const group = GroupModel.findById(id);
    if (!group) return reply.status(404).send({ error: 'GROUP_NOT_FOUND' });
    if (group.ownerId !== user.id) {
      return reply.status(403).send({ error: 'FORBIDDEN', message: 'Chỉ chủ sở hữu mới có quyền chỉnh sửa máy chủ' });
    }
    const { name, icon, banner } = request.body || {};
    const updates = {};
    if (name !== undefined) updates.name = String(name).trim();
    if (icon !== undefined) updates.icon = String(icon).trim();
    if (banner !== undefined) updates.banner = String(banner).trim();
    const updated = await GroupModel.updateGroup(id, updates);
    return reply.send({ success: true, group: updated });
  });

  fastify.delete('/api/groups/:id', async (request, reply) => {
    const user = getAuthUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHENTICATED' });
    const { id } = request.params;
    const group = GroupModel.findById(id);
    if (!group) return reply.status(404).send({ error: 'GROUP_NOT_FOUND' });
    if (group.ownerId !== user.id) {
      return reply.status(403).send({ error: 'FORBIDDEN', message: 'Chỉ chủ sở hữu mới có quyền xóa máy chủ' });
    }
    await GroupModel.deleteGroup(id);
    return reply.send({ success: true });
  });

  fastify.post('/api/groups/:id/invites', async (request, reply) => {
    const user = getAuthUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHENTICATED' });
    const { id } = request.params;
    const invite = await GroupModel.createInvite(id);
    return reply.send({ success: true, invite });
  });

  fastify.get('/api/invite/:code', async (request, reply) => {
    const { code } = request.params;
    const group = GroupModel.findByInviteCode(code);
    if (!group) return reply.status(404).send({ error: 'INVITE_NOT_FOUND', message: 'Liên kết mời không hợp lệ hoặc đã hết hạn' });
    return reply.send({
      success: true,
      invite: {
        code,
        groupName: group.name,
        groupIcon: group.icon,
        memberCount: group.members.length
      }
    });
  });

  fastify.post('/api/invite/:code/join', async (request, reply) => {
    const user = getAuthUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHENTICATED' });
    const { code } = request.params;
    const res = await GroupModel.joinByInvite(code, user.id);
    if (res.error) return reply.status(404).send({ error: res.error, message: 'Liên kết mời không hợp lệ' });
    return reply.send({ success: true, group: res.group });
  });

  fastify.post('/api/groups/:id/categories', async (request, reply) => {
    const user = getAuthUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHENTICATED' });
    const { id } = request.params;
    const { name } = request.body || {};
    const group = GroupModel.findById(id);
    if (!group) return reply.status(404).send({ error: 'GROUP_NOT_FOUND' });
    const cat = await GroupModel.addCategory(id, name);
    return reply.send({ success: true, category: cat });
  });

  fastify.delete('/api/groups/:id/categories/:categoryId', async (request, reply) => {
    const user = getAuthUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHENTICATED' });
    const { id, categoryId } = request.params;
    await GroupModel.deleteCategory(id, categoryId);
    return reply.send({ success: true });
  });

  fastify.post('/api/groups/:id/channels', async (request, reply) => {
    const user = getAuthUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHENTICATED' });
    const { id } = request.params;
    const { name, type, categoryId } = request.body || {};
    const channel = await GroupModel.addChannel(id, { name, type, categoryId });
    if (!channel) return reply.status(404).send({ error: 'GROUP_NOT_FOUND' });
    return reply.send({ success: true, channel });
  });

  fastify.delete('/api/groups/:id/channels/:channelId', async (request, reply) => {
    const user = getAuthUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHENTICATED' });
    const { id, channelId } = request.params;
    await GroupModel.deleteChannel(id, channelId);
    return reply.send({ success: true });
  });

  fastify.post('/api/groups/:id/members', async (request, reply) => {
    const user = getAuthUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHENTICATED' });
    const { id } = request.params;
    const { username } = request.body || {};
    const targetUser = UserModel.findByUsername(String(username).trim());
    if (!targetUser) return reply.status(404).send({ error: 'USER_NOT_FOUND', message: 'Không tìm thấy người dùng' });
    const group = await GroupModel.addMember(id, targetUser.id);
    if (!group) return reply.status(404).send({ error: 'GROUP_NOT_FOUND' });
    return reply.send({ success: true, group });
  });

  fastify.delete('/api/groups/:id/members/:userId', async (request, reply) => {
    const user = getAuthUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHENTICATED' });
    const { id, userId } = request.params;
    const group = GroupModel.findById(id);
    if (!group) return reply.status(404).send({ error: 'GROUP_NOT_FOUND' });
    if (userId !== user.id && group.ownerId !== user.id) {
      return reply.status(403).send({ error: 'FORBIDDEN', message: 'Không có quyền xóa thành viên' });
    }
    await GroupModel.removeMember(id, userId);
    return reply.send({ success: true });
  });

  fastify.post('/api/groups/:id/roles', async (request, reply) => {
    const user = getAuthUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHENTICATED' });
    const { id } = request.params;
    const group = GroupModel.findById(id);
    if (!group) return reply.status(404).send({ error: 'GROUP_NOT_FOUND' });
    if (group.ownerId !== user.id) {
      return reply.status(403).send({ error: 'FORBIDDEN', message: 'Chỉ chủ sở hữu mới có quyền quản lý vai trò' });
    }
    const { name, color, permissions } = request.body || {};
    const role = await GroupModel.createRole(id, { name: String(name).trim() || 'Vai trò mới', color, permissions });
    return reply.send({ success: true, role });
  });

  fastify.put('/api/groups/:id/roles/:roleId', async (request, reply) => {
    const user = getAuthUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHENTICATED' });
    const { id, roleId } = request.params;
    const group = GroupModel.findById(id);
    if (!group) return reply.status(404).send({ error: 'GROUP_NOT_FOUND' });
    if (group.ownerId !== user.id) {
      return reply.status(403).send({ error: 'FORBIDDEN', message: 'Chỉ chủ sở hữu mới có quyền quản lý vai trò' });
    }
    const role = await GroupModel.updateRole(id, roleId, request.body || {});
    return reply.send({ success: true, role });
  });

  fastify.delete('/api/groups/:id/roles/:roleId', async (request, reply) => {
    const user = getAuthUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHENTICATED' });
    const { id, roleId } = request.params;
    const group = GroupModel.findById(id);
    if (!group) return reply.status(404).send({ error: 'GROUP_NOT_FOUND' });
    if (group.ownerId !== user.id) {
      return reply.status(403).send({ error: 'FORBIDDEN', message: 'Chỉ chủ sở hữu mới có quyền quản lý vai trò' });
    }
    await GroupModel.deleteRole(id, roleId);
    return reply.send({ success: true });
  });

  fastify.put('/api/groups/:id/members/:userId/roles', async (request, reply) => {
    const user = getAuthUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHENTICATED' });
    const { id, userId } = request.params;
    const group = GroupModel.findById(id);
    if (!group) return reply.status(404).send({ error: 'GROUP_NOT_FOUND' });
    if (group.ownerId !== user.id) {
      return reply.status(403).send({ error: 'FORBIDDEN', message: 'Chỉ chủ sở hữu mới có quyền gán vai trò' });
    }
    const { roleIds } = request.body || {};
    const member = await GroupModel.setMemberRoles(id, userId, Array.isArray(roleIds) ? roleIds : []);
    return reply.send({ success: true, member });
  });
}
