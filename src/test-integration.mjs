// test-integration.mjs
import dotenv from 'dotenv';
import { createHermesClient } from './index.mjs'; // Adjust path if needed

// Load .env early
dotenv.config();

// Ensure env vars are set (fail fast if not)
const apiUrl = process.env.API_URL;
const socketUrl = process.env.SOCKET_URL;
const apiKey = process.env.API_KEY;

if (!apiUrl || !socketUrl || !apiKey) {
  console.error('Missing required env vars: API_URL, SOCKET_URL, API_KEY');
  process.exit(1);
}

console.log(`Using API_URL: ${apiUrl}, SOCKET_URL: ${socketUrl}`); // Optional: Log for confirmation

async function runIntegrationTest() {
  try {
    const client = createHermesClient(); // No options needed—uses process.env via createConfig

    // Test private endpoint (with auth)
    console.log('Fetching wallets...');
    const wallets = await client.private.getWallets();
    console.log('Wallets: ', wallets);

    console.log('Fetching guild wallets...');
    const guildId = '873322086347702354' // Script Kiddie Test Server
    const guildWallets = await client.public.getGuildWallets(guildId)
    console.log('Guild Wallets: ', guildWallets);

    // Test socket (listen for an event—simulate/update as needed)
    console.log('Setting up socket listener...');
    client.socket.socket.on('wallets_updated', (data) => {
      console.log('Received wallets_updated:', data);
    });

    // Optional: Emit a ping or wait for a real-time update
    // client.socket.socket.emit('ping'); // If you want to trigger something

    // Keep the script alive for 10s to catch any socket events, then exit
    setTimeout(() => {
      console.log('Integration test complete!');
      process.exit(0);
    }, 10000);

  } catch (error) {
    console.error('Integration test failed:', error.message);
    process.exit(1);
  }
}

runIntegrationTest();