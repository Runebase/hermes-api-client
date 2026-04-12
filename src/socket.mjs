// src/socket.mjs
import { io } from 'socket.io-client';

export function createSocket(config) {
  const joinedGuilds = new Set();
  const tag = `[hermes-socket ${config.socketUrl}]`;

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
    console.log(`${tag} connected (id: ${socket.id})`);
    socket.emit('joinPrivate');
    for (const guildId of joinedGuilds) {
      socket.emit('joinGuild', { guildId });
    }
    errorCount.count = 0;
  });

  socket.on('connect_error', (err) => {
    errorCount.count += 1;
    console.log(`${tag} connect_error (#${errorCount.count}): ${err.message}`);
  });

  socket.on('reconnect', () => {
    console.log(`${tag} reconnected (id: ${socket.id})`);
    socket.emit('joinPrivate');
    for (const guildId of joinedGuilds) {
      socket.emit('joinGuild', { guildId });
    }
  });

  socket.on('disconnect', (reason) => {
    console.log(`${tag} disconnected: ${reason}`);
  });

  socket.on('reconnect_attempt', (attempt) => {
    console.log(`${tag} reconnect attempt #${attempt}`);
  });

  socket.on('reconnect_error', (err) => {
    errorCount.count += 1;
    console.log(`${tag} reconnect_error (#${errorCount.count}): ${err.message}`);
  });

  socket.on('wallets_updated', (wallets) => {
    console.log(`${tag} wallets_updated:`, wallets);
  });

  socket.on('pong', () => {
    console.log(`${tag} pong`);
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
    console.log(`${tag} error: ${err.message}`);
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