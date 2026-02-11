// test-bulk-payout-errors.mjs
// Error/edge case tests for bulk payout endpoints
import dotenv from 'dotenv';

import { createHermesClient } from './index.mjs';

dotenv.config();

const apiUrl = process.env.API_URL;
const socketUrl = process.env.SOCKET_URL;
const apiKey = process.env.API_KEY;

if (!apiUrl || !socketUrl || !apiKey) {
  console.error('Missing required env vars: API_URL, SOCKET_URL, API_KEY');
  process.exit(1);
}

console.log(`Using API_URL: ${apiUrl}`);
console.log(`API_KEY: ${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 4)}`);

// Parse command-line flags
// Usage: node test-bulk-payout-errors.mjs [--user] [--guild] [--validation] [--balance] [--recipients] [--self-payout]
// If no flags, run all tests
const args = process.argv.slice(2);
const runAll = args.length === 0;

const runUserTests = runAll || args.includes('--user');
const runGuildTests = runAll || args.includes('--guild');
const runValidationTests = runAll || args.includes('--validation');
const runBalanceTests = runAll || args.includes('--balance');
const runRecipientTests = runAll || args.includes('--recipients');
const runSelfPayoutTests = runAll || args.includes('--self-payout');

const guildId = '873322086347702354'; // Script Kiddies test server
// const testChannelId = '1163655822719602688';
const validRecipient1 = '370026641323327491';
const validRecipient2 = '432117250833645570';
const initiatorUserId = '217379915803131906'; // The API key owner's user ID

// Guild security password (from env or hardcoded for test)
const guildPassword = process.env.GUILD_PASSWORD || '';

// Auth error patterns to detect
const AUTH_ERROR_PATTERNS = [
  'unauthorized',
  'invalid api key',
  'authentication',
  'not authenticated',
  'forbidden',
];

function isAuthError(errorMessage) {
  const lower = errorMessage.toLowerCase();
  return AUTH_ERROR_PATTERNS.some(pattern => lower.includes(pattern));
}

// Test results tracking
const results = {
  passed: 0,
  failed: 0,
  skipped: 0,
  authFailed: false,
  errors: [],
};

function logResult(testName, expectedError, actualError, status) {
  if (status === 'passed') {
    console.log(`  ✓ ${testName}`);
    results.passed++;
  } else if (status === 'skipped') {
    console.log(`  ⊘ ${testName} (SKIPPED - auth error)`);
    results.skipped++;
  } else {
    console.log(`  ✗ ${testName}`);
    console.log(`    Expected: ${expectedError}`);
    console.log(`    Actual: ${actualError}`);
    results.failed++;
    results.errors.push({ testName, expectedError, actualError });
  }
}

async function expectError(testName, fn, expectedErrorSubstring) {
  try {
    await fn();
    logResult(testName, `Error containing "${expectedErrorSubstring}"`, 'No error thrown', 'failed');
  } catch (error) {
    const errorMessage = error.message || String(error);

    // Check if this is an auth error (not the error we're testing for)
    if (isAuthError(errorMessage) && !expectedErrorSubstring.toLowerCase().includes('unauthorized')) {
      logResult(testName, `Error containing "${expectedErrorSubstring}"`, errorMessage, 'skipped');
      results.authFailed = true;
      return;
    }

    const passed = errorMessage.toLowerCase().includes(expectedErrorSubstring.toLowerCase());
    logResult(testName, `Error containing "${expectedErrorSubstring}"`, errorMessage, passed ? 'passed' : 'failed');
  }
}

