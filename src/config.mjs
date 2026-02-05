// src/config.mjs
export function createConfig(options = {}) {
  return {
    apiUrl: options.apiUrl || process.env.API_URL || 'http://localhost:3010',
    socketUrl: options.socketUrl || process.env.SOCKET_URL || 'http://localhost:3010',
    apiKey: options.apiKey || process.env.API_KEY || '',
    guildSecurity: {
      sessions: options.guildSecurity?.sessions || {},
      autoRefresh: options.guildSecurity?.autoRefresh !== false,
      defaultTtlSeconds: options.guildSecurity?.defaultTtlSeconds || null,
      onSessionUpdate: options.guildSecurity?.onSessionUpdate || null,
    },
  };
}
