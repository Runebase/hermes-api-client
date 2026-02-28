# @hermes-core/api-client

Node.js SDK for the Hermes API — a multichain Discord tipbot platform supporting tips, airdrops, gifts, faucets, guild wallets, trivia, and real-time Socket.IO events.

## Installation

```bash
npm install @hermes-core/api-client
```

## Quick Start

```javascript
import { createHermesClient } from '@hermes-core/api-client';

const client = createHermesClient({
  apiUrl: 'https://your-hermes-api.com',
  socketUrl: 'https://your-hermes-api.com',
  apiKey: 'YOUR_API_KEY',
});

// Public endpoints (no auth required)
const chains = await client.public.getChains();
const stats = await client.public.getStats();

// Private endpoints (requires API key)
const wallets = await client.private.getWallets();
const user = await client.private.getUser();

// Real-time events
client.socket.socket.on('wallets_updated', (data) => {
  console.log('Wallets changed:', data);
});
```

## Configuration

```javascript
const client = createHermesClient({
  apiUrl: 'https://your-hermes-api.com',   // API base URL (default: process.env.API_URL)
  socketUrl: 'https://your-hermes-api.com', // Socket.IO URL (default: process.env.SOCKET_URL)
  apiKey: 'YOUR_API_KEY',                   // API key (default: process.env.API_KEY)
  guildSecurity: {
    autoRefresh: true,                      // Auto-refresh guild sessions before expiry (default: true)
    defaultTtlSeconds: 1800,                // Default session TTL (optional)
    sessions: {},                           // Pre-loaded sessions (optional)
    onSessionUpdate: (guildId, session) => { // Callback on session changes (optional)
      // Persist session to disk/DB for recovery
    },
  },
});
```

The client exposes three namespaces:
- `client.public` — Unauthenticated endpoints (chain info, guild listings, trivia, stats)
- `client.private` — Authenticated endpoints (wallets, tips, airdrops, gifts, guild management)
- `client.socket` — Real-time Socket.IO connection

## Public API

These endpoints require no authentication.

### Chains

```javascript
// List all active chains
const chains = await client.public.getChains();

// Get chain details by name
const chain = await client.public.getChainByName('runebase');
```

### Coins

```javascript
const coins = await client.public.getCoins();
```

### Guilds

```javascript
// List guilds (public directory)
const guilds = await client.public.getGuilds({
  orderBy: 'memberCount',  // optional: 'memberCount', 'createdAt', etc.
  orderDir: 'DESC',        // optional: 'ASC' or 'DESC'
  limit: 25,               // optional
  offset: 0,               // optional
  search: 'crypto',        // optional: search by name
});

// Get guild details (channels, roles, emojis, stats, vote status)
const guild = await client.public.getGuildDetails('GUILD_ID');

// Get guild wallets (public balances)
const wallets = await client.public.getGuildWallets('GUILD_ID');

// Get guild reviews
const reviews = await client.public.getGuildReviews('GUILD_ID', { page: 1, pageSize: 25 });

// Get guild faucets
const faucets = await client.public.getGuildFaucets('GUILD_ID');

// Get guild members
const members = await client.public.getGuildMembers('GUILD_ID');

// Get guild operations
const operations = await client.public.getGuildOperations('GUILD_ID', { page: 1, limit: 10 });

// Get guild rewards (bump or vote)
const rewards = await client.public.getGuildRewards('GUILD_ID', 'bump');

// Get guild schedules
const schedules = await client.public.getGuildSchedules('GUILD_ID', {
  limit: 100,
  offset: 0,
  active: true,  // optional: filter by active status
});
```

### Operations

```javascript
// Get operation by ID (shareable link)
const operation = await client.public.getOperationById('OPERATION_ID');
```

### Gifts

```javascript
// Look up a gift by code (public info)
const gift = await client.public.getGiftByCode('GIFT_CODE');
```

### Stats & Health

```javascript
const stats = await client.public.getStats();   // { servers, users }
const health = await client.public.health();
```

### Trivia

```javascript
// Browse categories and questions
const categories = await client.public.getTriviaCategories({ page: 1, pageSize: 25 });
const questions = await client.public.getTriviaQuestions({ categoryId: 'UUID', page: 1, pageSize: 25 });
const question = await client.public.getTriviaQuestionById('QUESTION_ID');

// Browse curation tickets
const pending = await client.public.getTriviaTicketsPending({ page: 1, pageSize: 25, type: 'user_reports' });
const resolved = await client.public.getTriviaTicketsResolved({ page: 1, pageSize: 25 });
const ticket = await client.public.getTriviaTicketById('TICKET_ID');
```

