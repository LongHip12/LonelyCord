class MediaManager {
  constructor() {
    this.rooms = new Map();
    this.socketToRoom = new Map();
  }

  getRoom(channelId) {
    if (!this.rooms.has(channelId)) {
      this.rooms.set(channelId, new Map());
    }
    return this.rooms.get(channelId);
  }

  joinRoom(channelId, data) {
    const room = this.getRoom(channelId);
    const peerId = data.socketId;
    const participant = {
      peerId,
      channelId,
      userId: data.userId,
      socketId: data.socketId,
      username: data.username,
      displayName: data.displayName || data.username,
      avatar: data.avatar || '',
      voiceAvatar: data.voiceAvatar || data.avatar || '',
      micMuted: data.micMuted !== undefined ? data.micMuted : true,
      camEnabled: Boolean(data.camEnabled),
      screenSharing: Boolean(data.screenSharing),
      isSpeaking: Boolean(data.isSpeaking),
      screenPreview: data.screenPreview || '',
      joinedAt: Date.now()
    };
    room.set(peerId, participant);
    this.socketToRoom.set(peerId, channelId);
    return participant;
  }

  leaveRoom(socketId) {
    const channelId = this.socketToRoom.get(socketId);
    if (!channelId) return null;
    this.socketToRoom.delete(socketId);
    if (this.rooms.has(channelId)) {
      const room = this.rooms.get(channelId);
      const participant = room.get(socketId);
      room.delete(socketId);
      if (room.size === 0) {
        this.rooms.delete(channelId);
      }
      return participant;
    }
    return null;
  }

  getParticipantBySocketId(socketId) {
    const channelId = this.socketToRoom.get(socketId);
    if (!channelId || !this.rooms.has(channelId)) return null;
    return this.rooms.get(channelId).get(socketId) || null;
  }

  getParticipants(channelId) {
    if (!this.rooms.has(channelId)) return [];
    return Array.from(this.rooms.get(channelId).values());
  }

  updateParticipant(socketId, updates) {
    const participant = this.getParticipantBySocketId(socketId);
    if (!participant) return null;
    Object.assign(participant, updates);
    return participant;
  }
}

export const mediaManager = new MediaManager();
export const mediaRoomManager = mediaManager;
