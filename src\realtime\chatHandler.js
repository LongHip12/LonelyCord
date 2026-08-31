import { MessageModel } from '../db/messageModel.js';
import { GroupModel } from '../db/groupModel.js';
import { FriendModel } from '../db/friendModel.js';
import { UserModel } from '../db/userModel.js';
import { PushService } from '../services/pushService.js';
import { PresenceHandler } from './presenceHandler.js';

const userRateLimits = new Map();

function checkRateLimit(userId) {
  const now = Date.now();
  if (!userRateLimits.has(userId)) {
    userRateLimits.set(userId, []);
  }
  const timestamps = userRateLimits.get(userId).filter(t => now - t < 1000);
  if (timestamps.length >= 5) {
    userRateLimits.set(userId, timestamps);
    return false;
  }
  timestamps.push(now);
  userRateLimits.set(userId, timestamps);
  return true;
}

export const ChatHandler = {
  register(io, socket, user) {
    socket.on('join_target', (targetId) => {
      socket.join(`room_${targetId}`);
    });

    socket.on('leave_target', (targetId) => {
      socket.leave(`room_${targetId}`);
    });

    socket.on('typing_start', ({ targetId }) => {
      socket.to(`room_${targetId}`).emit('user_typing', {
        targetId,
        userId: user.id,
        username: user.displayName || user.username
      });
    });

    socket.on('typing_stop', ({ targetId }) => {
      socket.to(`room_${targetId}`).emit('user_stop_typing', {
        targetId,
        userId: user.id
      });
    });

    socket.on('send_message', async (data, callback) => {
      const { targetType, targetId, content, attachments, replyTo, embeds } = data;

      if (!checkRateLimit(user.id)) {
        if (typeof callback === 'function') {
          callback({ success: false, error: 'RATE_LIMITED' });
        }
        return;
      }

      if (targetType === 'dm') {
        const parts = targetId.replace('dm_', '').split('_');
        const recipientId = parts[0] === user.id ? parts[1] : parts[0];
        if (FriendModel.isBlocked(user.id, recipientId)) {
          if (typeof callback === 'function') {
            callback({ success: false, error: 'BLOCKED' });
          }
          return;
        }
      }

      try {
        const message = await MessageModel.createMessage({
          targetType,
          targetId,
          authorId: user.id,
          content,
          attachments,
          replyTo,
          embeds
        });

        const enrichedMessage = {
          ...message,
          author: {
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            avatar: user.avatar,
            voiceAvatar: user.voiceAvatar
          }
        };

        io.to(`room_${targetId}`).emit('new_message', enrichedMessage);

        if (targetType === 'dm') {
          const parts = targetId.replace('dm_', '').split('_');
          const recipientId = parts[0] === user.id ? parts[1] : parts[0];
          io.to(`user_${recipientId}`).emit('dm_notification', enrichedMessage);
          
          if (!PresenceHandler.isUserOnline(recipientId)) {
            PushService.sendNotification(recipientId, {
              title: `${user.displayName || user.username}`,
              body: content ? content.slice(0, 100) : 'Đã gửi một tệp đính kèm',
              url: `/?dm=${user.id}`
            });
          }
        }

        if (typeof callback === 'function') {
          callback({ success: true, message: enrichedMessage });
        }
      } catch {
        if (typeof callback === 'function') {
          callback({ success: false, error: 'SERVER_ERROR' });
        }
      }
    });

    socket.on('delete_message_for_everyone', async ({ messageId, targetId }) => {
      const success = await MessageModel.deleteForEveryone(messageId, user.id);
      if (success) {
        io.to(`room_${targetId}`).emit('message_deleted_for_everyone', { messageId, targetId });
      }
    });
  }
};
