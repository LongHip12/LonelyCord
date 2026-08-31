import crypto from 'node:crypto';
import { COOKIE_AES_KEY } from '../config/keys.js';

const aesKey = crypto.createHash('sha256').update(COOKIE_AES_KEY).digest();
const xorKey = crypto.createHash('md5').update(COOKIE_AES_KEY).digest();

export function xorTransform(buffer) {
  const result = Buffer.alloc(buffer.length);
  for (let i = 0; i < buffer.length; i++) {
    result[i] = buffer[i] ^ xorKey[i % xorKey.length];
  }
  return result;
}

export function encrypt4Layer(plainText) {
  const base64Str = Buffer.from(String(plainText), 'utf8').toString('base64');
  const base64Buf = Buffer.from(base64Str, 'utf8');
  const xorBuf = xorTransform(base64Buf);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', aesKey, iv);
  const encrypted = Buffer.concat([cipher.update(xorBuf), cipher.final()]);
  return Buffer.concat([iv, encrypted]).toString('base64url');
}

export function decrypt4Layer(encodedText) {
  try {
    const rawBuf = Buffer.from(encodedText, 'base64url');
    if (rawBuf.length < 17) return null;
    const iv = rawBuf.subarray(0, 16);
    const encrypted = rawBuf.subarray(16);
    const decipher = crypto.createDecipheriv('aes-256-cbc', aesKey, iv);
    const xorBuf = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    const base64Buf = xorTransform(xorBuf);
    const base64Str = base64Buf.toString('utf8');
    return Buffer.from(base64Str, 'base64').toString('utf8');
  } catch {
    return null;
  }
}