## Private API

All private endpoints require a valid API key.

### User & Auth

```javascript
// Get current user profile
const user = await client.private.getUser();
// Returns: { id, globalName, avatar, premiumExpiry, airdropScheduleSlots,
//            publicProfile, publicWallet, publicOperations, publicTransactions,
//            isAdmin, createdAt, updatedAt }

// Update privacy settings
await client.private.updateUser({
  publicProfile: true,
  publicWallet: false,
  publicOperations: true,
  publicTransactions: false,
});

// Get user's Discord guilds
const guilds = await client.private.getUserGuilds();
```

### Wallets

```javascript
// Get all wallet balances
const wallets = await client.private.getWallets();
// Returns: [{ ticker, available, locked, updatedAt }, ...]

// Get deposit address for a chain
const deposit = await client.private.getDepositAddress('runebase');
// Returns: { address, memo }

// Withdraw to external address
const result = await client.private.withdraw({
  ticker: 'RUNES',
  chainName: 'runebase',
  amount: '100.5',
  address: 'RXyz123abc...',
  memo: null,              // optional, required for some chains
  idempotencyKey: 'uuid',  // optional, auto-generated if omitted
});
```

### Tips

```javascript
const result = await client.private.tip({
  ticker: 'RUNES',
  recipientIds: ['user_id_1', 'user_id_2'],
  amountPerRecipient: '1.00',
  notifyChannelId: 'channel_id',  // optional
  idempotencyKey: 'uuid',         // optional
});
```

### Airdrops

All airdrop methods accept an optional `idempotencyKey` parameter.

```javascript
// Reactdrop - users react with emoji to claim
await client.private.reactdrop({
  ticker: 'RUNES',
  amount: '100',
  channelId: 'CHANNEL_ID',
  duration: 300000,           // ms (default: 5 min)
  emoji: '🎉',
  roleId: 'ROLE_ID',         // optional: restrict to role
  captcha: 'math',           // 'math', 'none', or 'trivia'
  maxRecipients: '2000',
});

// Partydrop - similar to reactdrop without emoji/captcha
await client.private.partydrop({
  ticker: 'RUNES', amount: '100', channelId: 'CHANNEL_ID',
  duration: 300000, roleId: 'ROLE_ID', maxRecipients: '2000',
});

// Flood - instant split among active users
await client.private.flood({
  ticker: 'RUNES', amount: '100', maxRecipients: 50,
  channelId: 'CHANNEL_ID', roleId: 'ROLE_ID',
});

// Rain - random distribution to active users
await client.private.rain({
  ticker: 'RUNES', amount: '100', maxRecipients: 50,
  channelId: 'CHANNEL_ID', roleId: 'ROLE_ID',
});

// Soak - even split among online users
await client.private.soak({
  ticker: 'RUNES', amount: '100', maxRecipients: 50,
  channelId: 'CHANNEL_ID', roleId: 'ROLE_ID',
});

// Wave - timed distribution
await client.private.wave({
  ticker: 'RUNES', amount: '100', maxRecipients: 50,
  channelId: 'CHANNEL_ID', roleId: 'ROLE_ID',
});

// Sleet - slow drip airdrop
await client.private.sleet({
  ticker: 'RUNES', amount: '100', channelId: 'CHANNEL_ID',
  roleId: 'ROLE_ID', maxRecipients: 400, duration: 900000,
});

// Trivia - trivia-based airdrop
await client.private.trivia({
  ticker: 'RUNES', amount: '100', channelId: 'CHANNEL_ID',
  duration: 300000, roleId: 'ROLE_ID',
  categoryId: 'UUID',   // optional
  questionId: 'UUID',   // optional
  maxRecipients: '2000',
});
```

### Gifts

```javascript
// List your gifts
const gifts = await client.private.getGifts({ page: 1, limit: 10, status: 'all' });
// status: 'all', 'generated', 'partial', 'claimed', 'cancelled', 'expired'

// Create a coin gift
const gift = await client.private.createGift({
  giftType: 'coin',
  coinTicker: 'RUNES',
  amountPerClaim: '10',
  maxClaims: 100,
  expiresInDays: 30,    // optional (1-365)
  message: 'Enjoy!',    // optional (max 500 chars)
});
// Returns: { code, operationId, totalAmount, maxClaims, expiresAt }

// Create a premium gift
const premiumGift = await client.private.createGift({
  giftType: 'premium',
  coinTicker: 'RUNES',
  itemId: 'STORE_ITEM_ID',
  maxClaims: 5,
  targetType: 'user',  // 'user' or 'guild'
});

// Claim a gift
const claim = await client.private.claimGift('GIFT_CODE', {
  guildId: 'GUILD_ID',  // required if targetType is 'guild'
});

// Cancel a gift (refunds remaining balance)
const cancel = await client.private.cancelGift('GIFT_CODE');
```

