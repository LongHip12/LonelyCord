import { dbStorage } from './storage.js';
import { generateId } from '../crypto/hash.js';

let registrationLock = Promise.resolve();

export const UserModel = {
  getAll() {
    return dbStorage.read('users', []);
  },

  findById(id) {
    const users = this.getAll();
    return users.find(u => u.id === id) || null;
  },

  findByUsername(username) {
    if (!username) return null;
    const users = this.getAll();
    return users.find(u => u.username.toLowerCase() === username.toLowerCase()) || null;
  },

  async createUser({ username, displayName, passwordHash }) {
    let resultUser = null;
    const previousLock = registrationLock;
    registrationLock = (async () => {
      await previousLock;
      const users = this.getAll();
      const exists = users.some(u => u.username.toLowerCase() === username.toLowerCase());
      if (exists) {
        throw new Error('USERNAME_EXISTS');
      }
      let newId = generateId(20);
      while (users.some(u => u.id === newId)) {
        newId = generateId(20);
      }
      const now = new Date().toISOString();
      const newUser = {
        id: newId,
        username,
        displayName: displayName || username,
        passwordHash,
        avatar: '',
        voiceAvatar: '',
        bio: '',
        joinedAt: now,
        customStatus: {
          icon: 'smile',
          text: ''
        },
        notes: {},
        pushSubscription: null,
        settings: {
          syntaxHighlight: true,
          notifications: true,
          screenDefaults: null
        }
      };
      users.push(newUser);
      await dbStorage.write('users', users);
      resultUser = newUser;
    })();
    await registrationLock;
    return resultUser;
  },

  async updateUser(id, updates) {
    const users = this.getAll();
    const index = users.findIndex(u => u.id === id);
    if (index === -1) return null;
    users[index] = { ...users[index], ...updates, id };
    await dbStorage.write('users', users);
    return users[index];
  },

  async deleteUser(id) {
    const users = this.getAll();
    const filtered = users.filter(u => u.id !== id);
    if (filtered.length !== users.length) {
      await dbStorage.write('users', filtered);
      return true;
    }
    return false;
  },

  searchUsers(query, limit = 20) {
    if (!query) return [];
    const q = query.toLowerCase();
    const users = this.getAll();
    return users
      .filter(u => u.username.toLowerCase().includes(q) || u.displayName.toLowerCase().includes(q))
      .slice(0, limit)
      .map(u => ({
        id: u.id,
        username: u.username,
        displayName: u.displayName,
        avatar: u.avatar,
        voiceAvatar: u.voiceAvatar,
        bio: u.bio,
        joinedAt: u.joinedAt,
        customStatus: u.customStatus
      }));
  }
};
