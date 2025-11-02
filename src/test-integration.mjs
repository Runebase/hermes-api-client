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

// Parse command-line flags to determine which tests to run
// Usage: node test-integration.mjs --wallets --guild-wallets --tip --guild-tip --reactdrop --partydrop --flood --rain --soak --guild-flood --guild-rain --guild-soak --guild-reactdrop --guild-partydrop --sockets --trivia-categories --trivia-questions --trivia-questions-by-id
// If no flags are provided, run all tests by default
const args = process.argv.slice(2);
const runAll = args.length === 0;

const runWallets = runAll || args.includes('--wallets');
const runGuildWallets = runAll || args.includes('--guild-wallets');
const runTip = runAll || args.includes('--tip');
const runGuildTip = runAll || args.includes('--guild-tip');
const runReactdrop = runAll || args.includes('--reactdrop');
const runPartydrop = runAll || args.includes('--partydrop');
const runFlood = runAll || args.includes('--flood');
const runRain = runAll || args.includes('--rain');
const runSoak = runAll || args.includes('--soak');
const runGuildFlood = runAll || args.includes('--guild-flood');
const runGuildRain = runAll || args.includes('--guild-rain');
const runGuildSoak = runAll || args.includes('--guild-soak');
const runGuildReactdrop = runAll || args.includes('--guild-reactdrop');
const runGuildPartydrop = runAll || args.includes('--guild-partydrop');
const runSockets = runAll || args.includes('--sockets');
const runTriviaCategories = runAll || args.includes('--trivia-categories');
const runTriviaQuestions = runAll || args.includes('--trivia-questions');
const runTriviaQuestionById = runAll || args.includes('--trivia-questions-by-id');

const guildId = '873322086347702354'; // script kiddies chat