### Store

```javascript
const purchase = await client.private.purchaseItem({
  itemId: 'ITEM_ID',
  guildId: 'GUILD_ID',           // optional
  coinTickerToBoost: 'RUNES',    // optional
});
```

### Bulk Payouts

```javascript
// Create a bulk payout
const payout = await client.private.bulkPayout({
  memo: 'Monthly rewards',
  notifyChannelId: 'CHANNEL_ID',
  payouts: [
    { recipientId: 'user_1', ticker: 'RUNES', amount: '100' },
    { recipientId: 'user_2', ticker: 'RUNES', amount: '50' },
  ],
});

// List your bulk payouts
const payouts = await client.private.getBulkPayouts({ page: 1, limit: 10 });

// Get bulk payout details
const detail = await client.private.getBulkPayoutById('PAYOUT_ID');
```

### Trivia Submission & Curation

```javascript
// Submit a new question
await client.private.submitTriviaQuestion({
  categoryId: 'CATEGORY_UUID',
  question: 'What is the capital of France?',
  options: ['London', 'Paris', 'Berlin', 'Madrid'],
  correctAnswerIndex: 1,
  difficulty: 'easy',       // optional
  explanation: 'Paris...',  // optional
});

// Submit a new category
await client.private.submitTriviaCategory({
  name: 'Geography',
  description: 'Questions about world geography',  // optional
  emoji: '🌍',                                      // optional
});

// Report a question
await client.private.reportTriviaQuestion('QUESTION_ID', {
  type: 'edit',  // 'edit' or 'delete'
  reason: 'Incorrect answer',
  proposedContent: { question: 'Corrected question text' },  // optional
});

// Get your tickets
const tickets = await client.private.getTriviaTicketsUser({ page: 1, pageSize: 25, state: 'open' });

// Vote on a ticket (fact checkers only)
await client.private.voteTriviaTicket('TICKET_ID', { voteType: 'approve' });

// Reactivate a disabled question (fact checkers only)
await client.private.reactivateTriviaQuestion('QUESTION_ID');

// Get trashed questions
const trashed = await client.private.getTriviaTrashedQuestions();

// Check fact checker status
const status = await client.private.isFactChecker();

// Request curation tokens
await client.private.requestTriviaTokens();

// Get your token balance
const tokens = await client.private.getTriviaTokens();
```

## Guild Operations

### Non-Privileged (auth only)

```javascript
// Donate to a guild wallet
await client.private.guildDonation('GUILD_ID', {
  ticker: 'RUNES',
  amount: '100',
});

// Get invite link for adding Hermes bot
const invite = await client.private.getGuildInviteHermes('GUILD_ID');

// Get your roles in a guild
const roles = await client.private.getUserGuildRoles('GUILD_ID');

// Claim a faucet
const claim = await client.private.claimGuildFaucet('GUILD_ID', 'FAUCET_ID');

// Get vote/bump history
const voteHistory = await client.private.getGuildVoteHistory('GUILD_ID');
const bumpHistory = await client.private.getGuildBumpHistory('GUILD_ID');

// Get a specific schedule
const schedule = await client.private.getGuildSchedule('GUILD_ID', 'SCHEDULE_ID');
```

### Privileged (requires guild security session)

Privileged operations require an active guild security session. The SDK handles session injection via `X-Guild-Authorization` headers, auto-refresh before expiry, and automatic retry on 401.

