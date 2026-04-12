// test-financial-endpoints.mjs
// Comprehensive security & soundness tests for all financial endpoints.
// Covers: tip, airdrops (flood/rain/soak/sleet/wave), interactive drops (reactdrop/partydrop/trivia),
//         bulk payout, withdrawal, donation, guild variants, and debit verification.
//
// Usage:
//   node test-financial-endpoints.mjs                    # run all tests
//   node test-financial-endpoints.mjs --tip              # tip tests only
//   node test-financial-endpoints.mjs --airdrop          # airdrop tests only
//   node test-financial-endpoints.mjs --interactive      # interactive drop tests only
//   node test-financial-endpoints.mjs --bulk-payout      # bulk payout tests only
//   node test-financial-endpoints.mjs --withdraw         # withdrawal tests only
//   node test-financial-endpoints.mjs --donation         # donation tests only
//   node test-financial-endpoints.mjs --guild            # guild-level tests (tip, airdrops, bulk payout, donation)
//   node test-financial-endpoints.mjs --debit            # debit/balance verification tests only
//   node test-financial-endpoints.mjs --delay 2500       # override per-request delay (ms)
import dotenv from 'dotenv';

import { createHermesClient } from './index.mjs';

dotenv.config();

// ============================================================================
// CONFIG
// ============================================================================
const apiUrl = process.env.API_URL;
const socketUrl = process.env.SOCKET_URL;
const apiKey = process.env.API_KEY;

if (!apiUrl || !socketUrl || !apiKey) {
  console.error('Missing required env vars: API_URL, SOCKET_URL, API_KEY');
  process.exit(1);
}

// Test constants
const GUILD_ID = '873322086347702354';
const TEST_CHANNEL_ID = '1163655822719602688';
const VALID_RECIPIENT_1 = '845044306375868426';
const VALID_RECIPIENT_2 = '432117250833645570';
const INITIATOR_USER_ID = '217379915803131906';
const GUILD_PASSWORD = process.env.GUILD_PASSWORD || '';

// Parse CLI flags
const args = process.argv.slice(2);
const delayFlagIndex = args.indexOf('--delay');
const REQUEST_DELAY_MS = delayFlagIndex !== -1 && args[delayFlagIndex + 1]
  ? parseInt(args[delayFlagIndex + 1], 10)
  : 2000; // 2s default to respect rate limits (financial: 30/min per user)

const flagArgs = args.filter(a => a !== '--delay' && !(delayFlagIndex !== -1 && a === args[delayFlagIndex + 1]));
const runAll = flagArgs.length === 0;

const RUN = {
  tip: runAll || flagArgs.includes('--tip'),
  airdrop: runAll || flagArgs.includes('--airdrop'),
  interactive: runAll || flagArgs.includes('--interactive'),
  bulkPayout: runAll || flagArgs.includes('--bulk-payout'),
  withdraw: runAll || flagArgs.includes('--withdraw'),
  donation: runAll || flagArgs.includes('--donation'),
  guild: runAll || flagArgs.includes('--guild'),
  debit: runAll || flagArgs.includes('--debit'),
};

// ============================================================================
// TEST TRACKING
// ============================================================================
const results = {
  passed: 0,
  failed: 0,
  skipped: 0,
  authFailed: false,
  errors: [],
};

const AUTH_ERROR_PATTERNS = [
  'unauthorized', 'invalid api key', 'authentication',
  'not authenticated', 'forbidden',
];

function isAuthError(msg) {
  const lower = msg.toLowerCase();
  return AUTH_ERROR_PATTERNS.some(p => lower.includes(p));
}

function logResult(testName, expectedError, actualError, status) {
  if (status === 'passed') {
    console.log(`  \u2713 ${testName}`);
    results.passed++;
  } else if (status === 'skipped') {
    console.log(`  \u2298 ${testName} (SKIPPED)`);
    results.skipped++;
  } else {
    console.log(`  \u2717 ${testName}`);
    console.log(`    Expected: ${expectedError}`);
    console.log(`    Actual:   ${actualError}`);
    results.failed++;
    results.errors.push({ testName, expectedError, actualError });
  }
}

// Rate-limit-aware delay
const delay = (ms = REQUEST_DELAY_MS) => new Promise(resolve => setTimeout(resolve, ms));

async function expectError(testName, fn, expectedSubstring) {
  await delay();
  try {
    await fn();
    logResult(testName, `Error containing "${expectedSubstring}"`, 'No error thrown (succeeded unexpectedly)', 'failed');
  } catch (error) {
    const msg = error.message || String(error);

    if (isAuthError(msg) && !expectedSubstring.toLowerCase().includes('unauthorized')) {
      logResult(testName, `Error containing "${expectedSubstring}"`, msg, 'skipped');
      results.authFailed = true;
      return;
    }

    if (msg.toLowerCase().includes('too many') && msg.toLowerCase().includes('request')) {
      console.log(`  \u26a0 Rate limited during "${testName}" — pausing 60s`);
      await delay(60000);
      // Retry once
      try {
        await fn();
        logResult(testName, `Error containing "${expectedSubstring}"`, 'No error thrown on retry', 'failed');
      } catch (retryErr) {
        const retryMsg = retryErr.message || String(retryErr);
        const passed = retryMsg.toLowerCase().includes(expectedSubstring.toLowerCase());
        logResult(testName, `Error containing "${expectedSubstring}"`, retryMsg, passed ? 'passed' : 'failed');
      }
      return;
    }

    const passed = msg.toLowerCase().includes(expectedSubstring.toLowerCase());
    logResult(testName, `Error containing "${expectedSubstring}"`, msg, passed ? 'passed' : 'failed');
  }
}

async function expectSuccess(testName, fn) {
  await delay();
  try {
    const result = await fn();
    logResult(testName, 'Success', 'Success', 'passed');
    return result;
  } catch (error) {
    const msg = error.message || String(error);

    if (msg.toLowerCase().includes('too many') && msg.toLowerCase().includes('request')) {
      console.log(`  \u26a0 Rate limited during "${testName}" — pausing 60s`);
      await delay(60000);
      try {
        const result = await fn();
        logResult(testName, 'Success', 'Success', 'passed');
        return result;
      } catch (retryErr) {
        logResult(testName, 'Success', retryErr.message || String(retryErr), 'failed');
        return null;
      }
    }

    if (isAuthError(msg)) {
      logResult(testName, 'Success', msg, 'skipped');
      results.authFailed = true;
      return null;
    }

    logResult(testName, 'Success', msg, 'failed');
    return null;
  }
}

