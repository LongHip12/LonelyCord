import fs from 'node:fs';
import path from 'node:path';
import { encrypt4Layer, decrypt4Layer } from '../crypto/cipher4.js';

const DB_DIR = path.resolve(process.cwd(), 'LonelyCord');

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

class StorageEngine {
  constructor() {
    this.memoryCache = new Map();
    this.writeQueues = new Map();
  }

  getFilePath(name) {
    return path.join(DB_DIR, `${name}.dat`);
  }

  read(name, defaultValue = []) {
    if (this.memoryCache.has(name)) {
      return JSON.parse(JSON.stringify(this.memoryCache.get(name)));
    }
    const filePath = this.getFilePath(name);
    if (!fs.existsSync(filePath)) {
      this.writeSync(name, defaultValue);
      return JSON.parse(JSON.stringify(defaultValue));
    }
    try {
      const raw = fs.readFileSync(filePath, 'utf8').trim();
      if (!raw) {
        this.writeSync(name, defaultValue);
        return JSON.parse(JSON.stringify(defaultValue));
      }
      const decrypted = decrypt4Layer(raw);
      if (!decrypted) {
        return JSON.parse(JSON.stringify(defaultValue));
      }
      const parsed = JSON.parse(decrypted);
      this.memoryCache.set(name, parsed);
      return JSON.parse(JSON.stringify(parsed));
    } catch {
      return JSON.parse(JSON.stringify(defaultValue));
    }
  }

  writeSync(name, data) {
    this.memoryCache.set(name, JSON.parse(JSON.stringify(data)));
    const filePath = this.getFilePath(name);
    const serialized = JSON.stringify(data);
    const encrypted = encrypt4Layer(serialized);
    const tempPath = `${filePath}.${Date.now()}.tmp`;
    fs.writeFileSync(tempPath, encrypted, 'utf8');
    fs.renameSync(tempPath, filePath);
  }

  async write(name, data) {
    this.memoryCache.set(name, JSON.parse(JSON.stringify(data)));
    if (!this.writeQueues.has(name)) {
      this.writeQueues.set(name, Promise.resolve());
    }
    const currentQueue = this.writeQueues.get(name);
    const nextQueue = currentQueue.then(async () => {
      const filePath = this.getFilePath(name);
      const serialized = JSON.stringify(data);
      const encrypted = encrypt4Layer(serialized);
      const tempPath = `${filePath}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}.tmp`;
      await fs.promises.writeFile(tempPath, encrypted, 'utf8');
      await fs.promises.rename(tempPath, filePath);
    }).catch(() => {});
    this.writeQueues.set(name, nextQueue);
    return nextQueue;
  }
}

export const dbStorage = new StorageEngine();