```javascript
// Login to guild security
await client.private.guildSecurityLogin('GUILD_ID', {
  password: 'YOUR_PASSWORD',
  ttlMinutes: 30,  // or ttlSeconds: 1800
});

// All subsequent guild privileged calls auto-inject the session token:

// Guild tip
await client.private.guildTip('GUILD_ID', {
  ticker: 'RUNES',
  recipientIds: ['user_id_1'],
  amountPerRecipient: '1.00',
  notifyChannelId: 'CHANNEL_ID',
});

// Guild airdrops (same parameters as user airdrops)
await client.private.guildFlood('GUILD_ID', { ticker: 'RUNES', amount: '100', maxRecipients: 50, channelId: 'CH_ID' });
await client.private.guildRain('GUILD_ID', { ... });
await client.private.guildSoak('GUILD_ID', { ... });
await client.private.guildWave('GUILD_ID', { ... });
await client.private.guildSleet('GUILD_ID', { ... });
await client.private.guildReactdrop('GUILD_ID', { ... });
await client.private.guildPartydrop('GUILD_ID', { ... });
await client.private.guildTrivia('GUILD_ID', { ... });

// Guild bulk payout
await client.private.guildBulkPayout('GUILD_ID', {
  memo: 'Weekly rewards',
  notifyChannelId: 'CHANNEL_ID',
  payouts: [{ recipientId: 'user_1', ticker: 'RUNES', amount: '50' }],
});
const payouts = await client.private.getGuildBulkPayouts('GUILD_ID', { page: 1, limit: 10 });
const payout = await client.private.getGuildBulkPayoutById('GUILD_ID', 'PAYOUT_ID');

// Logout
await client.private.guildSecurityLogout('GUILD_ID');
```

### Guild Settings (Privileged)

```javascript
// Update guild settings
await client.private.updateGuildSettings('GUILD_ID', {
  publicOperations: true,
});

// Set faucet notification channel
await client.private.updateGuildFaucetNotifyChannel('GUILD_ID', {
  channelId: 'CHANNEL_ID',
});
```

### Guild Faucets (Privileged)

```javascript
// Create a faucet
const faucet = await client.private.createGuildFaucet('GUILD_ID', {
  ticker: 'RUNES',
  title: 'Daily Faucet',
  type: 'static',           // 'static' or 'percentage'
  value: '10',              // amount (static) or percentage (0.00001-100)
  claimInterval: 86400,     // seconds between claims (60 - 2592000)
  roleId: 'ROLE_ID',        // optional: restrict to role
});

// Delete a faucet
await client.private.deleteGuildFaucet('GUILD_ID', 'FAUCET_ID');
```

### Guild Rewards (Privileged)

```javascript
// Create/set a bump or vote reward
await client.private.createGuildReward('GUILD_ID', 'bump', {
  ticker: 'RUNES',
  amountType: 'static',   // 'static' or 'percentage'
  amount: '1.0',
});

// Update a reward
await client.private.updateGuildReward('GUILD_ID', 'vote', 'RUNES', {
  amount: '2.0',
  status: 'active',  // 'active' or 'inactive'
});
```

### Guild Schedules (Privileged)

```javascript
// Create a scheduled airdrop
const schedule = await client.private.createGuildSchedule('GUILD_ID', {
  ticker: 'RUNES',
  operationType: 'rain',
  channelId: 'CHANNEL_ID',
  amount: '100',
  amountType: 'static',          // optional: 'static' or 'percentage'
  scheduleType: 'cron',          // 'cron' or 'once'
  cronExpression: '0 12 * * *',  // required for cron type
  runAt: null,                   // required for once type (ISO date)
  roleId: 'ROLE_ID',            // optional
  maxRecipients: 50,             // optional
  isPublic: true,                // optional: visible to non-privileged users
});

// Update a schedule
await client.private.updateGuildSchedule('GUILD_ID', 'SCHEDULE_ID', {
  amount: '200',
  active: false,
});

// Delete a schedule
await client.private.deleteGuildSchedule('GUILD_ID', 'SCHEDULE_ID');
```

## Guild Security Management

### Initial Setup

```javascript
// Check if guild security is configured
const status = await client.private.getGuildSecurityStatus('GUILD_ID');
// Returns: { configured, operator, isAuthorized, authSource }

// Claim ownership (first-time setup, must be Discord guild admin)
await client.private.guildSecurityClaim('GUILD_ID', {
  email: 'admin@example.com',
  password: 'secure_password',
});
```

### Session Management

```javascript
// Login
const session = await client.private.guildSecurityLogin('GUILD_ID', {
  password: 'YOUR_PASSWORD',
  ttlMinutes: 30,
});
// Returns: { accessToken, refreshToken, accessExpiresAt, refreshExpiresAt, accessTtlSeconds }

// Manual refresh
const refreshed = await client.private.guildSecurityRefresh('GUILD_ID', {
  refreshToken: session.refreshToken,
  ttlMinutes: 30,
});

// Logout
await client.private.guildSecurityLogout('GUILD_ID');

// Auto-refresh helpers
client.private.guildSecurityStartAutoRefresh('GUILD_ID');
client.private.guildSecurityStopAutoRefresh('GUILD_ID');
client.private.guildSecurityWarmup('GUILD_ID');
```

### Operator Management (Owner only)

