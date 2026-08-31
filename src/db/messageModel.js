import { dbStorage } from './storage.js';
import { generateId } from '../crypto/hash.js';

export const MessageModel = {
  getAll() {
    return dbStorage.read('messages', []);
  },

  findById(id) {
    const messages = this.getAll();
    return messages.find(m => m.id === id) || null;
  },

  async createMessage({ targetType, targetId, authorId, content, attachments = [], replyTo = null, webhook = null, embeds = [] }) {
    const messages = this.getAll();
    const messageId = `msg_${generateId(18)}`;
    const now = new Date().toISOString();

    const newMessage = {
      id: messageId,
      targetType,
      targetId,
      authorId,
      content,
      attachments,
      replyTo,
      webhook,
      embeds,
      reactions: {},
      isPinned: false,
      deletedFor: [],
      createdAt: now,
      updatedAt: now
    };

    messages.push(newMessage);
    await dbStorage.write('messages', messages);
    return newMessage;
  },

  async toggleReaction(messageId, userId, reactionType) {
    const messages = this.getAll();
    const msg = messages.find(m => m.id === messageId);
    if (!msg) return null;
    if (!msg.reactions) msg.reactions = {};
    if (!msg.reactions[reactionType]) msg.reactions[reactionType] = [];

    const idx = msg.reactions[reactionType].indexOf(userId);
    if (idx === -1) {
      msg.reactions[reactionType].push(userId);
    } else {
      msg.reactions[reactionType].splice(idx, 1);
      if (msg.reactions[reactionType].length === 0) {
        delete msg.reactions[reactionType];
      }
    }
    await dbStorage.write('messages', messages);
    return { reactions: msg.reactions, targetId: msg.targetId, messageId: msg.id };
  },

  async togglePin(messageId) {
    const messages = this.getAll();
    const msg = messages.find(m => m.id === messageId);
    if (!msg) return null;
    msg.isPinned = !msg.isPinned;
    await dbStorage.write('messages', messages);
    return { isPinned: msg.isPinned, message: msg };
  },

  getPinnedMessages(targetId) {
    const messages = this.getAll();
    return messages.filter(m => m.targetId === targetId && m.isPinned);
  },

  getByChannel(channelId, { limit = 50, before = null } = {}) {
    const messages = this.getAll();
    let filtered = messages.filter(m => m.targetType === 'channel' && m.targetId === channelId);
    if (before) {
      const idx = filtered.findIndex(m => m.id === before);
      if (idx !== -1) {
        filtered = filtered.slice(0, idx);
      }
    }
    return filtered.slice(-limit);
  },

  getDmConversation(userAId, userBId, { limit = 50, before = null } = {}) {
    const messages = this.getAll();
    let filtered = messages.filter(m => {
      if (m.targetType !== 'dm') return false;
      const isA = m.authorId === userAId && m.targetId === userBId;
      const isB = m.authorId === userBId && m.targetId === userAId;
      const isDirect = (m.targetId === `${userAId}_${userBId}` || m.targetId === `${userBId}_${userAId}`);
      return isA || isB || isDirect;
    });

    if (before) {
      const idx = filtered.findIndex(m => m.id === before);
      if (idx !== -1) {
        filtered = filtered.slice(0, idx);
      }
    }
    return filtered.slice(-limit);
  },

  async deleteForMe(messageId, userId) {
    const messages = this.getAll();
    const msg = messages.find(m => m.id === messageId);
    if (!msg) return false;
    if (!msg.deletedFor.includes(userId)) {
      msg.deletedFor.push(userId);
      await dbStorage.write('messages', messages);
    }
    return true;
  },

  async deleteForEveryone(messageId) {
    const messages = this.getAll();
    const filtered = messages.filter(m => m.id !== messageId);
    if (filtered.length !== messages.length) {
      await dbStorage.write('messages', filtered);
      return true;
    }
    return false;
  }
};
