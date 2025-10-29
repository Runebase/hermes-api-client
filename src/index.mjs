// src/index.mjs
import { createSocket } from './socket.mjs';
import { createPrivateApi, createPublicApi } from './api.mjs';
import { createConfig } from './config.mjs';
// import { waitForStores } from './waitForStores.mjs';

export function createHermesClient(options = {}) {
  const config = createConfig(options);
  return {
    public: createPublicApi(config),
    private: createPrivateApi(config),
    socket: createSocket(config), // Private socket
  };
}


