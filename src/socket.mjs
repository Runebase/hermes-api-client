// src/socket.mjs
import { io } from 'socket.io-client';

export function createSocket(config) {
  const joinedGuilds = new Set();

  const socket = io(config.socketUrl, {
    auth: { authorization: `Bearer ${config.apiKey}` },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  const errorCount = { count: 0 };

  socket.on('connect', () => {
    socket.emit('joinPrivate');
    // Re-join guild rooms after reconnect
    for (const guildId of joinedGuilds) {
      socket.emit('joinGuild', { guildId });
    }
    errorCount.count = 0;
  });

  socket.on('connect_error', (err) => {
    console.log('Socket connect error:', err.message);
    errorCount.count += 1;
  });

  socket.on('reconnect', () => {
    socket.emit('joinPrivate');
    for (const guildId of joinedGuilds) {
      socket.emit('joinGuild', { guildId });
    }
  });

  socket.on('disconnect', (reason) => {
    console.log('Disconnected from Socket.IO server:', reason);
  });

  socket.on('reconnect_attempt', (attempt) => {
    console.log(`Reconnect attempt #${attempt}`);
  });

  socket.on('reconnect_error', (err) => {
    console.log('Reconnect error:', err.message);
    errorCount.count += 1;
  });

  socket.on('wallets_updated', (wallets) => {
    console.log('Received wallets_updated:', wallets);
  });

  socket.on('pong', () => {
    console.log('Received pong from server');
  });

  const heartbeatInterval = setInterval(() => {
    if (socket.connected) {
      socket.emit('ping');
    }
  }, 30000);

  socket.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  socket.on('error', (err) => {
    console.log('Socket error:', err.message);
  });

  return {
    socket,

    joinGuild(guildId) {
      joinedGuilds.add(guildId);
      if (socket.connected) {
        socket.emit('joinGuild', { guildId });
      }
    },

    leaveGuild(guildId) {
      joinedGuilds.delete(guildId);
      if (socket.connected) {
        socket.emit('leaveGuild', { guildId });
      }
    },

    on(event, callback) {
      socket.on(event, callback);
      return () => socket.off(event, callback);
    },

    off(event, callback) {
      socket.off(event, callback);
    },

    disconnect() {
      joinedGuilds.clear();
      clearInterval(heartbeatInterval);
      socket.disconnect();
    },
  };
}