import { dbStorage } from './storage.js';
import { generateId } from '../crypto/hash.js';

function randomCode(len = 7) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < len; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

export const GroupModel = {
  getAll() {
    return dbStorage.read('groups', []);
  },

  findById(id) {
    const groups = this.getAll();
    return groups.find(g => g.id === id) || null;
  },

  findByInviteCode(code) {
    const groups = this.getAll();
    return groups.find(g => g.invites?.some(inv => inv.code === code)) || null;
  },

  getUserGroups(userId) {
    const groups = this.getAll();
    return groups.filter(g => g.members.some(m => m.userId === userId));
  },

  async createGroup({ name, ownerId, icon = '' }) {
    const groups = this.getAll();
    const groupId = generateId(20);
    const now = new Date().toISOString();
    const defaultCatId = `cat_${generateId(16)}`;
    const inviteCode = randomCode(7);

    const newGroup = {
      id: groupId,
      name,
      icon,
      ownerId,
      createdAt: now,
      roles: [],
      invites: [
        {
          code: inviteCode,
          createdAt: now,
          uses: 0
        }
      ],
      autoModWords: [],
      auditLog: [
        {
          action: 'Tạo máy chủ',
          userId: ownerId,
          timestamp: now,
          details: `Máy chủ ${name} được khởi tạo`
        }
      ],
      members: [
        {
          userId: ownerId,
          roles: [],
          joinedAt: now
        }
      ],
      categories: [
        {
          id: defaultCatId,
          name: 'KÊNH CHAT & VOICE'
        }
      ],
      channels: [
        {
          id: `c_${generateId(18)}`,
          name: 'chung',
          type: 'text',
          categoryId: defaultCatId,
          pinnedMessages: []
        },
        {
          id: `v_${generateId(18)}`,
          name: 'Phòng thoại',
          type: 'voice',
          categoryId: defaultCatId
        },
        {
          id: `s_${generateId(18)}`,
          name: 'Sân khấu trực tiếp',
          type: 'stage',
          categoryId: defaultCatId
        }
      ]
    };
    groups.push(newGroup);
    await dbStorage.write('groups', groups);
    return newGroup;
  },

  async updateGroup(id, updates) {
    const groups = this.getAll();
    const index = groups.findIndex(g => g.id === id);
    if (index === -1) return null;
    groups[index] = { ...groups[index], ...updates, id };
    await dbStorage.write('groups', groups);
    return groups[index];
  },

  async deleteGroup(id) {
    const groups = this.getAll();
    const filtered = groups.filter(g => g.id !== id);
    if (filtered.length !== groups.length) {
      await dbStorage.write('groups', filtered);
      return true;
    }
    return false;
  },

  async createInvite(groupId) {
    const groups = this.getAll();
    const group = groups.find(g => g.id === groupId);
    if (!group) return null;
    if (!group.invites) group.invites = [];
    const code = randomCode(7);
    const invite = {
      code,
      createdAt: new Date().toISOString(),
      uses: 0
    };
    group.invites.push(invite);
    await dbStorage.write('groups', groups);
    return invite;
  },

  async joinByInvite(code, userId) {
    const groups = this.getAll();
    const group = groups.find(g => g.invites?.some(inv => inv.code === code));
    if (!group) return { error: 'INVITE_NOT_FOUND' };

    const inv = group.invites.find(i => i.code === code);
    if (inv) inv.uses = (inv.uses || 0) + 1;

    if (!group.members.some(m => m.userId === userId)) {
      group.members.push({
        userId,
        roles: [],
        joinedAt: new Date().toISOString()
      });
      if (!group.auditLog) group.auditLog = [];
      group.auditLog.push({
        action: 'Thành viên tham gia',
        userId,
        timestamp: new Date().toISOString(),
        details: `Tham gia qua mã mời ${code}`
      });
      await dbStorage.write('groups', groups);
    }
    return { success: true, group };
  },

  async addCategory(groupId, name) {
    const groups = this.getAll();
    const group = groups.find(g => g.id === groupId);
    if (!group) return null;
    if (!group.categories) group.categories = [];
    const cat = {
      id: `cat_${generateId(16)}`,
      name: String(name || 'DANH MỤC MỚI').trim()
    };
    group.categories.push(cat);
    await dbStorage.write('groups', groups);
    return cat;
  },

  async deleteCategory(groupId, categoryId) {
    const groups = this.getAll();
    const group = groups.find(g => g.id === groupId);
    if (!group) return false;
    group.categories = (group.categories || []).filter(c => c.id !== categoryId);
    if (group.channels) {
      group.channels.forEach(ch => {
        if (ch.categoryId === categoryId) ch.categoryId = null;
      });
    }
    await dbStorage.write('groups', groups);
    return true;
  },

  async addChannel(groupId, { name, type = 'text', categoryId = null }) {
    const groups = this.getAll();
    const group = groups.find(g => g.id === groupId);
    if (!group) return null;
    if (!group.channels) group.channels = [];
    const cleanName = String(name || 'kênh-mới').trim().toLowerCase().replace(/\s+/g, '-');
    let prefix = 'c_';
    if (type === 'voice') prefix = 'v_';
    if (type === 'stage') prefix = 's_';

    const channel = {
      id: `${prefix}${generateId(18)}`,
      name: cleanName,
      type: type || 'text',
      categoryId: categoryId || group.categories?.[0]?.id || null,
      pinnedMessages: []
    };
    group.channels.push(channel);
    await dbStorage.write('groups', groups);
    return channel;
  },

  async deleteChannel(groupId, channelId) {
    const groups = this.getAll();
    const group = groups.find(g => g.id === groupId);
    if (!group) return false;
    group.channels = (group.channels || []).filter(c => c.id !== channelId);
    await dbStorage.write('groups', groups);
    return true;
  },

  async togglePinMessage(groupId, channelId, messageId) {
    const groups = this.getAll();
    const group = groups.find(g => g.id === groupId);
    if (!group) return null;
    const channel = group.channels?.find(c => c.id === channelId);
    if (!channel) return null;
    if (!channel.pinnedMessages) channel.pinnedMessages = [];
    const idx = channel.pinnedMessages.indexOf(messageId);
    let pinned = false;
    if (idx === -1) {
      channel.pinnedMessages.push(messageId);
      pinned = true;
    } else {
      channel.pinnedMessages.splice(idx, 1);
      pinned = false;
    }
    await dbStorage.write('groups', groups);
    return { pinned, pinnedMessages: channel.pinnedMessages };
  },

  async addMember(groupId, userId) {
    const groups = this.getAll();
    const group = groups.find(g => g.id === groupId);
    if (!group) return null;
    if (!group.members.some(m => m.userId === userId)) {
      group.members.push({
        userId,
        roles: [],
        joinedAt: new Date().toISOString()
      });
      await dbStorage.write('groups', groups);
    }
    return group;
  },

  async removeMember(groupId, userId) {
    const groups = this.getAll();
    const group = groups.find(g => g.id === groupId);
    if (!group) return null;
    group.members = group.members.filter(m => m.userId !== userId);
    await dbStorage.write('groups', groups);
    return group;
  },

  async createRole(groupId, { name, color, permissions }) {
    const groups = this.getAll();
    const group = groups.find(g => g.id === groupId);
    if (!group) return null;
    const roleId = `r_${generateId(18)}`;
    const newRole = {
      id: roleId,
      name,
      color: color || '#5865f2',
      permissions: {
        manageGroup: Boolean(permissions?.manageGroup),
        manageRoles: Boolean(permissions?.manageRoles),
        manageChannels: Boolean(permissions?.manageChannels),
        manageMessages: Boolean(permissions?.manageMessages),
        kickMembers: Boolean(permissions?.kickMembers)
      }
    };
    group.roles.push(newRole);
    await dbStorage.write('groups', groups);
    return newRole;
  },

  async updateRole(groupId, roleId, updates) {
    const groups = this.getAll();
    const group = groups.find(g => g.id === groupId);
    if (!group) return null;
    const role = group.roles.find(r => r.id === roleId);
    if (!role) return null;
    if (updates.name !== undefined) role.name = updates.name;
    if (updates.color !== undefined) role.color = updates.color;
    if (updates.permissions) {
      role.permissions = {
        ...role.permissions,
        ...updates.permissions
      };
    }
    await dbStorage.write('groups', groups);
    return role;
  },

  async deleteRole(groupId, roleId) {
    const groups = this.getAll();
    const group = groups.find(g => g.id === groupId);
    if (!group) return null;
    group.roles = group.roles.filter(r => r.id !== roleId);
    group.members.forEach(m => {
      m.roles = m.roles.filter(r => r !== roleId);
    });
    await dbStorage.write('groups', groups);
    return true;
  },

  async setMemberRoles(groupId, userId, roleIds) {
    const groups = this.getAll();
    const group = groups.find(g => g.id === groupId);
    if (!group) return null;
    const member = group.members.find(m => m.userId === userId);
    if (!member) return null;
    member.roles = roleIds;
    await dbStorage.write('groups', groups);
    return member;
  },

  async updateAutoMod(groupId, words) {
    const groups = this.getAll();
    const group = groups.find(g => g.id === groupId);
    if (!group) return null;
    group.autoModWords = Array.isArray(words) ? words : [];
    await dbStorage.write('groups', groups);
    return group.autoModWords;
  }
};
