const userSocketMap = new Map();
const socketUserMap = new Map();
const userCustomStatus = new Map();

export const PresenceHandler = {
  register(io, socket, user) {
    const userId = user.id;
    if (!userSocketMap.has(userId)) {
      userSocketMap.set(userId, new Set());
    }
    userSocketMap.get(userId).add(socket.id);
    socketUserMap.set(socket.id, user);

    socket.join(`user_${userId}`);

    io.emit('presence_update', {
      userId,
      status: 'online',
      customStatus: user.customStatus || { icon: 'smile', text: '' }
    });

    socket.on('set_custom_status', (data) => {
      userCustomStatus.set(userId, data);
      io.emit('presence_update', {
        userId,
        status: 'online',
        customStatus: data
      });
    });

    socket.on('disconnect', () => {
      const sockets = userSocketMap.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          userSocketMap.delete(userId);
          io.emit('presence_update', {
            userId,
            status: 'offline'
          });
        }
      }
      socketUserMap.delete(socket.id);
    });
  },

  isUserOnline(userId) {
    const sockets = userSocketMap.get(userId);
    return Boolean(sockets && sockets.size > 0);
  },

  getUserSockets(userId) {
    return Array.from(userSocketMap.get(userId) || []);
  }
};
