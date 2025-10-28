// src/index.mjs
import { createSocket } from './socket.mjs';
import { createApi } from './api.mjs';
import { createConfig } from './config.mjs';
// import { waitForStores } from './waitForStores.mjs';

export function createHermesClient(options = {}) {
  const config = createConfig(options);
  let socket = null;
  let initialized = false;
  const api = createApi(config);

  async function initialize() {
    if (!config.apiKey) {
      throw new Error('API_KEY is required');
    }
    socket = createSocket(config).socket;
    // 
    // const { pools, coins, wallets, userShares } = await waitForStores(socket);
    initialized = true;
    // return { pools, coins, wallets, userShares };
    return { };
  }

  function ensureInitialized() {
    if (!initialized) {
      throw new Error('Client not initialized. Call initialize() first.');
    }
  }

  return {
    initialize,
    getSocket: () => {
      ensureInitialized();
      return socket;
    },
    getWallets: api.getWallets,
    disconnect: () => {
      if (socket) {
        socket.disconnect();
      }
    },
  };
}
