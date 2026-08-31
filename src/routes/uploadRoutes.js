import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { generateId } from '../crypto/hash.js';
import { verifyToken } from '../crypto/token.js';
import { UserModel } from '../db/userModel.js';

const UPLOAD_DIR = path.resolve(process.cwd(), 'public', 'uploads');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

function getAuthUser(request) {
  const token = request.cookies?.token;
  if (!token) return null;
  const verified = verifyToken(token);
  if (!verified?.id) return null;
  return UserModel.findById(verified.id);
}

export async function uploadRoutes(fastify) {
  fastify.post('/api/uploads', async (request, reply) => {
    const user = getAuthUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHENTICATED' });

    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: 'NO_FILE_UPLOADED' });
    }

    const rawExt = path.extname(data.filename) || '';
    const safeExt = rawExt.slice(0, 10).replace(/[^a-zA-Z0-9.]/g, '') || '.bin';
    const uniqueName = `${Date.now()}_${generateId(12)}${safeExt}`;
    const targetPath = path.join(UPLOAD_DIR, uniqueName);

    await pipeline(data.file, fs.createWriteStream(targetPath));

    const stats = fs.statSync(targetPath);
    const url = `/uploads/${uniqueName}`;

    return reply.send({
      url,
      type: data.mimetype,
      name: data.filename,
      size: stats.size
    });
  });
}
