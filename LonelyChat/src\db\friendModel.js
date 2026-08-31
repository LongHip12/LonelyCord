import { dbStorage } from './storage.js';

export const FriendModel = {
  getAll() {
    return dbStorage.read('friends', []);
  },

  getUserRelations(userId) {
    const list = this.getAll();
    return list.filter(r => r.user1 === userId || r.user2 === userId);
  },

  getRelation(user1, user2) {
    const list = this.getAll();
    return list.find(r => (r.user1 === user1 && r.user2 === user2) || (r.user1 === user2 && r.user2 === user1)) || null;
  },

  async sendRequest(fromId, toId) {
    if (fromId === toId) return null;
    const list = this.getAll();
    const existing = list.find(r => (r.user1 === fromId && r.user2 === toId) || (r.user1 === toId && r.user2 === fromId));
    if (existing) {
      if (existing.status === 'blocked') return null;
      if (existing.status === 'accepted') return existing;
      if (existing.status === 'pending') {
        if (existing.senderId === toId) {
          existing.status = 'accepted';
          existing.updatedAt = new Date().toISOString();
          await dbStorage.write('friends', list);
          return existing;
        }
        return existing;
      }
    }
    const newRelation = {
      user1: fromId,
      user2: toId,
      senderId: fromId,
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    list.push(newRelation);
    await dbStorage.write('friends', list);
    return newRelation;
  },

  async acceptRequest(userId, requesterId) {
    const list = this.getAll();
    const item = list.find(r => (r.user1 === userId && r.user2 === requesterId) || (r.user1 === requesterId && r.user2 === userId));
    if (!item || item.status !== 'pending' || item.senderId === userId) return null;
    item.status = 'accepted';
    item.updatedAt = new Date().toISOString();
    await dbStorage.write('friends', list);
    return item;
  },

  async rejectRequest(userId, requesterId) {
    const list = this.getAll();
    const filtered = list.filter(r => !((r.user1 === userId && r.user2 === requesterId) || (r.user1 === requesterId && r.user2 === userId)));
    if (filtered.length !== list.length) {
      await dbStorage.write('friends', filtered);
      return true;
    }
    return false;
  },

  async removeFriend(userId, targetId) {
    return this.rejectRequest(userId, targetId);
  },

  async blockUser(userId, targetId) {
    const list = this.getAll();
    const existing = list.find(r => (r.user1 === userId && r.user2 === targetId) || (r.user1 === targetId && r.user2 === userId));
    if (existing) {
      existing.user1 = userId;
      existing.user2 = targetId;
      existing.senderId = userId;
      existing.status = 'blocked';
      existing.updatedAt = new Date().toISOString();
    } else {
      list.push({
        user1: userId,
        user2: targetId,
        senderId: userId,
        status: 'blocked',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
    await dbStorage.write('friends', list);
    return true;
  },

  async unblockUser(userId, targetId) {
    const list = this.getAll();
    const filtered = list.filter(r => !(((r.user1 === userId && r.user2 === targetId) || (r.user1 === targetId && r.user2 === userId)) && r.status === 'blocked' && r.senderId === userId));
    if (filtered.length !== list.length) {
      await dbStorage.write('friends', filtered);
      return true;
    }
    return false;
  },

  areFriends(user1, user2) {
    const rel = this.getRelation(user1, user2);
    return rel?.status === 'accepted';
  },

  isBlocked(user1, user2) {
    const rel = this.getRelation(user1, user2);
    return rel?.status === 'blocked';
  }
};
