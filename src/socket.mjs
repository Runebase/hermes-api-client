// src/socket.mjs
import { io } from 'socket.io-client';

export function createSocket(config) {
  const socket = io(config.socketUrl, {
    auth: { authorization: `Bearer ${config.apiKey}` },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  const errorCount = { count: 0 }; // Track connection errors

  socket.on('connect', () => {
    socket.emit('joinPrivate');
    errorCount.count = 0;
  });

  socket.on('connect_error', (err) => {
    console.log('Socket connect error:', err.message);
    errorCount.count += 1;
  });

  socket.on('reconnect', () => {
    socket.emit('joinPrivate');
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

  socket.on('connect', () => {
  });

  socket.on('error', (err) => {
    console.log('Socket error:', err.message);
  });

  return { socket };
}