import { mediaManager } from '../sfu/mediaManager.js';
import { UserModel } from '../db/userModel.js';

export function registerVoiceHandlers(io, socket, user) {
  socket.on('join_voice_channel', ({ channelId }) => {
    const currentUser = socket.user || user;
    if (!currentUser) return;

    mediaManager.leaveRoom(socket.id);

    const participant = mediaManager.joinRoom(channelId, {
      userId: currentUser.id,
      socketId: socket.id,
      username: currentUser.username,
      displayName: currentUser.displayName || currentUser.username,
      avatar: currentUser.avatar,
      voiceAvatar: currentUser.voiceAvatar,
      micMuted: true,
      camEnabled: false,
      screenSharing: false,
      isSpeaking: false,
      isStageSpeaker: false
    });

    socket.join(`voice_${channelId}`);

    const allInRoom = mediaManager.getParticipants(channelId);
    const others = allInRoom.filter(p => p.socketId !== socket.id);

    socket.emit('voice_room_joined', {
      channelId,
      participants: others,
      self: participant
    });

    socket.to(`voice_${channelId}`).emit('voice_participant_joined', participant);
  });

  socket.on('leave_voice_channel', () => {
    const participant = mediaManager.getParticipantBySocketId(socket.id);
    if (!participant) return;

    const channelId = participant.channelId;
    mediaManager.leaveRoom(socket.id);
    socket.leave(`voice_${channelId}`);

    io.to(`voice_${channelId}`).emit('voice_participant_left', {
      peerId: socket.id
    });
  });

  socket.on('voice_update_media', (updates) => {
    const updated = mediaManager.updateParticipant(socket.id, updates);
    if (updated) {
      io.to(`voice_${updated.channelId}`).emit('voice_participant_updated', {
        peerId: socket.id,
        updates
      });
    }
  });

  socket.on('voice_speaking', ({ isSpeaking }) => {
    const participant = mediaManager.getParticipantBySocketId(socket.id);
    if (!participant) return;
    participant.isSpeaking = Boolean(isSpeaking);
    io.to(`voice_${participant.channelId}`).emit('voice_speaking_status', {
      peerId: socket.id,
      isSpeaking: Boolean(isSpeaking)
    });
  });

  socket.on('voice_soundboard_play', ({ soundId }) => {
    const participant = mediaManager.getParticipantBySocketId(socket.id);
    if (!participant) return;
    io.to(`voice_${participant.channelId}`).emit('voice_soundboard_played', {
      peerId: socket.id,
      soundId,
      username: participant.displayName || participant.username
    });
  });

  socket.on('voice_screen_preview', ({ previewDataUrl }) => {
    const participant = mediaManager.getParticipantBySocketId(socket.id);
    if (participant) {
      participant.screenPreview = previewDataUrl;
      socket.to(`voice_${participant.channelId}`).emit('voice_screen_preview_update', {
        peerId: socket.id,
        screenPreview: previewDataUrl
      });
    }
  });

  socket.on('webrtc_signal', ({ targetPeerId, signal }) => {
    io.to(targetPeerId).emit('webrtc_signal', {
      senderPeerId: socket.id,
      signal
    });
  });

  socket.on('dm_call_initiate', ({ targetUserId }) => {
    const caller = socket.user || user;
    if (!caller) return;
    io.to(`user_${targetUserId}`).emit('dm_incoming_call', {
      callerId: caller.id,
      callerName: caller.displayName || caller.username,
      callerAvatar: caller.avatar,
      callerSocketId: socket.id
    });
  });

  socket.on('dm_call_response', ({ callerSocketId, accepted }) => {
    io.to(callerSocketId).emit('dm_call_response_received', {
      responderSocketId: socket.id,
      accepted
    });
  });

  socket.on('dm_call_end', ({ targetUserId, targetSocketId }) => {
    if (targetSocketId) {
      io.to(targetSocketId).emit('dm_call_ended');
    }
    if (targetUserId) {
      io.to(`user_${targetUserId}`).emit('dm_call_ended');
    }
  });
}

export const VoiceHandler = {
  register(io, socket, user) {
    registerVoiceHandlers(io, socket, user);
  }
};