```javascript
// List operators
const { operators } = await client.private.getGuildSecurityOperators('GUILD_ID');

// Add an operator
await client.private.addGuildSecurityOperator('GUILD_ID', {
  userId: 'DISCORD_USER_ID',
  password: 'operator_password',
  role: 'operator',  // 'operator' or 'owner'
});

// Remove an operator
await client.private.removeGuildSecurityOperator('GUILD_ID', 'USER_ID');
```

### Role-Based Access (Owner only)

```javascript
// List whitelisted security roles
const roles = await client.private.getGuildSecurityRoles('GUILD_ID');

// Add a Discord role as authorized
await client.private.addGuildSecurityRole('GUILD_ID', { roleId: 'DISCORD_ROLE_ID' });

// Remove a whitelisted role
await client.private.removeGuildSecurityRole('GUILD_ID', 'DISCORD_ROLE_ID');
```

### Password & Email

```javascript
// Change password (requires active session)
await client.private.guildSecurityPassword('GUILD_ID', {
  currentPassword: 'old_password',
  newPassword: 'new_password',
});

// Update recovery email (owner only, sends verification)
await client.private.guildSecurityEmail('GUILD_ID', {
  email: 'new@example.com',
});

// Verify email change
await client.private.guildSecurityEmailVerify('GUILD_ID', {
  token: 'VERIFICATION_TOKEN',
});

// Request password reset (sends email)
await client.private.guildSecurityResetRequest('GUILD_ID', {
  email: 'admin@example.com',
});

// Confirm password reset
await client.private.guildSecurityResetConfirm('GUILD_ID', {
  token: 'RESET_TOKEN',
  newPassword: 'new_password',
});
```

## Socket.IO Events

The client establishes a real-time Socket.IO connection with automatic reconnection and heartbeat.

```javascript
const { socket } = client.socket;

// Wallet balance changes
socket.on('wallets_updated', (wallets) => {
  console.log('Wallets updated:', wallets);
});

// Server heartbeat
socket.on('pong', () => {
  console.log('Server is alive');
});
```

The socket automatically:
- Authenticates via API key on connect
- Joins the private channel (`joinPrivate`)
- Reconnects with exponential backoff on disconnection
- Sends heartbeat pings every 30 seconds

## Guild Security Auto-Refresh

The SDK manages guild security sessions with:

- **Automatic refresh** before token expiry (configurable safety window + jitter)
- **Single-flight refresh** to prevent concurrent refresh requests
- **Exponential backoff** on refresh failures (10s, 20s, 40s... up to 5 min)
- **401 retry** on privileged requests: if a request returns 401, the SDK refreshes the session and retries once
- **Session persistence** via `onSessionUpdate` callback for crash recovery

```javascript
const client = createHermesClient({
  apiUrl: 'https://your-api.com',
  apiKey: 'YOUR_KEY',
  guildSecurity: {
    autoRefresh: true,
    defaultTtlSeconds: 1800,
    onSessionUpdate: (guildId, session) => {
      // Save to file/DB for persistence across restarts
      if (session) {
        saveSession(guildId, session);
      } else {
        deleteSession(guildId);  // null = session cleared (logout)
      }
    },
    // Pre-load saved sessions on startup
    sessions: {
      'GUILD_ID': loadSession('GUILD_ID'),
    },
  },
});
```

## Idempotency

All financial operations (tips, airdrops, withdrawals, gifts, purchases, donations, bulk payouts) support idempotency via the `X-Idempotency-Key` header. If you omit the `idempotencyKey` parameter, a random UUID is generated automatically.

Pass your own key to safely retry operations without double-processing:

```javascript
const myKey = 'payment-2024-01-15-user123';

await client.private.tip({
  ticker: 'RUNES',
  recipientIds: ['user_1'],
  amountPerRecipient: '10',
  idempotencyKey: myKey,
});

// Safe to retry with same key - won't double-tip
await client.private.tip({
  ticker: 'RUNES',
  recipientIds: ['user_1'],
  amountPerRecipient: '10',
  idempotencyKey: myKey,
});
```

## Error Handling

All methods throw an `Error` with the server's error message when a request fails:

```javascript
try {
  await client.private.withdraw({
    ticker: 'RUNES', chainName: 'runebase',
    amount: '999999', address: 'invalid',
  });
} catch (error) {
  console.error(error.message); // e.g. "Insufficient balance"
}
```

## Integration Tests

```bash
# Run all tests
node src/test-integration.mjs

# Run specific tests (comma-separated flags)
node src/test-integration.mjs --wallets --tip --sockets

# Run a single test
node src/test-integration.mjs --guild-tip
```