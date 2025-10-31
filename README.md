# hermes-api-client

NodeJS API client for Hermes

## Installation

1. Clone or download this repository.

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory with the required environment variables:
```
API_URL=your_api_url_here
SOCKET_URL=your_socket_url_here
API_KEY=your_api_key_here
```
## Usage
Import and initialize the client in your Node.js application:
```javascript
import { createHermesClient } from './index.mjs'; // Adjust path as needed

const client = createHermesClient(); // Automatically uses process.env for config

// Example: Fetch private wallets
const wallets = await client.private.getWallets();
console.log(wallets);

// Example: Send a tip
const tipResult = await client.private.tip({
  ticker: 'RUNES',
  recipientIds: ['user_id_1', 'user_id_2'],
  amountPerRecipient: '0.001',
  notifyChannelId: 'channel_id' // Optional
});
console.log(tipResult);
```
Refer to the source code (index.mjs) for full API methods, including public endpoints, guild operations, reactdrops, and socket events.

## Integration Tests
```bash
# Run all tests
node src/test-integration.mjs

# Run specific tests (comma-separated flags)
node src/test-integration.mjs --wallets --tip --sockets

# Run a single test
node src/test-integration.mjs --guild-tip
```