async function runTests() {
  const client = createHermesClient();

  // Check API health first
  console.log('\n--- Pre-flight Checks ---\n');
  try {
    const health = await client.public.health();
    console.log(`  ✓ API Health: ${health.status || 'OK'}`);
  } catch (e) {
    console.error(`  ✗ API health check failed: ${e.message}`);
    process.exit(1);
  }

  // Verify authentication works before running error tests
  console.log('\n--- Authentication Check ---\n');
  try {
    const wallets = await client.private.getWallets();
    console.log(`  ✓ Auth working (found ${wallets.length || 0} wallets)`);
  } catch (e) {
    if (isAuthError(e.message)) {
      console.error(`  ✗ Authentication failed: ${e.message}`);
      console.error('\n  Please check your API_KEY in .env file.');
      console.error('  The error tests require a valid API key to test validation errors.\n');
      process.exit(1);
    }
    // Non-auth error is fine, continue
    console.log(`  ⚠ Wallet fetch failed (non-auth): ${e.message}`);
  }

  console.log('\n========================================');
  console.log('BULK PAYOUT ERROR TESTS');
  console.log('========================================');

  // ============================================
  // Guild Authentication (if guild tests enabled)
  // ============================================
  let guildAuthSuccess = false;
  if (runGuildTests) {
    console.log('\n--- Guild Authentication ---\n');
    if (!guildPassword) {
      console.log('  ⚠ GUILD_PASSWORD not set in .env - guild tests will be skipped');
      console.log('    Set GUILD_PASSWORD to enable guild bulk payout tests');
    } else {
      try {
        await client.private.guildSecurityLogin(guildId, { password: guildPassword });
        console.log(`  ✓ Guild security login successful for guild ${guildId}`);
        guildAuthSuccess = true;
      } catch (e) {
        console.log(`  ✗ Guild security login failed: ${e.message}`);
        console.log('    Guild tests will be skipped');
      }
    }
  }

  // ============================================
  // VALIDATION TESTS - User Bulk Payout
  // ============================================
  if (runUserTests && runValidationTests) {
    console.log('\n--- User Bulk Payout: Validation Errors ---\n');

    await expectError(
      'Missing payouts array',
      () => client.private.bulkPayout({ memo: 'test' }),
      'missing or invalid payouts'
    );

    await expectError(
      'Empty payouts array',
      () => client.private.bulkPayout({ payouts: [] }),
      'missing or invalid payouts'
    );

    await expectError(
      'Invalid recipient (number instead of string)',
      () => client.private.bulkPayout({
        payouts: [{
          recipient: 12345,
          rewards: [{ ticker: 'RUNES', amount: '1' }],
        }],
      }),
      'invalid recipient at index'
    );

    await expectError(
      'Missing recipient field',
      () => client.private.bulkPayout({
        payouts: [{
          rewards: [{ ticker: 'RUNES', amount: '1' }],
        }],
      }),
      'invalid recipient at index'
    );

    await expectError(
      'Empty rewards array',
      () => client.private.bulkPayout({
        payouts: [{
          recipient: validRecipient1,
          rewards: [],
        }],
      }),
      'invalid or empty rewards'
    );

    await expectError(
      'Missing rewards array',
      () => client.private.bulkPayout({
        payouts: [{
          recipient: validRecipient1,
        }],
      }),
      'invalid or empty rewards'
    );

    await expectError(
      'Invalid ticker (empty string)',
      () => client.private.bulkPayout({
        payouts: [{
          recipient: validRecipient1,
          rewards: [{ ticker: '', amount: '1' }],
        }],
      }),
      'invalid ticker at payouts'
    );

    await expectError(
      'Missing amount',
      () => client.private.bulkPayout({
        payouts: [{
          recipient: validRecipient1,
          rewards: [{ ticker: 'RUNES' }],
        }],
      }),
      'missing amount at payouts'
    );

    await expectError(
      'Invalid amount (zero)',
      () => client.private.bulkPayout({
        payouts: [{
          recipient: validRecipient1,
          rewards: [{ ticker: 'RUNES', amount: '0' }],
        }],
      }),
      'must be positive'
    );

    await expectError(
      'Invalid amount (negative)',
      () => client.private.bulkPayout({
        payouts: [{
          recipient: validRecipient1,
          rewards: [{ ticker: 'RUNES', amount: '-10' }],
        }],
      }),
      'must be positive'
    );

    await expectError(
      'Invalid amount (non-numeric)',
      () => client.private.bulkPayout({
        payouts: [{
          recipient: validRecipient1,
          rewards: [{ ticker: 'RUNES', amount: 'abc' }],
        }],
      }),
      'must be positive'
    );
  }

  // ============================================
  // BALANCE TESTS - User Bulk Payout
  // ============================================
  if (runUserTests && runBalanceTests) {
    console.log('\n--- User Bulk Payout: Balance Errors ---\n');

    await expectError(
      'Insufficient balance (single coin, huge amount)',
      () => client.private.bulkPayout({
        payouts: [{
          recipient: validRecipient1,
          rewards: [{ ticker: 'RUNES', amount: '999999999999' }],
        }],
      }),
      'insufficient'
    );

    await expectError(
      'Multiple recipients, insufficient total balance',
      () => client.private.bulkPayout({
        payouts: [
          {
            recipient: validRecipient1,
            rewards: [{ ticker: 'RUNES', amount: '500000000' }],
          },
          {
            recipient: validRecipient2,
            rewards: [{ ticker: 'RUNES', amount: '500000000' }],
          },
        ],
      }),
      'insufficient'
    );

    await expectError(
      'Non-existent coin ticker',
      () => client.private.bulkPayout({
        payouts: [{
          recipient: validRecipient1,
          rewards: [{ ticker: 'NONEXISTENTCOIN123', amount: '1' }],
        }],
      }),
      'not found'
    );
  }

  // ============================================
  // RECIPIENT TESTS - User Bulk Payout
  // ============================================
  if (runUserTests && runRecipientTests) {
    console.log('\n--- User Bulk Payout: Recipient Errors ---\n');

    await expectError(
      'Duplicate recipient IDs',
      () => client.private.bulkPayout({
        payouts: [
          {
            recipient: validRecipient1,
            rewards: [{ ticker: 'RUNES', amount: '0.001' }],
          },
          {
            recipient: validRecipient1, // Same recipient again
            rewards: [{ ticker: 'RUNES', amount: '0.001' }],
          },
        ],
      }),
      'duplicate'
    );
  }

  // ============================================
  // VALIDATION TESTS - Guild Bulk Payout
  // ============================================
  if (runGuildTests && runValidationTests && guildAuthSuccess) {
    console.log('\n--- Guild Bulk Payout: Validation Errors ---\n');

    await expectError(
      'Guild: Missing payouts array',
      () => client.private.guildBulkPayout(guildId, { memo: 'test' }),
      'missing or invalid payouts'
    );

    await expectError(
      'Guild: Empty payouts array',
      () => client.private.guildBulkPayout(guildId, { payouts: [] }),
      'missing or invalid payouts'
    );

    await expectError(
      'Guild: Invalid recipient',
      () => client.private.guildBulkPayout(guildId, {
        payouts: [{
          recipient: 12345,
          rewards: [{ ticker: 'RUNES', amount: '1' }],
        }],
      }),
      'invalid recipient at index'
    );

    await expectError(
      'Guild: Invalid amount (negative)',
      () => client.private.guildBulkPayout(guildId, {
        payouts: [{
          recipient: validRecipient1,
          rewards: [{ ticker: 'RUNES', amount: '-5' }],
        }],
      }),
      'must be positive'
    );

    await expectError(
      'Guild: Invalid notifyChannelId (channel not in guild)',
      () => client.private.guildBulkPayout(guildId, {
        notifyChannelId: '000000000000000000', // Non-existent channel
        payouts: [{
          recipient: validRecipient1,
          rewards: [{ ticker: 'RUNES', amount: '0.001' }],
        }],
      }),
      'notifychannelid'
    );
  }

  // ============================================
  // BALANCE TESTS - Guild Bulk Payout
  // ============================================
  if (runGuildTests && runBalanceTests && guildAuthSuccess) {
    console.log('\n--- Guild Bulk Payout: Balance Errors ---\n');

    await expectError(
      'Guild: Insufficient balance (huge amount)',
      () => client.private.guildBulkPayout(guildId, {
        payouts: [{
          recipient: validRecipient1,
          rewards: [{ ticker: 'RUNES', amount: '999999999999' }],
        }],
      }),
      'insufficient'
    );

    await expectError(
      'Guild: Non-existent coin ticker',
      () => client.private.guildBulkPayout(guildId, {
        payouts: [{
          recipient: validRecipient1,
          rewards: [{ ticker: 'FAKECOIN999', amount: '1' }],
        }],
      }),
      'not found'
    );
  }

  // ============================================
  // RECIPIENT TESTS - Guild Bulk Payout
  // ============================================
  if (runGuildTests && runRecipientTests && guildAuthSuccess) {
    console.log('\n--- Guild Bulk Payout: Recipient Errors ---\n');

    await expectError(
      'Guild: Duplicate recipient IDs',
      () => client.private.guildBulkPayout(guildId, {
        payouts: [
          {
            recipient: validRecipient1,
            rewards: [{ ticker: 'RUNES', amount: '0.001' }],
          },
          {
            recipient: validRecipient1,
            rewards: [{ ticker: 'RUNES', amount: '0.002' }],
          },
        ],
      }),
      'duplicate'
    );
  }

  // ============================================
  // COMPLEX SCENARIO TESTS
  // ============================================
  if (runAll || (runUserTests && runBalanceTests && runRecipientTests)) {
    console.log('\n--- Complex Scenario Tests ---\n');

    await expectError(
      'Complex: Multiple recipients, multiple coins, one insufficient',
      () => client.private.bulkPayout({
        memo: 'Complex test',
        payouts: [
          {
            recipient: validRecipient1,
            rewards: [
              { ticker: 'RUNES', amount: '0.001' },
            ],
          },
          {
            recipient: validRecipient2,
            rewards: [
              { ticker: 'RUNES', amount: '999999999' }, // This should fail
            ],
          },
        ],
      }),
      'insufficient'
    );
  }

  // ============================================
  // SELF-PAYOUT TESTS (initiator is also a recipient)
  // ============================================
  if (runSelfPayoutTests) {
    console.log('\n--- Self-Payout Tests (Initiator as Recipient) ---\n');

    // Fetch coins to get decimal places
    let coins = [];
    try {
      coins = await client.public.getCoins();
      console.log(`  Found ${coins.length} coins in system`);
    } catch (e) {
      console.log(`  ⚠ Failed to fetch coins: ${e.message}`);
    }
    const coinMap = new Map(coins.map(c => [c.ticker, c]));

    // Get wallet balances
    let wallets = [];
    try {
      wallets = await client.private.getWallets();
      console.log(`  Found ${wallets.length} wallets with balances\n`);
    } catch (e) {
      console.log(`  ✗ Failed to fetch wallets: ${e.message}`);
    }

    // Find wallets with sufficient balance for testing (need at least 0.01 for safe testing)
    const testableWallets = wallets
      .filter(w => parseFloat(w.available) >= 0.01)
      .slice(0, 3); // Use up to 3 coins for multi-coin tests

    if (testableWallets.length === 0) {
      console.log('  ⚠ No wallets with sufficient balance (>= 0.01) for self-payout tests');
      console.log('  Skipping self-payout tests\n');
    } else {
      console.log('  Available wallets for testing:');
      for (const w of testableWallets) {
        const coin = coinMap.get(w.ticker);
        const dp = coin?.dp ?? 8;
        const minUnit = Math.pow(10, -dp).toFixed(dp);
        console.log(`    ${w.ticker}: ${w.available} (dp: ${dp}, min unit: ${minUnit})`);
      }
      console.log('');

      // ---- Test 1: Single coin self-payout with other recipient ----
      const primaryWallet = testableWallets[0];
      const primaryCoin = coinMap.get(primaryWallet.ticker);
      const primaryDp = primaryCoin?.dp ?? 8;
      const primaryTicker = primaryWallet.ticker;

      console.log(`  === Test 1: Single coin self-payout (${primaryTicker}) ===`);

      const selfPayoutAmount = '0.005';
      const otherRecipientAmount = '0.003';
      const balanceBefore1 = parseFloat(primaryWallet.available);

      console.log(`  Balance before: ${balanceBefore1.toFixed(primaryDp)} ${primaryTicker}`);
      const totalSent = parseFloat(selfPayoutAmount) + parseFloat(otherRecipientAmount);
      const expectedNetChange = parseFloat(otherRecipientAmount);
      console.log(`  Total to distribute: ${totalSent.toFixed(primaryDp)} ${primaryTicker}`);
      console.log(`  Amount to self: ${selfPayoutAmount} | Amount to other: ${otherRecipientAmount}`);
      console.log(`  Expected net change: -${expectedNetChange.toFixed(primaryDp)}`);

      let test1Success = false;
      try {
        const result = await client.private.bulkPayout({
          memo: 'Self-payout single coin test',
          payouts: [
            {
              recipient: initiatorUserId,
              rank: 1,
              rewards: [{ ticker: primaryTicker, amount: selfPayoutAmount }],
            },
            {
              recipient: validRecipient1,
              rank: 2,
              rewards: [{ ticker: primaryTicker, amount: otherRecipientAmount }],
            },
          ],
        });
        console.log(`  ✓ Self-payout succeeded (ID: ${result.bulkPayoutId})`);
        test1Success = true;
        results.passed++;
      } catch (e) {
        console.log(`  ✗ Self-payout failed: ${e.message}`);
        results.failed++;
        results.errors.push({ testName: 'Single coin self-payout', expectedError: 'Success', actualError: e.message });
      }

      if (test1Success) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const walletsAfter1 = await client.private.getWallets();
        const walletAfter1 = walletsAfter1.find(w => w.ticker === primaryTicker);
        const balanceAfter1 = parseFloat(walletAfter1?.available || '0');
        const actualNetChange1 = balanceBefore1 - balanceAfter1;

        console.log(`  Balance after: ${balanceAfter1.toFixed(primaryDp)} ${primaryTicker}`);
        console.log(`  Actual net change: -${actualNetChange1.toFixed(primaryDp)}`);

        const tolerance = Math.pow(10, -primaryDp);
        if (Math.abs(actualNetChange1 - expectedNetChange) < tolerance) {
          console.log('  ✓ Balance math correct');
          results.passed++;
        } else {
          console.log(`  ✗ Balance math mismatch! Expected: -${expectedNetChange.toFixed(primaryDp)}, Got: -${actualNetChange1.toFixed(primaryDp)}`);
          results.failed++;
          results.errors.push({ testName: 'Single coin balance math', expectedError: `-${expectedNetChange}`, actualError: `-${actualNetChange1}` });
        }
      }

      // ---- Test 2: Self-only payout (100% back to initiator) ----
      console.log(`\n  === Test 2: Self-only payout (${primaryTicker}) ===`);

      const walletsBeforeSelfOnly = await client.private.getWallets();
      const balanceBeforeSelfOnly = parseFloat(walletsBeforeSelfOnly.find(w => w.ticker === primaryTicker)?.available || '0');
      console.log(`  Balance before: ${balanceBeforeSelfOnly.toFixed(primaryDp)} ${primaryTicker}`);

      const selfOnlyAmount = '0.002';
      let test2Success = false;
      try {
        const result = await client.private.bulkPayout({
          memo: 'Self-only payout test',
          payouts: [{ recipient: initiatorUserId, rewards: [{ ticker: primaryTicker, amount: selfOnlyAmount }] }],
        });
        console.log(`  ✓ Self-only payout succeeded (ID: ${result.bulkPayoutId})`);
        test2Success = true;
        results.passed++;
      } catch (e) {
        console.log(`  ✗ Self-only payout failed: ${e.message}`);
        results.failed++;
        results.errors.push({ testName: 'Self-only payout', expectedError: 'Success', actualError: e.message });
      }

      if (test2Success) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const walletsAfterSelfOnly = await client.private.getWallets();
        const balanceAfterSelfOnly = parseFloat(walletsAfterSelfOnly.find(w => w.ticker === primaryTicker)?.available || '0');
        const selfOnlyNetChange = balanceBeforeSelfOnly - balanceAfterSelfOnly;

        console.log(`  Balance after: ${balanceAfterSelfOnly.toFixed(primaryDp)} ${primaryTicker}`);
        console.log(`  Net change: ${selfOnlyNetChange.toFixed(primaryDp)}`);

        const tolerance = Math.pow(10, -primaryDp);
        if (Math.abs(selfOnlyNetChange) < tolerance) {
          console.log('  ✓ Balance unchanged (debit and credit cancel out)');
          results.passed++;
        } else {
          console.log('  ✗ Balance changed unexpectedly!');
          results.failed++;
          results.errors.push({ testName: 'Self-only net balance = 0', expectedError: '0', actualError: `${selfOnlyNetChange}` });
        }
      }

      // ---- Test 3: Multi-coin self-payout ----
      if (testableWallets.length >= 2) {
        console.log('\n  === Test 3: Multi-coin self-payout ===');

        // Re-fetch fresh wallet balances before this test
        const freshWallets3 = await client.private.getWallets();
        const multiCoinTickers = testableWallets.slice(0, 2).map(w => w.ticker);
        const multiCoinWallets = freshWallets3.filter(w => multiCoinTickers.includes(w.ticker));

        const balancesBefore3 = {};
        const amounts3 = {};

        console.log('  Coins in test:');
        for (const w of multiCoinWallets) {
          const coin = coinMap.get(w.ticker);
          const dp = coin?.dp ?? 8;
          balancesBefore3[w.ticker] = parseFloat(w.available);
          amounts3[w.ticker] = { toSelf: '0.004', toOther: '0.002', dp };
          console.log(`    ${w.ticker}: ${w.available} (sending 0.004 to self, 0.002 to other)`);
        }

        let test3Success = false;
        try {
          const result = await client.private.bulkPayout({
            memo: 'Multi-coin self-payout test',
            payouts: [
              {
                recipient: initiatorUserId,
                rank: 1,
                rewards: multiCoinWallets.map(w => ({ ticker: w.ticker, amount: amounts3[w.ticker].toSelf })),
              },
              {
                recipient: validRecipient1,
                rank: 2,
                rewards: multiCoinWallets.map(w => ({ ticker: w.ticker, amount: amounts3[w.ticker].toOther })),
              },
            ],
          });
          console.log(`  ✓ Multi-coin self-payout succeeded (ID: ${result.bulkPayoutId})`);
          test3Success = true;
          results.passed++;
        } catch (e) {
          console.log(`  ✗ Multi-coin self-payout failed: ${e.message}`);
          results.failed++;
          results.errors.push({ testName: 'Multi-coin self-payout', expectedError: 'Success', actualError: e.message });
        }

        if (test3Success) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          const walletsAfter3 = await client.private.getWallets();

          let allCorrect = true;
          for (const w of multiCoinWallets) {
            const walletAfter = walletsAfter3.find(wa => wa.ticker === w.ticker);
            const balanceAfter = parseFloat(walletAfter?.available || '0');
            const expectedNet = parseFloat(amounts3[w.ticker].toOther); // Only amount to other is net loss
            const actualNet = balancesBefore3[w.ticker] - balanceAfter;
            const dp = amounts3[w.ticker].dp;
            const tolerance = Math.pow(10, -dp);

            console.log(`    ${w.ticker}: before=${balancesBefore3[w.ticker].toFixed(dp)}, after=${balanceAfter.toFixed(dp)}, net=-${actualNet.toFixed(dp)} (expected -${expectedNet.toFixed(dp)})`);

            if (Math.abs(actualNet - expectedNet) >= tolerance) {
              allCorrect = false;
            }
          }

          if (allCorrect) {
            console.log('  ✓ Multi-coin balance math correct for all coins');
            results.passed++;
          } else {
            console.log('  ✗ Multi-coin balance math mismatch');
            results.failed++;
            results.errors.push({ testName: 'Multi-coin balance math', expectedError: 'All coins correct', actualError: 'Mismatch' });
          }
        }
      }

      // ---- Test 4: Edge case - exceed balance by 1 minimal unit (should fail) ----
      console.log('\n  === Test 4: Exceed balance by 1 minimal unit (should fail) ===');

      const walletsForEdge = await client.private.getWallets();
      const edgeWallet = walletsForEdge.find(w => w.ticker === primaryTicker);
      const edgeCoin = coinMap.get(primaryTicker);
      const edgeDp = edgeCoin?.dp ?? 8;
      const edgeBalance = parseFloat(edgeWallet?.available || '0');
      const minUnit = Math.pow(10, -edgeDp);
      const exceedAmount = (edgeBalance + minUnit).toFixed(edgeDp);

      console.log(`  ${primaryTicker} balance: ${edgeBalance.toFixed(edgeDp)}`);
      console.log(`  Min unit (1 satoshi): ${minUnit.toFixed(edgeDp)}`);
      console.log(`  Attempting to send: ${exceedAmount} (balance + 1 min unit)`);

      await expectError(
        `Exceed balance by 1 minimal unit (${primaryTicker})`,
        () => client.private.bulkPayout({
          payouts: [{
            recipient: validRecipient1,
            rewards: [{ ticker: primaryTicker, amount: exceedAmount }],
          }],
        }),
        'insufficient'
      );

      // ---- Test 5: Edge case - self-payout exceeding balance (should fail) ----
      console.log('\n  === Test 5: Self-payout exceeding balance (should fail) ===');

      const exceedSelfAmount = (edgeBalance + minUnit).toFixed(edgeDp);
      console.log(`  Attempting self-payout of ${exceedSelfAmount} ${primaryTicker} (exceeds balance)`);

      await expectError(
        'Self-payout exceeding balance',
        () => client.private.bulkPayout({
          payouts: [{
            recipient: initiatorUserId,
            rewards: [{ ticker: primaryTicker, amount: exceedSelfAmount }],
          }],
        }),
        'insufficient'
      );

      // ---- Test 6: Edge case - exact balance self-payout (should succeed, net = 0) ----
      console.log('\n  === Test 6: Exact balance self-payout (should succeed) ===');

      const walletsForExact = await client.private.getWallets();
      const exactWallet = walletsForExact.find(w => w.ticker === primaryTicker);
      const exactBalance = parseFloat(exactWallet?.available || '0');
      const exactAmount = exactBalance.toFixed(edgeDp);

      console.log(`  ${primaryTicker} balance: ${exactBalance.toFixed(edgeDp)}`);
      console.log(`  Attempting self-payout of exact balance: ${exactAmount}`);

      let test6Success = false;
      try {
        const result = await client.private.bulkPayout({
          memo: 'Exact balance self-payout test',
          payouts: [{
            recipient: initiatorUserId,
            rewards: [{ ticker: primaryTicker, amount: exactAmount }],
          }],
        });
        console.log(`  ✓ Exact balance self-payout succeeded (ID: ${result.bulkPayoutId})`);
        test6Success = true;
        results.passed++;
      } catch (e) {
        console.log(`  ✗ Exact balance self-payout failed: ${e.message}`);
        results.failed++;
        results.errors.push({ testName: 'Exact balance self-payout', expectedError: 'Success', actualError: e.message });
      }

      if (test6Success) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const walletsAfterExact = await client.private.getWallets();
        const walletAfterExact = walletsAfterExact.find(w => w.ticker === primaryTicker);
        const balanceAfterExact = parseFloat(walletAfterExact?.available || '0');
        const exactNetChange = exactBalance - balanceAfterExact;

        console.log(`  Balance after: ${balanceAfterExact.toFixed(edgeDp)} ${primaryTicker}`);
        console.log(`  Net change: ${exactNetChange.toFixed(edgeDp)}`);

        const tolerance = Math.pow(10, -edgeDp);
        if (Math.abs(exactNetChange) < tolerance) {
          console.log('  ✓ Balance unchanged after exact self-payout');
          results.passed++;
        } else {
          console.log('  ✗ Balance changed unexpectedly after exact self-payout!');
          results.failed++;
          results.errors.push({ testName: 'Exact balance self-payout net = 0', expectedError: '0', actualError: `${exactNetChange}` });
        }
      }
    }
  }

  // Print summary
  console.log('\n========================================');
  console.log('TEST SUMMARY');
  console.log('========================================');
  console.log(`Passed:  ${results.passed}`);
  console.log(`Failed:  ${results.failed}`);
  if (results.skipped > 0) {
    console.log(`Skipped: ${results.skipped} (auth errors - check API key)`);
  }

  if (results.failed > 0) {
    console.log('\nFailed tests:');
    results.errors.forEach(({ testName, expectedError, actualError }) => {
      console.log(`  - ${testName}`);
      console.log(`    Expected: ${expectedError}`);
      console.log(`    Actual: ${actualError}`);
    });
  }

  if (results.authFailed) {
    console.log('\n⚠ Some tests were skipped due to authentication errors.');
    console.log('  Please verify your API_KEY is correct and has proper permissions.');
  }

  if (runGuildTests && !guildAuthSuccess) {
    console.log('\n⚠ Guild tests were skipped due to guild authentication failure.');
    console.log('  Set GUILD_PASSWORD in your .env file to enable guild tests.');
  }

  console.log('');
  process.exit(results.failed > 0 ? 1 : 0);
}

runTests().catch((error) => {
  console.error('Test runner failed:', error.message);
  process.exit(1);
});