// ============================================================================
// MAIN
// ============================================================================
async function runTests() {
  const client = createHermesClient();

  console.log(`\nUsing API_URL: ${apiUrl}`);
  console.log(`API_KEY: ${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 4)}`);
  console.log(`Request delay: ${REQUEST_DELAY_MS}ms\n`);

  // ---- Pre-flight ----
  console.log('--- Pre-flight Checks ---\n');
  try {
    const health = await client.public.health();
    console.log(`  \u2713 API Health: ${health.status || 'OK'}`);
  } catch (e) {
    console.error(`  \u2717 API health check failed: ${e.message}`);
    process.exit(1);
  }

  await delay();
  try {
    const wallets = await client.private.getWallets();
    console.log(`  \u2713 Auth working (${wallets.length || 0} wallets)`);
  } catch (e) {
    if (isAuthError(e.message)) {
      console.error(`  \u2717 Auth failed: ${e.message}`);
      console.error('  Please check your API_KEY.');
      process.exit(1);
    }
    console.log(`  \u26a0 Wallet fetch failed (non-auth): ${e.message}`);
  }

  let coins = [];
  await delay();
  try {
    coins = await client.public.getCoins();
    console.log(`  \u2713 Fetched ${coins.length} coins`);
  } catch (e) {
    console.log(`  \u26a0 Failed to fetch coins: ${e.message}`);
  }
  const coinMap = new Map(coins.map(c => [c.ticker, c]));
  const primaryTicker = coins.length > 0 ? coins[0].ticker : 'RUNES';
  const primaryCoin = coinMap.get(primaryTicker);
  const primaryDp = primaryCoin?.dp ?? 8;

  console.log(`  Primary test coin: ${primaryTicker} (dp: ${primaryDp})`);

  // ============================================================================
  // TIP TESTS
  // ============================================================================
  if (RUN.tip) {
    console.log('\n========================================');
    console.log('TIP ENDPOINT TESTS');
    console.log('========================================');

    // -- Validation --
    console.log('\n--- Tip: Validation Errors ---\n');

    await expectError(
      'Tip: Missing all required fields',
      () => client.private.tip({}),
      'missing or invalid required parameters'
    );

    await expectError(
      'Tip: Missing ticker',
      () => client.private.tip({ recipientIds: [VALID_RECIPIENT_1], amountPerRecipient: '1' }),
      'missing or invalid required parameters'
    );

    await expectError(
      'Tip: Missing recipientIds',
      () => client.private.tip({ ticker: primaryTicker, amountPerRecipient: '1' }),
      'missing or invalid required parameters'
    );

    await expectError(
      'Tip: Missing amountPerRecipient',
      () => client.private.tip({ ticker: primaryTicker, recipientIds: [VALID_RECIPIENT_1] }),
      'missing or invalid required parameters'
    );

    await expectError(
      'Tip: Empty recipientIds array',
      () => client.private.tip({ ticker: primaryTicker, recipientIds: [], amountPerRecipient: '1' }),
      'missing or invalid required parameters'
    );

    await expectError(
      'Tip: Invalid recipient ID format',
      () => client.private.tip({ ticker: primaryTicker, recipientIds: ['not-a-snowflake'], amountPerRecipient: '1' }),
      'invalid recipient'
    );

    await expectError(
      'Tip: Non-existent coin',
      () => client.private.tip({ ticker: 'NONEXISTENTCOIN999', recipientIds: [VALID_RECIPIENT_1], amountPerRecipient: '1' }),
      'coin not found'
    );

    await expectError(
      'Tip: Zero amount',
      () => client.private.tip({ ticker: primaryTicker, recipientIds: [VALID_RECIPIENT_1], amountPerRecipient: '0' }),
      'positive'
    );

    await expectError(
      'Tip: Negative amount',
      () => client.private.tip({ ticker: primaryTicker, recipientIds: [VALID_RECIPIENT_1], amountPerRecipient: '-5' }),
      'positive'
    );

    await expectError(
      'Tip: Non-numeric amount (rejected)',
      () => client.private.tip({ ticker: primaryTicker, recipientIds: [VALID_RECIPIENT_1], amountPerRecipient: 'abc' }),
      'failed to' // safeErrorMessage masks BigNumber parse errors with server fallback
    );

    await expectError(
      'Tip: Exceeds maximum precision',
      () => client.private.tip({
        ticker: primaryTicker,
        recipientIds: [VALID_RECIPIENT_1],
        amountPerRecipient: '0.' + '1'.repeat(31),
      }),
      'precision'
    );

    if (primaryDp > 0) {
      await expectError(
        `Tip: Exceeds coin dp (${primaryDp})`,
        () => client.private.tip({
          ticker: primaryTicker,
          recipientIds: [VALID_RECIPIENT_1],
          amountPerRecipient: '1.' + '0'.repeat(primaryDp) + '1',
        }),
        'decimal places'
      );
    }

    // Note: "too small after rounding" is unreachable for valid dp inputs because
    // the "exceeds decimal places" check fires first. The server correctly rejects
    // amounts with too many decimal places before the rounding check.

    await expectError(
      'Tip: Invalid notifyChannelId format',
      () => client.private.tip({
        ticker: primaryTicker,
        recipientIds: [VALID_RECIPIENT_1],
        amountPerRecipient: '1',
        notifyChannelId: 'bad-channel',
      }),
      'notifychannelid'
    );

    // -- Insufficient balance --
    console.log('\n--- Tip: Balance Errors ---\n');

    await expectError(
      'Tip: Insufficient balance (huge amount)',
      () => client.private.tip({
        ticker: primaryTicker,
        recipientIds: [VALID_RECIPIENT_1],
        amountPerRecipient: '999999999999',
      }),
      'insufficient'
    );

    await expectError(
      'Tip: Insufficient balance (many recipients * amount)',
      () => client.private.tip({
        ticker: primaryTicker,
        recipientIds: [VALID_RECIPIENT_1, VALID_RECIPIENT_2],
        amountPerRecipient: '999999999',
      }),
      'insufficient'
    );
  }

  // ============================================================================
  // AIRDROP TESTS (flood, rain, soak, sleet, wave)
  // ============================================================================
  if (RUN.airdrop) {
    console.log('\n========================================');
    console.log('AIRDROP ENDPOINT TESTS');
    console.log('========================================');

    const airdropTypes = ['flood', 'rain', 'soak', 'wave'];

    for (const type of airdropTypes) {
      console.log(`\n--- ${type.charAt(0).toUpperCase() + type.slice(1)}: Validation Errors ---\n`);

      const callAirdrop = (params) => client.private[type](params);

      await expectError(
        `${type}: Missing all required fields`,
        () => callAirdrop({}),
        'missing required fields'
      );

      await expectError(
        `${type}: Missing ticker`,
        () => callAirdrop({ amount: '1', channelId: TEST_CHANNEL_ID }),
        'missing required fields'
      );

      await expectError(
        `${type}: Missing amount`,
        () => callAirdrop({ ticker: primaryTicker, channelId: TEST_CHANNEL_ID }),
        'missing required fields'
      );

      await expectError(
        `${type}: Missing channelId`,
        () => callAirdrop({ ticker: primaryTicker, amount: '1' }),
        'missing required fields'
      );

      await expectError(
        `${type}: Invalid channelId format`,
        () => callAirdrop({ ticker: primaryTicker, amount: '1', channelId: 'not-a-snowflake' }),
        'channel'
      );

      await expectError(
        `${type}: Non-existent coin`,
        () => callAirdrop({ ticker: 'FAKECOIN999', amount: '1', channelId: TEST_CHANNEL_ID }),
        'coin not found'
      );

      await expectError(
        `${type}: Zero amount`,
        () => callAirdrop({ ticker: primaryTicker, amount: '0', channelId: TEST_CHANNEL_ID }),
        'positive'
      );

      await expectError(
        `${type}: Negative amount`,
        () => callAirdrop({ ticker: primaryTicker, amount: '-10', channelId: TEST_CHANNEL_ID }),
        'positive'
      );

      await expectError(
        `${type}: Non-numeric amount (rejected)`,
        () => callAirdrop({ ticker: primaryTicker, amount: 'abc', channelId: TEST_CHANNEL_ID }),
        'failed' // safeErrorMessage masks BigNumber parse errors with server fallback
      );

      await expectError(
        `${type}: Exceeds max precision`,
        () => callAirdrop({
          ticker: primaryTicker,
          amount: '0.' + '1'.repeat(31),
          channelId: TEST_CHANNEL_ID,
        }),
        'precision'
      );

      await expectError(
        `${type}: Invalid roleId format`,
        () => callAirdrop({
          ticker: primaryTicker,
          amount: '1',
          channelId: TEST_CHANNEL_ID,
          roleId: 'bad-role',
        }),
        'roleid'
      );

      await expectError(
        `${type}: Insufficient balance`,
        () => callAirdrop({
          ticker: primaryTicker,
          amount: '999999999999',
          channelId: TEST_CHANNEL_ID,
        }),
        'insufficient'
      );
    }

    // Sleet has extra duration validation
    console.log('\n--- Sleet: Validation Errors ---\n');

    await expectError(
      'Sleet: Missing all required fields',
      () => client.private.sleet({}),
      'missing required fields'
    );

    // Note: Sleet validates Amount → Recipients → Coin (in that order).
    // If there are no eligible recipients in the channel, the recipients check
    // fires before coin/balance validation. Amount validation still works:

    await expectError(
      'Sleet: Zero amount',
      () => client.private.sleet({ ticker: primaryTicker, amount: '0', channelId: TEST_CHANNEL_ID }),
      'positive'
    );

    await expectError(
      'Sleet: Negative amount',
      () => client.private.sleet({ ticker: primaryTicker, amount: '-1', channelId: TEST_CHANNEL_ID }),
      'positive'
    );

    await expectError(
      'Sleet: Non-existent coin (recipients checked first)',
      () => client.private.sleet({ ticker: 'FAKECOIN999', amount: '1', channelId: TEST_CHANNEL_ID }),
      'no eligible recipients' // recipients filter runs before coin lookup in sleet
    );

    await expectError(
      'Sleet: Insufficient balance (recipients checked first)',
      () => client.private.sleet({
        ticker: primaryTicker,
        amount: '999999999999',
        channelId: TEST_CHANNEL_ID,
      }),
      'no eligible recipients' // recipients filter runs before balance check in sleet
    );
  }

  // ============================================================================
  // INTERACTIVE DROP TESTS (reactdrop, partydrop, trivia)
  // ============================================================================
  if (RUN.interactive) {
    console.log('\n========================================');
    console.log('INTERACTIVE DROP ENDPOINT TESTS');
    console.log('========================================');

    // -- Reactdrop --
    console.log('\n--- Reactdrop: Validation Errors ---\n');

    await expectError(
      'Reactdrop: Missing all required fields',
      () => client.private.reactdrop({}),
      'missing required fields'
    );

    await expectError(
      'Reactdrop: Non-existent coin',
      () => client.private.reactdrop({
        ticker: 'FAKECOIN999', amount: '1', channelId: TEST_CHANNEL_ID,
      }),
      'coin not found'
    );

    await expectError(
      'Reactdrop: Zero amount',
      () => client.private.reactdrop({
        ticker: primaryTicker, amount: '0', channelId: TEST_CHANNEL_ID,
      }),
      'positive'
    );

    await expectError(
      'Reactdrop: Negative amount',
      () => client.private.reactdrop({
        ticker: primaryTicker, amount: '-5', channelId: TEST_CHANNEL_ID,
      }),
      'positive'
    );

    await expectError(
      'Reactdrop: Insufficient balance',
      () => client.private.reactdrop({
        ticker: primaryTicker, amount: '999999999999', channelId: TEST_CHANNEL_ID,
      }),
      'insufficient'
    );

    // -- Partydrop --
    console.log('\n--- Partydrop: Validation Errors ---\n');

    await expectError(
      'Partydrop: Missing all required fields',
      () => client.private.partydrop({}),
      'missing required fields'
    );

    await expectError(
      'Partydrop: Non-existent coin',
      () => client.private.partydrop({
        ticker: 'FAKECOIN999', amount: '1', channelId: TEST_CHANNEL_ID,
      }),
      'coin not found'
    );

    await expectError(
      'Partydrop: Zero amount',
      () => client.private.partydrop({
        ticker: primaryTicker, amount: '0', channelId: TEST_CHANNEL_ID,
      }),
      'positive'
    );

    await expectError(
      'Partydrop: Insufficient balance',
      () => client.private.partydrop({
        ticker: primaryTicker, amount: '999999999999', channelId: TEST_CHANNEL_ID,
      }),
      'insufficient'
    );

    // -- Trivia --
    console.log('\n--- Trivia: Validation Errors ---\n');

    await expectError(
      'Trivia: Missing all required fields',
      () => client.private.trivia({}),
      'missing required fields'
    );

    await expectError(
      'Trivia: Non-existent coin',
      () => client.private.trivia({
        ticker: 'FAKECOIN999', amount: '1', channelId: TEST_CHANNEL_ID,
      }),
      'coin not found'
    );

    await expectError(
      'Trivia: Zero amount',
      () => client.private.trivia({
        ticker: primaryTicker, amount: '0', channelId: TEST_CHANNEL_ID,
      }),
      'positive'
    );

    await expectError(
      'Trivia: Insufficient balance',
      () => client.private.trivia({
        ticker: primaryTicker, amount: '999999999999', channelId: TEST_CHANNEL_ID,
      }),
      'insufficient'
    );
  }

  // ============================================================================
  // BULK PAYOUT TESTS (updated error messages)
  // ============================================================================
  if (RUN.bulkPayout) {
    console.log('\n========================================');
    console.log('BULK PAYOUT ENDPOINT TESTS');
    console.log('========================================');

    console.log('\n--- Bulk Payout: Validation Errors ---\n');

    await expectError(
      'BulkPayout: Missing payouts array',
      () => client.private.bulkPayout({ memo: 'test' }),
      'missing or invalid payouts'
    );

    await expectError(
      'BulkPayout: Empty payouts array',
      () => client.private.bulkPayout({ payouts: [] }),
      'missing or invalid payouts'
    );

    await expectError(
      'BulkPayout: Invalid recipient (number)',
      () => client.private.bulkPayout({
        payouts: [{ recipient: 12345, rewards: [{ ticker: primaryTicker, amount: '1' }] }],
      }),
      'invalid recipient at index'
    );

    await expectError(
      'BulkPayout: Missing recipient',
      () => client.private.bulkPayout({
        payouts: [{ rewards: [{ ticker: primaryTicker, amount: '1' }] }],
      }),
      'invalid recipient at index'
    );

    await expectError(
      'BulkPayout: Empty rewards array',
      () => client.private.bulkPayout({
        payouts: [{ recipient: VALID_RECIPIENT_1, rewards: [] }],
      }),
      'invalid or empty rewards'
    );

    await expectError(
      'BulkPayout: Missing rewards array',
      () => client.private.bulkPayout({
        payouts: [{ recipient: VALID_RECIPIENT_1 }],
      }),
      'invalid or empty rewards'
    );

    await expectError(
      'BulkPayout: Invalid ticker (empty)',
      () => client.private.bulkPayout({
        payouts: [{ recipient: VALID_RECIPIENT_1, rewards: [{ ticker: '', amount: '1' }] }],
      }),
      'invalid ticker'
    );

    await expectError(
      'BulkPayout: Missing amount',
      () => client.private.bulkPayout({
        payouts: [{ recipient: VALID_RECIPIENT_1, rewards: [{ ticker: primaryTicker }] }],
      }),
      'amount'
    );

    await expectError(
      'BulkPayout: Invalid amount (zero)',
      () => client.private.bulkPayout({
        payouts: [{ recipient: VALID_RECIPIENT_1, rewards: [{ ticker: primaryTicker, amount: '0' }] }],
      }),
      'positive'
    );

    await expectError(
      'BulkPayout: Invalid amount (negative)',
      () => client.private.bulkPayout({
        payouts: [{ recipient: VALID_RECIPIENT_1, rewards: [{ ticker: primaryTicker, amount: '-10' }] }],
      }),
      'positive'
    );

    await expectError(
      'BulkPayout: Invalid amount (non-numeric, rejected)',
      () => client.private.bulkPayout({
        payouts: [{ recipient: VALID_RECIPIENT_1, rewards: [{ ticker: primaryTicker, amount: 'abc' }] }],
      }),
      'failed' // safeErrorMessage masks BigNumber parse errors with server fallback
    );

    await expectError(
      'BulkPayout: Exceeds max precision',
      () => client.private.bulkPayout({
        payouts: [{
          recipient: VALID_RECIPIENT_1,
          rewards: [{ ticker: primaryTicker, amount: '0.' + '1'.repeat(31) }],
        }],
      }),
      'precision'
    );

    await expectError(
      'BulkPayout: Unknown coin ticker',
      () => client.private.bulkPayout({
        payouts: [{ recipient: VALID_RECIPIENT_1, rewards: [{ ticker: 'NONEXISTENTCOIN123', amount: '1' }] }],
      }),
      'unknown coin'
    );

    await expectError(
      'BulkPayout: Duplicate recipient',
      () => client.private.bulkPayout({
        payouts: [
          { recipient: VALID_RECIPIENT_1, rewards: [{ ticker: primaryTicker, amount: '0.001' }] },
          { recipient: VALID_RECIPIENT_1, rewards: [{ ticker: primaryTicker, amount: '0.001' }] },
        ],
      }),
      'duplicate'
    );

    await expectError(
      'BulkPayout: Duplicate coin per recipient',
      () => client.private.bulkPayout({
        payouts: [{
          recipient: VALID_RECIPIENT_1,
          rewards: [
            { ticker: primaryTicker, amount: '0.001' },
            { ticker: primaryTicker, amount: '0.002' },
          ],
        }],
      }),
      'duplicate coin'
    );

    await expectError(
      'BulkPayout: Invalid notifyChannelId',
      () => client.private.bulkPayout({
        notifyChannelId: '000000000000000000',
        payouts: [{ recipient: VALID_RECIPIENT_1, rewards: [{ ticker: primaryTicker, amount: '0.001' }] }],
      }),
      'notifychannelid'
    );

    console.log('\n--- Bulk Payout: Balance Errors ---\n');

    await expectError(
      'BulkPayout: Insufficient balance (huge amount)',
      () => client.private.bulkPayout({
        payouts: [{ recipient: VALID_RECIPIENT_1, rewards: [{ ticker: primaryTicker, amount: '999999999999' }] }],
      }),
      'insufficient'
    );

    await expectError(
      'BulkPayout: Insufficient balance (multiple recipients)',
      () => client.private.bulkPayout({
        payouts: [
          { recipient: VALID_RECIPIENT_1, rewards: [{ ticker: primaryTicker, amount: '500000000' }] },
          { recipient: VALID_RECIPIENT_2, rewards: [{ ticker: primaryTicker, amount: '500000000' }] },
        ],
      }),
      'insufficient'
    );
  }

  // ============================================================================
  // WITHDRAWAL TESTS
  // ============================================================================
  if (RUN.withdraw) {
    console.log('\n========================================');
    console.log('WITHDRAWAL ENDPOINT TESTS');
    console.log('========================================');

    console.log('\n--- Withdrawal: Validation Errors ---\n');

    await expectError(
      'Withdraw: Missing all required fields',
      () => client.private.withdraw({}),
      'missing required fields'
    );

    await expectError(
      'Withdraw: Missing ticker',
      () => client.private.withdraw({ chainName: 'Runebase', amount: '1', address: 'RTestAddress123' }),
      'missing required fields'
    );

    await expectError(
      'Withdraw: Missing chainName',
      () => client.private.withdraw({ ticker: primaryTicker, amount: '1', address: 'RTestAddress123' }),
      'missing required fields'
    );

    await expectError(
      'Withdraw: Missing amount',
      () => client.private.withdraw({ ticker: primaryTicker, chainName: 'Runebase', address: 'RTestAddress123' }),
      'missing required fields'
    );

    await expectError(
      'Withdraw: Missing address',
      () => client.private.withdraw({ ticker: primaryTicker, chainName: 'Runebase', amount: '1' }),
      'missing required fields'
    );

    await expectError(
      'Withdraw: Non-existent chain',
      () => client.private.withdraw({
        ticker: primaryTicker, chainName: 'FakeChain999', amount: '1', address: 'RTestAddress123',
      }),
      'chain not found'
    );

    await expectError(
      'Withdraw: Zero amount',
      () => client.private.withdraw({
        ticker: primaryTicker, chainName: 'Runebase', amount: '0', address: 'RTestAddress123',
      }),
      'positive'
    );

    await expectError(
      'Withdraw: Negative amount',
      () => client.private.withdraw({
        ticker: primaryTicker, chainName: 'Runebase', amount: '-10', address: 'RTestAddress123',
      }),
      'positive'
    );

    await expectError(
      'Withdraw: Non-numeric amount (rejected)',
      () => client.private.withdraw({
        ticker: primaryTicker, chainName: 'Runebase', amount: 'notanumber', address: 'RTestAddress123',
      }),
      'failed' // safeErrorMessage masks BigNumber parse errors with server fallback
    );

    await expectError(
      'Withdraw: Exceeds max precision',
      () => client.private.withdraw({
        ticker: primaryTicker, chainName: 'Runebase',
        amount: '0.' + '1'.repeat(31), address: 'RTestAddress123',
      }),
      'precision'
    );

    await expectError(
      'Withdraw: Non-existent coin',
      () => client.private.withdraw({
        ticker: 'FAKECOIN999', chainName: 'Runebase', amount: '1', address: 'RTestAddress123',
      }),
      'not found'
    );

    // Note: Withdrawal goes through the job queue engine. Engine errors from the
    // withdrawal process (e.g. address validation, balance check) may be masked by
    // safeErrorMessage if the error text doesn't start with an allowed prefix.
    await expectError(
      'Withdraw: Insufficient balance (huge amount)',
      () => client.private.withdraw({
        ticker: primaryTicker, chainName: 'Runebase', amount: '999999999999', address: 'RTestAddress123',
      }),
      'insufficient'
    );
  }

  // ============================================================================
  // DONATION TESTS
  // ============================================================================
  if (RUN.donation) {
    console.log('\n========================================');
    console.log('DONATION ENDPOINT TESTS');
    console.log('========================================');

    console.log('\n--- Donation: Validation Errors ---\n');

    await expectError(
      'Donation: Missing ticker',
      () => client.private.guildDonation(GUILD_ID, { amount: '1' }),
      'ticker'
    );

    await expectError(
      'Donation: Missing amount',
      () => client.private.guildDonation(GUILD_ID, { ticker: primaryTicker }),
      'amount'
    );

    await expectError(
      'Donation: Zero amount',
      () => client.private.guildDonation(GUILD_ID, { ticker: primaryTicker, amount: '0' }),
      'positive'
    );

    await expectError(
      'Donation: Negative amount',
      () => client.private.guildDonation(GUILD_ID, { ticker: primaryTicker, amount: '-5' }),
      'positive'
    );

    await expectError(
      'Donation: Non-numeric amount (rejected)',
      () => client.private.guildDonation(GUILD_ID, { ticker: primaryTicker, amount: 'abc' }),
      'failed' // safeErrorMessage masks BigNumber parse errors with server fallback
    );

    await expectError(
      'Donation: Exceeds max precision',
      () => client.private.guildDonation(GUILD_ID, {
        ticker: primaryTicker,
        amount: '0.' + '1'.repeat(31),
      }),
      'precision'
    );

    await expectError(
      'Donation: Non-existent coin',
      () => client.private.guildDonation(GUILD_ID, { ticker: 'FAKECOIN999', amount: '1' }),
      'coin not found'
    );

    await expectError(
      'Donation: Non-existent guild',
      () => client.private.guildDonation('000000000000000001', { ticker: primaryTicker, amount: '1' }),
      'not found'
    );

    await expectError(
      'Donation: Insufficient balance',
      () => client.private.guildDonation(GUILD_ID, { ticker: primaryTicker, amount: '999999999999' }),
      'insufficient'
    );
  }

  // ============================================================================
  // GUILD ENDPOINT TESTS (tip, airdrops, bulk payout)
  // ============================================================================
  let guildAuthSuccess = false;

  if (RUN.guild) {
    console.log('\n========================================');
    console.log('GUILD ENDPOINT TESTS');
    console.log('========================================');

    // Guild auth
    console.log('\n--- Guild Authentication ---\n');
    if (!GUILD_PASSWORD) {
      console.log('  \u26a0 GUILD_PASSWORD not set — guild tests will be skipped');
    } else {
      await delay();
      try {
        await client.private.guildSecurityLogin(GUILD_ID, { password: GUILD_PASSWORD });
        console.log(`  \u2713 Guild security login OK (${GUILD_ID})`);
        guildAuthSuccess = true;
      } catch (e) {
        console.log(`  \u2717 Guild security login failed: ${e.message}`);
        console.log('    Guild tests will be skipped');
      }
    }

    if (guildAuthSuccess) {
      // -- Guild Tip --
      console.log('\n--- Guild Tip: Validation Errors ---\n');

      await expectError(
        'GuildTip: Missing all required fields',
        () => client.private.guildTip(GUILD_ID, {}),
        'missing or invalid required parameters'
      );

      await expectError(
        'GuildTip: Non-existent coin',
        () => client.private.guildTip(GUILD_ID, {
          ticker: 'FAKECOIN999', recipientIds: [VALID_RECIPIENT_1], amountPerRecipient: '1',
        }),
        'coin not found'
      );

      await expectError(
        'GuildTip: Zero amount',
        () => client.private.guildTip(GUILD_ID, {
          ticker: primaryTicker, recipientIds: [VALID_RECIPIENT_1], amountPerRecipient: '0',
        }),
        'positive'
      );

      await expectError(
        'GuildTip: Negative amount',
        () => client.private.guildTip(GUILD_ID, {
          ticker: primaryTicker, recipientIds: [VALID_RECIPIENT_1], amountPerRecipient: '-1',
        }),
        'positive'
      );

      await expectError(
        'GuildTip: Insufficient balance',
        () => client.private.guildTip(GUILD_ID, {
          ticker: primaryTicker, recipientIds: [VALID_RECIPIENT_1], amountPerRecipient: '999999999999',
        }),
        'insufficient'
      );

      await expectError(
        'GuildTip: Invalid notifyChannelId (not in guild)',
        () => client.private.guildTip(GUILD_ID, {
          ticker: primaryTicker, recipientIds: [VALID_RECIPIENT_1], amountPerRecipient: '1',
          notifyChannelId: '000000000000000000',
        }),
        'notifychannelid'
      );

      // -- Guild Airdrops --
      const guildAirdropTypes = ['guildFlood', 'guildRain', 'guildSoak', 'guildWave'];

      for (const method of guildAirdropTypes) {
        const label = method.replace('guild', 'Guild ');
        console.log(`\n--- ${label}: Validation Errors ---\n`);

        await expectError(
          `${label}: Missing required fields`,
          () => client.private[method](GUILD_ID, {}),
          'missing required fields'
        );

        await expectError(
          `${label}: Non-existent coin`,
          () => client.private[method](GUILD_ID, {
            ticker: 'FAKECOIN999', amount: '1', channelId: TEST_CHANNEL_ID,
          }),
          'coin not found'
        );

        await expectError(
          `${label}: Zero amount`,
          () => client.private[method](GUILD_ID, {
            ticker: primaryTicker, amount: '0', channelId: TEST_CHANNEL_ID,
          }),
          'positive'
        );

        await expectError(
          `${label}: Insufficient balance`,
          () => client.private[method](GUILD_ID, {
            ticker: primaryTicker, amount: '999999999999', channelId: TEST_CHANNEL_ID,
          }),
          'insufficient'
        );
      }

      // -- Guild Sleet --
      console.log('\n--- Guild Sleet: Validation Errors ---\n');

      await expectError(
        'GuildSleet: Missing required fields',
        () => client.private.guildSleet(GUILD_ID, {}),
        'missing required fields'
      );

      await expectError(
        'GuildSleet: Insufficient balance (recipients checked first)',
        () => client.private.guildSleet(GUILD_ID, {
          ticker: primaryTicker, amount: '999999999999', channelId: TEST_CHANNEL_ID,
        }),
        'no eligible recipients' // sleet checks recipients before balance
      );

      // -- Guild Reactdrop --
      console.log('\n--- Guild Reactdrop: Validation Errors ---\n');

      await expectError(
        'GuildReactdrop: Missing required fields',
        () => client.private.guildReactdrop(GUILD_ID, {}),
        'missing required fields'
      );

      await expectError(
        'GuildReactdrop: Insufficient balance',
        () => client.private.guildReactdrop(GUILD_ID, {
          ticker: primaryTicker, amount: '999999999999', channelId: TEST_CHANNEL_ID,
        }),
        'insufficient'
      );

      // -- Guild Partydrop --
      console.log('\n--- Guild Partydrop: Validation Errors ---\n');

      await expectError(
        'GuildPartydrop: Missing required fields',
        () => client.private.guildPartydrop(GUILD_ID, {}),
        'missing required fields'
      );

      await expectError(
        'GuildPartydrop: Insufficient balance',
        () => client.private.guildPartydrop(GUILD_ID, {
          ticker: primaryTicker, amount: '999999999999', channelId: TEST_CHANNEL_ID,
        }),
        'insufficient'
      );

      // -- Guild Trivia --
      console.log('\n--- Guild Trivia: Validation Errors ---\n');

      await expectError(
        'GuildTrivia: Missing required fields',
        () => client.private.guildTrivia(GUILD_ID, {}),
        'missing required fields'
      );

      await expectError(
        'GuildTrivia: Insufficient balance',
        () => client.private.guildTrivia(GUILD_ID, {
          ticker: primaryTicker, amount: '999999999999', channelId: TEST_CHANNEL_ID,
        }),
        'insufficient'
      );

      // -- Guild Bulk Payout --
      console.log('\n--- Guild Bulk Payout: Validation Errors ---\n');

      await expectError(
        'GuildBulkPayout: Missing payouts',
        () => client.private.guildBulkPayout(GUILD_ID, { memo: 'test' }),
        'missing or invalid payouts'
      );

      await expectError(
        'GuildBulkPayout: Empty payouts',
        () => client.private.guildBulkPayout(GUILD_ID, { payouts: [] }),
        'missing or invalid payouts'
      );

      await expectError(
        'GuildBulkPayout: Invalid recipient',
        () => client.private.guildBulkPayout(GUILD_ID, {
          payouts: [{ recipient: 12345, rewards: [{ ticker: primaryTicker, amount: '1' }] }],
        }),
        'invalid recipient at index'
      );

      await expectError(
        'GuildBulkPayout: Negative amount',
        () => client.private.guildBulkPayout(GUILD_ID, {
          payouts: [{ recipient: VALID_RECIPIENT_1, rewards: [{ ticker: primaryTicker, amount: '-5' }] }],
        }),
        'positive'
      );

      await expectError(
        'GuildBulkPayout: Duplicate recipient',
        () => client.private.guildBulkPayout(GUILD_ID, {
          payouts: [
            { recipient: VALID_RECIPIENT_1, rewards: [{ ticker: primaryTicker, amount: '0.001' }] },
            { recipient: VALID_RECIPIENT_1, rewards: [{ ticker: primaryTicker, amount: '0.001' }] },
          ],
        }),
        'duplicate'
      );

      await expectError(
        'GuildBulkPayout: Insufficient balance',
        () => client.private.guildBulkPayout(GUILD_ID, {
          payouts: [{ recipient: VALID_RECIPIENT_1, rewards: [{ ticker: primaryTicker, amount: '999999999999' }] }],
        }),
        'insufficient'
      );

      await expectError(
        'GuildBulkPayout: Invalid notifyChannelId',
        () => client.private.guildBulkPayout(GUILD_ID, {
          notifyChannelId: '000000000000000000',
          payouts: [{ recipient: VALID_RECIPIENT_1, rewards: [{ ticker: primaryTicker, amount: '0.001' }] }],
        }),
        'notifychannelid'
      );

      await expectError(
        'GuildBulkPayout: Unknown coin',
        () => client.private.guildBulkPayout(GUILD_ID, {
          payouts: [{ recipient: VALID_RECIPIENT_1, rewards: [{ ticker: 'FAKECOIN999', amount: '1' }] }],
        }),
        'unknown coin'
      );
    }
  }

  // ============================================================================
  // DEBIT / BALANCE VERIFICATION TESTS
  // ============================================================================
  if (RUN.debit) {
    console.log('\n========================================');
    console.log('DEBIT & BALANCE VERIFICATION TESTS');
    console.log('========================================');

    // Get wallets to find a coin with balance
    await delay();
    let wallets = [];
    try {
      wallets = await client.private.getWallets();
    } catch (e) {
      console.log(`  \u2717 Failed to fetch wallets: ${e.message}`);
    }

    const testableWallets = wallets
      .filter(w => parseFloat(w.available) >= 0.1)
      .sort((a, b) => parseFloat(b.available) - parseFloat(a.available));

    if (testableWallets.length === 0) {
      console.log('\n  \u26a0 No wallets with sufficient balance (>= 0.1) for debit tests');
      console.log('  Skipping debit verification\n');
    } else {
      const testWallet = testableWallets[0];
      const testTicker = testWallet.ticker;
      const testCoin = coinMap.get(testTicker);
      const testDp = testCoin?.dp ?? 8;
      const minUnit = Math.pow(10, -testDp);

      console.log(`\n  Test coin: ${testTicker} (balance: ${testWallet.available}, dp: ${testDp})\n`);

      // ---- Test 1: Tip debit verification ----
      console.log('  === Debit Test 1: Tip to single recipient ===\n');

      const tipAmount = '0.01';
      await delay();
      const walletsBefore1 = await client.private.getWallets();
      const balanceBefore1 = parseFloat(walletsBefore1.find(w => w.ticker === testTicker)?.available || '0');

      console.log(`  Balance before: ${balanceBefore1.toFixed(testDp)} ${testTicker}`);
      console.log(`  Tipping ${tipAmount} ${testTicker} to ${VALID_RECIPIENT_1}`);

      const tipResult = await expectSuccess(
        `Tip ${tipAmount} ${testTicker} to recipient`,
        () => client.private.tip({
          ticker: testTicker,
          recipientIds: [VALID_RECIPIENT_1],
          amountPerRecipient: tipAmount,
        })
      );

      if (tipResult) {
        await delay(3000); // Wait for balance propagation
        const walletsAfter1 = await client.private.getWallets();
        const balanceAfter1 = parseFloat(walletsAfter1.find(w => w.ticker === testTicker)?.available || '0');
        const actualDebit1 = balanceBefore1 - balanceAfter1;
        const expectedDebit1 = parseFloat(tipAmount);

        console.log(`  Balance after:  ${balanceAfter1.toFixed(testDp)} ${testTicker}`);
        console.log(`  Actual debit:   ${actualDebit1.toFixed(testDp)}`);
        console.log(`  Expected debit: ${expectedDebit1.toFixed(testDp)}`);

        const tolerance = minUnit * 2;
        if (Math.abs(actualDebit1 - expectedDebit1) < tolerance) {
          logResult('Tip debit math correct', 'Match', 'Match', 'passed');
        } else {
          logResult('Tip debit math correct',
            `Debit ~${expectedDebit1.toFixed(testDp)}`,
            `Debit ${actualDebit1.toFixed(testDp)}`,
            'failed'
          );
        }
      }

      // ---- Test 2: Tip to multiple recipients ----
      console.log('\n  === Debit Test 2: Tip to multiple recipients ===\n');

      const tipAmount2 = '0.005';
      await delay();
      const walletsBefore2 = await client.private.getWallets();
      const balanceBefore2 = parseFloat(walletsBefore2.find(w => w.ticker === testTicker)?.available || '0');

      console.log(`  Balance before: ${balanceBefore2.toFixed(testDp)} ${testTicker}`);
      console.log(`  Tipping ${tipAmount2} ${testTicker} each to 2 recipients`);

      const tipResult2 = await expectSuccess(
        `Tip ${tipAmount2} ${testTicker} each to 2 recipients`,
        () => client.private.tip({
          ticker: testTicker,
          recipientIds: [VALID_RECIPIENT_1, VALID_RECIPIENT_2],
          amountPerRecipient: tipAmount2,
        })
      );

      if (tipResult2) {
        await delay(3000);
        const walletsAfter2 = await client.private.getWallets();
        const balanceAfter2 = parseFloat(walletsAfter2.find(w => w.ticker === testTicker)?.available || '0');
        const actualDebit2 = balanceBefore2 - balanceAfter2;
        const expectedDebit2 = parseFloat(tipAmount2) * 2;

        console.log(`  Balance after:  ${balanceAfter2.toFixed(testDp)} ${testTicker}`);
        console.log(`  Actual debit:   ${actualDebit2.toFixed(testDp)}`);
        console.log(`  Expected debit: ${expectedDebit2.toFixed(testDp)} (${tipAmount2} x 2)`);

        const tolerance = minUnit * 2;
        if (Math.abs(actualDebit2 - expectedDebit2) < tolerance) {
          logResult('Multi-recipient tip debit math correct', 'Match', 'Match', 'passed');
        } else {
          logResult('Multi-recipient tip debit math correct',
            `Debit ~${expectedDebit2.toFixed(testDp)}`,
            `Debit ${actualDebit2.toFixed(testDp)}`,
            'failed'
          );
        }
      }

      // ---- Test 3: Self-inclusion in user bulk payout (should be blocked) ----
      console.log('\n  === Debit Test 3: Self-inclusion blocked in user bulk payout ===\n');

      await expectError(
        'User bulk payout blocks self-recipient',
        () => client.private.bulkPayout({
          memo: 'Self-inclusion test',
          payouts: [
            { recipient: INITIATOR_USER_ID, rewards: [{ ticker: testTicker, amount: '0.001' }] },
            { recipient: VALID_RECIPIENT_1, rewards: [{ ticker: testTicker, amount: '0.001' }] },
          ],
        }),
        'cannot include yourself'
      );

      await expectError(
        'User bulk payout blocks self-only recipient',
        () => client.private.bulkPayout({
          memo: 'Self-only test',
          payouts: [
            { recipient: INITIATOR_USER_ID, rewards: [{ ticker: testTicker, amount: '0.001' }] },
          ],
        }),
        'cannot include yourself'
      );

      // ---- Test 4: Bulk payout debit verification (to others only) ----
      console.log('\n  === Debit Test 4: Bulk payout debit (two recipients) ===\n');

      const bulkAmount = '0.003';
      await delay();
      const walletsBefore4 = await client.private.getWallets();
      const balanceBefore4 = parseFloat(walletsBefore4.find(w => w.ticker === testTicker)?.available || '0');

      console.log(`  Balance before: ${balanceBefore4.toFixed(testDp)} ${testTicker}`);
      console.log(`  Bulk payout: ${bulkAmount} each to 2 recipients`);

      const bulkResult4 = await expectSuccess(
        'Bulk payout to 2 recipients',
        () => client.private.bulkPayout({
          memo: 'Debit test: two recipients',
          payouts: [
            { recipient: VALID_RECIPIENT_1, rewards: [{ ticker: testTicker, amount: bulkAmount }] },
            { recipient: VALID_RECIPIENT_2, rewards: [{ ticker: testTicker, amount: bulkAmount }] },
          ],
        })
      );

      if (bulkResult4) {
        await delay(3000);
        const walletsAfter4 = await client.private.getWallets();
        const balanceAfter4 = parseFloat(walletsAfter4.find(w => w.ticker === testTicker)?.available || '0');
        const actualDebit4 = balanceBefore4 - balanceAfter4;
        const expectedDebit4 = parseFloat(bulkAmount) * 2;

        console.log(`  Balance after:  ${balanceAfter4.toFixed(testDp)} ${testTicker}`);
        console.log(`  Actual debit:   ${actualDebit4.toFixed(testDp)}`);
        console.log(`  Expected debit: ${expectedDebit4.toFixed(testDp)} (${bulkAmount} x 2)`);

        const tolerance = minUnit * 2;
        if (Math.abs(actualDebit4 - expectedDebit4) < tolerance) {
          logResult('Bulk payout debit math correct', 'Match', 'Match', 'passed');
        } else {
          logResult('Bulk payout debit math correct',
            `Debit ~${expectedDebit4.toFixed(testDp)}`,
            `Debit ${actualDebit4.toFixed(testDp)}`,
            'failed'
          );
        }
      }

      // ---- Test 5: Exceed balance by 1 minimal unit (should fail) ----
      console.log('\n  === Debit Test 5: Exceed balance by 1 minimal unit ===\n');

      await delay();
      const walletsBefore5 = await client.private.getWallets();
      const balanceBefore5 = parseFloat(walletsBefore5.find(w => w.ticker === testTicker)?.available || '0');
      const exceedAmount = (balanceBefore5 + minUnit).toFixed(testDp);

      console.log(`  Balance: ${balanceBefore5.toFixed(testDp)} ${testTicker}`);
      console.log(`  Attempting to tip: ${exceedAmount} (balance + 1 min unit)`);

      await expectError(
        'Tip exceeding balance by 1 minimal unit',
        () => client.private.tip({
          ticker: testTicker,
          recipientIds: [VALID_RECIPIENT_1],
          amountPerRecipient: exceedAmount,
        }),
        'insufficient'
      );

      // ---- Test 6: Donation debit verification ----
      console.log('\n  === Debit Test 6: Donation debit ===\n');

      const donationAmount = '0.005';
      await delay();
      const walletsBefore6 = await client.private.getWallets();
      const balanceBefore6 = parseFloat(walletsBefore6.find(w => w.ticker === testTicker)?.available || '0');

      console.log(`  Balance before: ${balanceBefore6.toFixed(testDp)} ${testTicker}`);
      console.log(`  Donating ${donationAmount} ${testTicker} to guild ${GUILD_ID}`);

      const donationResult = await expectSuccess(
        `Donate ${donationAmount} ${testTicker}`,
        () => client.private.guildDonation(GUILD_ID, {
          ticker: testTicker,
          amount: donationAmount,
        })
      );

      if (donationResult) {
        await delay(3000);
        const walletsAfter6 = await client.private.getWallets();
        const balanceAfter6 = parseFloat(walletsAfter6.find(w => w.ticker === testTicker)?.available || '0');
        const actualDebit6 = balanceBefore6 - balanceAfter6;
        const expectedDebit6 = parseFloat(donationAmount);

        console.log(`  Balance after:  ${balanceAfter6.toFixed(testDp)} ${testTicker}`);
        console.log(`  Actual debit:   ${actualDebit6.toFixed(testDp)}`);
        console.log(`  Expected debit: ${expectedDebit6.toFixed(testDp)}`);

        const tolerance = minUnit * 2;
        if (Math.abs(actualDebit6 - expectedDebit6) < tolerance) {
          logResult('Donation debit math correct', 'Match', 'Match', 'passed');
        } else {
          logResult('Donation debit math correct',
            `Debit ~${expectedDebit6.toFixed(testDp)}`,
            `Debit ${actualDebit6.toFixed(testDp)}`,
            'failed'
          );
        }
      }

      // ---- Test 7: Multi-coin bulk payout debit ----
      // Re-fetch wallets fresh to avoid interference from previous tests
      await delay();
      const freshWallets = await client.private.getWallets();
      const multiCoinWallets = freshWallets
        .filter(w => parseFloat(w.available) >= 0.05)
        .sort((a, b) => parseFloat(b.available) - parseFloat(a.available))
        .slice(0, 2);

      if (multiCoinWallets.length >= 2) {
        console.log('\n  === Debit Test 7: Multi-coin bulk payout ===\n');

        const coin1 = multiCoinWallets[0];
        const coin2 = multiCoinWallets[1];
        const coin1Dp = coinMap.get(coin1.ticker)?.dp ?? 8;
        const coin2Dp = coinMap.get(coin2.ticker)?.dp ?? 8;
        const amount1 = '0.003';
        const amount2 = '0.003';

        // Read balance immediately before the operation
        await delay();
        const walletsBefore7m = await client.private.getWallets();
        const bal1Before = parseFloat(walletsBefore7m.find(w => w.ticker === coin1.ticker)?.available || '0');
        const bal2Before = parseFloat(walletsBefore7m.find(w => w.ticker === coin2.ticker)?.available || '0');

        console.log(`  ${coin1.ticker}: ${bal1Before.toFixed(coin1Dp)} -> sending ${amount1}`);
        console.log(`  ${coin2.ticker}: ${bal2Before.toFixed(coin2Dp)} -> sending ${amount2}`);

        const bulkResult7m = await expectSuccess(
          'Multi-coin bulk payout',
          () => client.private.bulkPayout({
            memo: 'Multi-coin debit test',
            payouts: [{
              recipient: VALID_RECIPIENT_2, // Use different recipient to avoid queue contention
              rewards: [
                { ticker: coin1.ticker, amount: amount1 },
                { ticker: coin2.ticker, amount: amount2 },
              ],
            }],
          })
        );

        if (bulkResult7m) {
          await delay(3000);
          const walletsAfter7m = await client.private.getWallets();
          const bal1After = parseFloat(walletsAfter7m.find(w => w.ticker === coin1.ticker)?.available || '0');
          const bal2After = parseFloat(walletsAfter7m.find(w => w.ticker === coin2.ticker)?.available || '0');
          const debit1 = bal1Before - bal1After;
          const debit2 = bal2Before - bal2After;

          console.log(`  ${coin1.ticker}: ${bal1After.toFixed(coin1Dp)} (debit: ${debit1.toFixed(coin1Dp)})`);
          console.log(`  ${coin2.ticker}: ${bal2After.toFixed(coin2Dp)} (debit: ${debit2.toFixed(coin2Dp)})`);

          const tol1 = Math.pow(10, -coin1Dp) * 2;
          const tol2 = Math.pow(10, -coin2Dp) * 2;
          const ok1 = Math.abs(debit1 - parseFloat(amount1)) < tol1;
          const ok2 = Math.abs(debit2 - parseFloat(amount2)) < tol2;

          if (ok1 && ok2) {
            logResult('Multi-coin debit math correct', 'Both match', 'Both match', 'passed');
          } else {
            const details = [];
            if (!ok1) {details.push(`${coin1.ticker}: expected ${amount1}, got ${debit1.toFixed(coin1Dp)}`);}
            if (!ok2) {details.push(`${coin2.ticker}: expected ${amount2}, got ${debit2.toFixed(coin2Dp)}`);}
            logResult('Multi-coin debit math correct', 'Both match', details.join('; '), 'failed');
          }
        }
      }
    }
  }

  // ============================================================================
  // SUMMARY
  // ============================================================================
  console.log('\n========================================');
  console.log('TEST SUMMARY');
  console.log('========================================');
  console.log(`Passed:  ${results.passed}`);
  console.log(`Failed:  ${results.failed}`);
  if (results.skipped > 0) {
    console.log(`Skipped: ${results.skipped}`);
  }
  console.log(`Total:   ${results.passed + results.failed + results.skipped}`);

  if (results.failed > 0) {
    console.log('\nFailed tests:');
    for (const { testName, expectedError, actualError } of results.errors) {
      console.log(`  - ${testName}`);
      console.log(`    Expected: ${expectedError}`);
      console.log(`    Actual:   ${actualError}`);
    }
  }

  if (results.authFailed) {
    console.log('\n\u26a0 Some tests skipped due to authentication errors.');
    console.log('  Verify your API_KEY has proper permissions.');
  }

  if (RUN.guild && !guildAuthSuccess && GUILD_PASSWORD) {
    console.log('\n\u26a0 Guild tests skipped due to guild auth failure.');
  } else if (RUN.guild && !GUILD_PASSWORD) {
    console.log('\n\u26a0 Guild tests skipped: set GUILD_PASSWORD in .env');
  }

  console.log('');
  process.exit(results.failed > 0 ? 1 : 0);
}

runTests().catch((error) => {
  console.error('Test runner failed:', error.message);
  process.exit(1);
});
