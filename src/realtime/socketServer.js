import { Server } from 'socket.io';
import { verifyToken } from '../crypto/token.js';
import { UserModel } from '../db/userModel.js';
import { PresenceHandler } from './presenceHandler.js';
import { ChatHandler } from './chatHandler.js';
import { VoiceHandler } from './voiceHandler.js';

export function setupSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      credentials: true
    },
    transports: ['websocket', 'polling']
  });

  io.use((socket, next) => {
    const cookieHeader = socket.handshake.headers.cookie;
    let token = null;
    if (cookieHeader) {
      const match = cookieHeader.match(/(?:^|;\s*)token=([^;]+)/);
      if (match) {
        token = match[1];
      }
    }
    if (!token && socket.handshake.auth?.token) {
      token = socket.handshake.auth.token;
    }
    if (!token) {
      return next(new Error('AUTHENTICATION_REQUIRED'));
    }
    const verified = verifyToken(token);
    if (!verified || !verified.id) {
      return next(new Error('INVALID_TOKEN'));
    }
    const user = UserModel.findById(verified.id);
    if (!user) {
      return next(new Error('USER_NOT_FOUND'));
    }
    socket.user = {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatar: user.avatar,
      voiceAvatar: user.voiceAvatar,
      customStatus: user.customStatus
    };
    next();
  });

  io.on('connection', (socket) => {
    const user = socket.user;
    PresenceHandler.register(io, socket, user);
    ChatHandler.register(io, socket, user);
    VoiceHandler.register(io, socket, user);
  });

  return io;
}