async function runIntegrationTest() {
  try {
    const client = createHermesClient(); // No options needed—uses process.env via createConfig

    if (runWallets) {
      // Test private endpoint (with auth)
      console.log('Fetching wallets...');
      const wallets = await client.private.getWallets();
      console.log('Wallets: ', wallets);
    }

    if (runGuildWallets) {
      console.log('Fetching guild wallets...');
      const guildId = '873322086347702354'; // Script Kiddie Test Server
      const guildWallets = await client.public.getGuildWallets(guildId);
      console.log('Guild Wallets: ', guildWallets);
    }

    if (runTip) {
      // Test tip endpoint
      console.log('Sending tip...');
      const tipResult = await client.private.tip({
        ticker: 'RUNES',
        recipientIds: [
          '370026641323327491',
          '432117250833645570'
        ],
        amountPerRecipient: '0.001',
        notifyChannelId: '1163655822719602688' // Optional
      });
      console.log('Tip result: ', tipResult);
    }

    if (runGuildTip) {
      // Test guild tip endpoint
      console.log('Sending guild tip...');
      const guildTipResult = await client.private.guildTip(guildId, {
        ticker: 'RUNES',
        recipientIds: [
          '370026641323327491',
          '432117250833645570'
        ],
        amountPerRecipient: '0.001',
        notifyChannelId: '1163655822719602688' // Optional
      });
      console.log('Guild tip result: ', guildTipResult);
    }

    if (runReactdrop) {
      // Test reactdrop endpoint
      console.log('Sending reactdrop...');
      const reactdropResult = await client.private.reactdrop({
        ticker: 'RUNES',
        amount: '0.001',
        channelId: '1163655822719602688',
        duration: 300000,
        emoji: null,    
        roleId: '1059268963307102238',
      });
      console.log('Reactdrop result: ', reactdropResult);
    }

    if (runPartydrop) {
      // Test partydrop endpoint
      console.log('Sending partydrop...');
      const partydropResult = await client.private.partydrop({
        ticker: 'RUNES',
        amount: '0.001',
        channelId: '1163655822719602688',
        duration: 300000,
        roleId: '1059268963307102238',
      });
      console.log('Partydrop result: ', partydropResult);
    }

    if (runFlood) {
      // Test flood endpoint
      console.log('Sending flood...');
      const floodResult = await client.private.flood({
        ticker: 'RUNES',
        amount: '0.001',
        maxRecipients: '400',
        channelId: '1163655822719602688',
        roleId: '1059268963307102238', // Optional
      });
      console.log('Flood result: ', floodResult);
    }

    if (runRain) {
      // Test rain endpoint
      console.log('Sending rain...');
      const rainResult = await client.private.rain({
        ticker: 'RUNES',
        amount: '0.001',
        maxRecipients: '400',
        channelId: '1163655822719602688',
        roleId: '1059268963307102238', // Optional
      });
      console.log('Rain result: ', rainResult);
    }

    if (runSoak) {
      // Test soak endpoint
      console.log('Sending soak...');
      const soakResult = await client.private.soak({
        ticker: 'RUNES',
        amount: '0.001',
        maxRecipients: '400',
        channelId: '1163655822719602688',
        roleId: '1059268963307102238', // Optional
      });
      console.log('Soak result: ', soakResult);
    }

    if (runGuildFlood) {
      // Test guild flood endpoint
      console.log('Sending guild flood...');
      const guildFloodResult = await client.private.guildFlood(guildId, {
        ticker: 'RUNES',
        amount: '0.001',
        maxRecipients: '400',
        channelId: '1163655822719602688',
        roleId: '1059268963307102238', // Optional
      });
      console.log('Guild flood result: ', guildFloodResult);
    }

    if (runGuildRain) {
      // Test guild rain endpoint
      console.log('Sending guild rain...');
      const guildRainResult = await client.private.guildRain(guildId, {
        ticker: 'RUNES',
        amount: '0.001',
        maxRecipients: '400',
        channelId: '1163655822719602688',
        roleId: '1059268963307102238', // Optional
      });
      console.log('Guild rain result: ', guildRainResult);
    }

    if (runGuildSoak) {
      // Test guild soak endpoint
      console.log('Sending guild soak...');
      const guildSoakResult = await client.private.guildSoak(guildId, {
        ticker: 'RUNES',
        amount: '0.001',
        maxRecipients: '400',
        channelId: '1163655822719602688',
        roleId: '1059268963307102238', // Optional
      });
      console.log('Guild soak result: ', guildSoakResult);
    }

    if (runGuildReactdrop) {
      // Test guild reactdrop endpoint
      console.log('Sending guild reactdrop...');
      const guildReactdropResult = await client.private.guildReactdrop(guildId, {
        ticker: 'RUNES',
        amount: '0.001',
        channelId: '1163655822719602688',
        duration: 300000,
        emoji: null,    
        roleId: '1059268963307102238',
      });
      console.log('Guild reactdrop result: ', guildReactdropResult);
    }

    if (runGuildPartydrop) {
      // Test guild partydrop endpoint
      console.log('Sending guild partydrop...');
      const guildPartydropResult = await client.private.guildPartydrop(guildId, {
        ticker: 'RUNES',
        amount: '0.001',
        channelId: '1163655822719602688',
        duration: 300000,
        roleId: '1059268963307102238',
      });
      console.log('Guild partydrop result: ', guildPartydropResult);
    }

    if (runTriviaCategories) {
      console.log('Fetching trivia categories...');
      const categories = await client.public.getTriviaCategories();
      console.log('Trivia Categories: ', categories);
    }

    if (runTriviaQuestions) {
      console.log('Fetching trivia questions...');
      const questions = await client.public.getTriviaQuestions();
      console.log('Trivia Questions: ', questions);
    }

    if (runTriviaQuestionById) {
      console.log('Fetching trivia question by ID...');
      const question = await client.public.getTriviaQuestionById('8e429348-8572-45e1-bc74-880fe684f4a0');
      console.log('Trivia Question by ID: ', question);
    }

    let shouldWait = false;

    if (runSockets) {
      // Test socket (listen for an event—simulate/update as needed)
      console.log('Setting up socket listener...');
      client.socket.socket.on('wallets_updated', (data) => {
        console.log('Received wallets_updated:', data);
      });

      client.socket.socket.on('tip_received', (data) => {
        console.log('Received tip_received:', data);
      });

      // Optional: Emit a ping or wait for a real-time update
      // client.socket.socket.emit('ping'); // If you want to trigger something

      shouldWait = true;
    }

    // Keep the script alive for 10s to catch any socket events if sockets are enabled, then exit
    if (shouldWait) {
      setTimeout(() => {
        console.log('Integration test complete!');
        process.exit(0);
      }, 10000);
    } else {
      console.log('Integration test complete!');
      process.exit(0);
    }

  } catch (error) {
    console.error('Integration test failed:', error.message);
    process.exit(1);
  }
}

runIntegrationTest();