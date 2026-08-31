class SocketClient {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.listeners = new Map();
  }

  connect() {
    if (this.socket) return;
    this.socket = window.io({
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 20,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000
    });

    this.socket.on('connect', () => {
      this.connected = true;
      this.emitInternal('connect');
    });

    this.socket.on('disconnect', (reason) => {
      this.connected = false;
      this.emitInternal('disconnect', reason);
    });

    this.socket.on('connect_error', (err) => {
      this.emitInternal('connect_error', err);
    });

    this.socket.onAny((eventName, ...args) => {
      this.emitInternal(eventName, ...args);
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
    }
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
  }

  emitInternal(event, ...args) {
    if (this.listeners.has(event)) {
      for (const cb of this.listeners.get(event)) {
        try {
          cb(...args);
        } catch {}
      }
    }
  }

  emit(event, data, callback) {
    if (!this.socket) return;
    this.socket.emit(event, data, callback);
  }
}

export const socketClient = new SocketClient();
