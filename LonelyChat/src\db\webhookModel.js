import { dbStorage } from './storage.js';
import { generateId } from '../crypto/hash.js';

export const WebhookModel = {
  getAll() {
    return dbStorage.read('webhooks', []);
  },

  findById(id) {
    const webhooks = this.getAll();
    return webhooks.find(w => w.id === id) || null;
  },

  findByToken(token) {
    const webhooks = this.getAll();
    return webhooks.find(w => w.token === token) || null;
  },

  getByChannel(channelId) {
    const webhooks = this.getAll();
    return webhooks.filter(w => w.channelId === channelId);
  },

  async createWebhook({ channelId, name, avatar = '' }) {
    const webhooks = this.getAll();
    const id = generateId(20);
    const token = generateId(32);
    const newWebhook = {
      id,
      channelId,
      name,
      avatar,
      token,
      createdAt: new Date().toISOString()
    };
    webhooks.push(newWebhook);
    await dbStorage.write('webhooks', webhooks);
    return newWebhook;
  },

  async deleteWebhook(id) {
    const webhooks = this.getAll();
    const filtered = webhooks.filter(w => w.id !== id);
    if (filtered.length !== webhooks.length) {
      await dbStorage.write('webhooks', filtered);
      return true;
    }
    return false;
  }
};
