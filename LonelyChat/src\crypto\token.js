import crypto from 'node:crypto';
import { encrypt4Layer, decrypt4Layer } from './cipher4.js';
import { COOKIE_AES_KEY } from '../config/keys.js';

const base64PrefixChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function generateBase64Prefix(length = 3) {
  const bytes = crypto.randomBytes(length);
  let res = '';
  for (let i = 0; i < length; i++) {
    res += base64PrefixChars[bytes[i] % base64PrefixChars.length];
  }
  return res;
}

export function createToken(payload) {
  const prefix = generateBase64Prefix(3);
  const jsonStr = JSON.stringify(payload);
  const encPayload = encrypt4Layer(jsonStr);
  const block1 = `${prefix}${encPayload}`;
  const block2 = Date.now().toString(36);
  const hmac = crypto.createHmac('sha256', COOKIE_AES_KEY).update(`${block1}.${block2}`).digest('base64url');
  const block3 = hmac;
  return `${block1}.${block2}.${block3}`;
}

export function verifyToken(tokenStr) {
  if (!tokenStr || typeof tokenStr !== 'string') return null;
  const parts = tokenStr.split('.');
  if (parts.length !== 3) return null;
  const [block1, block2, block3] = parts;
  if (block1.length < 4) return null;
  const expectedHmac = crypto.createHmac('sha256', COOKIE_AES_KEY).update(`${block1}.${block2}`).digest('base64url');
  if (expectedHmac !== block3) return null;
  const encPayload = block1.slice(3);
  const decrypted = decrypt4Layer(encPayload);
  if (!decrypted) return null;
  try {
    return JSON.parse(decrypted);
  } catch {
    return null;
  }
}
