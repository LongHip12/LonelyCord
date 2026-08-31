import { UserModel } from '../db/userModel.js';
import { hashPassword } from '../crypto/hash.js';
import { createToken, verifyToken } from '../crypto/token.js';

export async function authRoutes(fastify) {
  fastify.post('/api/auth/register', async (request, reply) => {
    const { username, displayName, password, remember30 } = request.body || {};
    if (!username || !password) {
      return reply.status(400).send({ error: 'MISSING_FIELDS', message: 'Vui lòng nhập tên người dùng và mật khẩu' });
    }
    const cleanUsername = String(username).trim();
    if (cleanUsername.length < 3 || cleanUsername.length > 32) {
      return reply.status(400).send({ error: 'INVALID_USERNAME', message: 'Tên người dùng từ 3 đến 32 ký tự' });
    }
    if (String(password).length < 6) {
      return reply.status(400).send({ error: 'WEAK_PASSWORD', message: 'Mật khẩu phải từ 6 ký tự trở lên' });
    }

    try {
      const passwordHash = hashPassword(password);
      const user = await UserModel.createUser({
        username: cleanUsername,
        displayName: (displayName && String(displayName).trim()) || cleanUsername,
        passwordHash
      });

      const token = createToken({ id: user.id, username: user.username });
      const expireTime = remember30 ? Date.now() + 30 * 24 * 60 * 60 * 1000 : null;
      const cookieOptions = {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: false
      };
      if (expireTime) {
        cookieOptions.expires = new Date(expireTime);
      }

      reply.setCookie('name', 'token', { path: '/', sameSite: 'lax' });
      reply.setCookie('token', token, cookieOptions);
      reply.setCookie('loginRemember', JSON.stringify({ expire: expireTime || 0 }), cookieOptions);

      return reply.send({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          avatar: user.avatar,
          voiceAvatar: user.voiceAvatar,
          bio: user.bio,
          joinedAt: user.joinedAt,
          customStatus: user.customStatus,
          settings: user.settings
        }
      });
    } catch (err) {
      if (err.message === 'USERNAME_EXISTS') {
        return reply.status(409).send({ error: 'USERNAME_EXISTS', message: 'Tên người dùng đã tồn tại' });
      }
      return reply.status(500).send({ error: 'SERVER_ERROR', message: 'Lỗi máy chủ khi đăng ký' });
    }
  });

  fastify.post('/api/auth/login', async (request, reply) => {
    const { username, password, remember30 } = request.body || {};
    if (!username || !password) {
      return reply.status(400).send({ error: 'MISSING_FIELDS', message: 'Vui lòng nhập tên người dùng và mật khẩu' });
    }
    const user = UserModel.findByUsername(String(username).trim());
    if (!user) {
      return reply.status(401).send({ error: 'INVALID_CREDENTIALS', message: 'Sai tên người dùng hoặc mật khẩu' });
    }
    const passwordHash = hashPassword(password);
    if (user.passwordHash !== passwordHash) {
      return reply.status(401).send({ error: 'INVALID_CREDENTIALS', message: 'Sai tên người dùng hoặc mật khẩu' });
    }

    const token = createToken({ id: user.id, username: user.username });
    const expireTime = remember30 ? Date.now() + 30 * 24 * 60 * 60 * 1000 : null;
    const cookieOptions = {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: false
    };
    if (expireTime) {
      cookieOptions.expires = new Date(expireTime);
    }

    reply.setCookie('name', 'token', { path: '/', sameSite: 'lax' });
    reply.setCookie('token', token, cookieOptions);
    reply.setCookie('loginRemember', JSON.stringify({ expire: expireTime || 0 }), cookieOptions);

    return reply.send({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        avatar: user.avatar,
        voiceAvatar: user.voiceAvatar,
        bio: user.bio,
        joinedAt: user.joinedAt,
        customStatus: user.customStatus,
        settings: user.settings
      }
    });
  });

  fastify.post('/api/auth/logout', async (request, reply) => {
    reply.clearCookie('name', { path: '/' });
    reply.clearCookie('token', { path: '/' });
    reply.clearCookie('loginRemember', { path: '/' });
    return reply.send({ success: true });
  });

  fastify.get('/api/auth/session', async (request, reply) => {
    const token = request.cookies?.token;
    if (!token) {
      return reply.status(401).send({ error: 'UNAUTHENTICATED' });
    }
    const verified = verifyToken(token);
    if (!verified || !verified.id) {
      return reply.status(401).send({ error: 'INVALID_TOKEN' });
    }
    const user = UserModel.findById(verified.id);
    if (!user) {
      return reply.status(401).send({ error: 'USER_NOT_FOUND' });
    }
    return reply.send({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        avatar: user.avatar,
        voiceAvatar: user.voiceAvatar,
        bio: user.bio,
        joinedAt: user.joinedAt,
        customStatus: user.customStatus,
        settings: user.settings
      }
    });
  });
}
