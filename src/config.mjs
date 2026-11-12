// src/config.mjs
export function createConfig(options = {}) {
  return {
    apiUrl: options.apiUrl || process.env.API_URL || 'http://localhost:3010',
    socketUrl: options.socketUrl || process.env.SOCKET_URL || 'http://localhost:3010',
    apiKey: options.apiKey || process.env.API_KEY || '',
    // Give up on a call after this many ms (axios `timeout`; the error then has
    // no status, `noResponse: true`, `code: 'ECONNABORTED'`). 0, the default: never.
    timeout: Number.isFinite(options.timeout) && options.timeout > 0 ? options.timeout : 0,
    guildSecurity: {
      sessions: options.guildSecurity?.sessions || {},
      autoRefresh: options.guildSecurity?.autoRefresh !== false,
      defaultTtlSeconds: options.guildSecurity?.defaultTtlSeconds || null,
      onSessionUpdate: options.guildSecurity?.onSessionUpdate || null,
      onRefreshError: options.guildSecurity?.onRefreshError || null,
    },
  };
}
