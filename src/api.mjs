// src/api.mjs
import axios from 'axios';

export function createPublicApi(config) {
  const api = axios.create({
    baseURL: config.apiUrl,
    headers: {
      'Content-Type': 'application/json',
      // No Authorization for public
    },
  });

  async function health() {
    try {
      const response = await api.get('/api/health');
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Health check failed');
    }
  }

  // Example public endpoint function (adjust as needed)
  async function getOperations() {
    try {
      const response = await api.get('/api/operations');
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to fetch public info');
    }
  }

  // Example public endpoint function (adjust as needed)
  async function getCoins() {
    try {
      const response = await api.get('/api/coins');
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to fetch public info');
    }
  }

  async function getGuildWallets(guildId) {
    try {
      const response = await api.get(`/api/guilds/${guildId}/wallets`); // Prefix if needed
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to fetch wallets');
    }
  }

  async function getTriviaCategories({ page = 1, pageSize = 25 } = {}) {
    try {
      const response = await api.get('/api/trivia/categories', { params: { page, pageSize } });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to fetch trivia categories');
    }
  }

  async function getTriviaQuestions({ categoryId, page = 1, pageSize = 25 } = {}) {
    try {
      const params = { page, pageSize };
      if (categoryId) {
        params.categoryId = categoryId;
      }
      const response = await api.get('/api/trivia/questions', { params });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to fetch trivia questions');
    }
  }

  async function getTriviaQuestionById(id) {
    try {
      const response = await api.get(`/api/trivia/questions/${id}`);
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to fetch trivia question');
    }
  }

  return {
    health,
    getOperations,
    getCoins,
    getGuildWallets,
    getTriviaCategories,
    getTriviaQuestions,
    getTriviaQuestionById,
  };
}

export function createPrivateApi(config) {
  const api = axios.create({
    baseURL: config.apiUrl,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  // ---- Guild Security Session Management ----

  const guildSessions = new Map(Object.entries(config.guildSecurity?.sessions || {}));
  const guildAutoRefresh = config.guildSecurity?.autoRefresh !== false;
  const defaultGuildTtlSeconds = config.guildSecurity?.defaultTtlSeconds || null;
  const onGuildSessionUpdate = config.guildSecurity?.onSessionUpdate || null;

  // Timers & single-flight refresh protection
  const refreshTimers = new Map();       // guildId -> Timeout
  const refreshInflight = new Map();     // guildId -> Promise
  const refreshBackoff = new Map();      // guildId -> { attempt, nextDelayMs }

  const now = () => Date.now();

  const getGuildSession = (guildId) => guildSessions.get(guildId) || null;

  const clearRefreshTimer = (guildId) => {
    const t = refreshTimers.get(guildId);
    if (t) {
      clearTimeout(t);
    }
    refreshTimers.delete(guildId);
  };

  const computeTtlSeconds = (session) => {
    const ttl = Number(session?.accessTtlSeconds || session?.ttlSeconds || defaultGuildTtlSeconds || 0);
    return Number.isFinite(ttl) && ttl > 0 ? ttl : null;
  };

  const computeExpiresAtMs = (session) => {
    // Prefer explicit expiresAtMs if present
    if (session?.expiresAtMs && Number.isFinite(session.expiresAtMs)) {
      return session.expiresAtMs;
    }

    const ttlSeconds = computeTtlSeconds(session);
    if (!ttlSeconds) {
      return null;
    }

    const issuedAtMs = Number(session?.issuedAtMs || session?.lastRefreshAtMs || now());
    return issuedAtMs + ttlSeconds * 1000;
  };

  /**
   * Refresh scheduling rules:
   * - Always refresh before expiry (safety window + jitter)
   * - If TTL > 1h, also cap refresh cadence ~ every 30 min (keep session "warm")
   * - If no expiry info, fallback to 25 min schedule (plus jitter)
   */
  const computeNextRefreshDelayMs = (session) => {
    const ttlSeconds = computeTtlSeconds(session);
    const expiresAtMs = computeExpiresAtMs(session);

    const jitterMs = Math.floor(Math.random() * 15_000); // 0-15s
    const minDelayMs = 5_000;

    // If no TTL/expiry known, do a safe periodic refresh (25 min)
    if (!ttlSeconds || !expiresAtMs) {
      const fallbackMs = 25 * 60_000;
      return Math.max(minDelayMs, fallbackMs + jitterMs);
    }

    const ttlMs = ttlSeconds * 1000;

    // Safety window depends on TTL
    let safetyMs = 60_000; // default 60s
    if (ttlMs <= 2 * 60_000) {
      safetyMs = Math.floor(ttlMs * 0.4); // refresh around 60% mark
    } else if (ttlMs <= 30 * 60_000) {
      safetyMs = 90_000;           // 90s
    } else {
      safetyMs = 3 * 60_000;       // 3 min
    }

    // Primary target: before expiry
    const refreshBeforeExpiryAtMs = expiresAtMs - safetyMs - jitterMs;
    const delayToExpiryTarget = refreshBeforeExpiryAtMs - now();

    // Secondary target: keep warm if TTL > 1 hour (refresh about every 30 minutes)
    if (ttlMs > 60 * 60_000) {
      const lastRefreshAtMs = Number(session?.lastRefreshAtMs || session?.issuedAtMs || now());
      const warmCadenceMs = 30 * 60_000 + jitterMs;
      const warmTargetAtMs = lastRefreshAtMs + warmCadenceMs;
      const delayToWarmTarget = warmTargetAtMs - now();

      // Pick the earlier refresh
      const chosen = Math.min(delayToExpiryTarget, delayToWarmTarget);
      return Math.max(minDelayMs, chosen);
    }

    return Math.max(minDelayMs, delayToExpiryTarget);
  };

  const scheduleGuildRefresh = (guildId) => {
    clearRefreshTimer(guildId);

    if (!guildAutoRefresh) {
      return;
    }

    const session = getGuildSession(guildId);
    if (!session?.refreshToken) {
      return;
    }

    const delayMs = computeNextRefreshDelayMs(session);
    if (!delayMs) {
      return;
    }

    const timer = setTimeout(() => {
      void ensureFreshGuildSession(guildId, { reason: 'timer' });
    }, delayMs);

    refreshTimers.set(guildId, timer);
  };

  const setGuildSession = (guildId, session) => {
    if (!guildId || !session) {
      return;
    }

    const ttlSeconds = computeTtlSeconds(session);
    const issuedAtMs = Number(session?.issuedAtMs || now());
    const lastRefreshAtMs = Number(session?.lastRefreshAtMs || now());

    const normalized = {
      ...session,
      accessTtlSeconds: session?.accessTtlSeconds ?? ttlSeconds ?? session?.accessTtlSeconds,
      issuedAtMs,
      lastRefreshAtMs,
      refreshCount: Number(session?.refreshCount || 0),
    };

    // Derive expiresAtMs if possible
    const expiresAtMs = computeExpiresAtMs(normalized);
    if (expiresAtMs) {
      normalized.expiresAtMs = expiresAtMs;
    }

    guildSessions.set(guildId, normalized);

    if (typeof onGuildSessionUpdate === 'function') {
      onGuildSessionUpdate(guildId, normalized);
    }

    scheduleGuildRefresh(guildId);
  };

  const clearGuildSession = (guildId) => {
    clearRefreshTimer(guildId);
    refreshInflight.delete(guildId);
    refreshBackoff.delete(guildId);
    guildSessions.delete(guildId);

    if (typeof onGuildSessionUpdate === 'function') {
      onGuildSessionUpdate(guildId, null);
    }
  };

  const buildGuildHeaders = (guildId) => {
    const session = getGuildSession(guildId);
    if (!session?.accessToken) {
      return {};
    }
    return { 'X-Guild-Authorization': `Bearer ${session.accessToken}` };
  };

  /**
   * Ensure the guild session is fresh enough.
   * - If access token still valid with buffer, do nothing.
   * - Otherwise refresh (single-flight).
   * - On refresh fail, schedule backoff retry (soft), but do not spam.
   */
  const ensureFreshGuildSession = async (guildId, { reason = 'unknown', force = false } = {}) => {
    const current = getGuildSession(guildId);
    if (!current?.refreshToken) {
      return null;
    }

    // If not forced, skip refresh if we still have enough time left
    if (!force) {
      const expiresAtMs = computeExpiresAtMs(current);
      if (expiresAtMs) {
        const bufferMs = 30_000; // if >= 30s left, don't refresh yet
        if (expiresAtMs - now() > bufferMs) {
          // still schedule next refresh in case timing changed
          scheduleGuildRefresh(guildId);
          return current;
        }
      }
    }

    // Single-flight refresh
    if (refreshInflight.has(guildId)) {
      return refreshInflight.get(guildId);
    }

    const p = (async () => {
      try {
        const ttlSeconds = computeTtlSeconds(current);
        const refreshed = await guildSecurityRefresh(guildId, {
          refreshToken: current.refreshToken,
          ttlSeconds: current.accessTtlSeconds || ttlSeconds || defaultGuildTtlSeconds,
        });

        // Normalize and keep some counters/timestamps
        const prev = getGuildSession(guildId) || current;
        const nextSession = {
          ...refreshed,
          issuedAtMs: prev?.issuedAtMs || now(),
          lastRefreshAtMs: now(),
          refreshCount: Number(prev?.refreshCount || 0) + 1,
          accessTtlSeconds: refreshed?.accessTtlSeconds ?? prev?.accessTtlSeconds ?? ttlSeconds ?? defaultGuildTtlSeconds,
        };
        // setGuildSession will schedule the next refresh
        setGuildSession(guildId, nextSession);

        // Reset backoff on success
        refreshBackoff.delete(guildId);

        return nextSession;
      } catch (e) {
        // Soft backoff scheduling (only if autoRefresh enabled)
        if (guildAutoRefresh) {
          const prev = refreshBackoff.get(guildId) || { attempt: 0, nextDelayMs: 10_000 };
          const attempt = Math.min(prev.attempt + 1, 5);
          const nextDelayMs = Math.min(prev.nextDelayMs * 2, 5 * 60_000); // cap 5 min
          refreshBackoff.set(guildId, { attempt, nextDelayMs });

          clearRefreshTimer(guildId);
          const t = setTimeout(() => {
            void ensureFreshGuildSession(guildId, { reason: `backoff:${reason}` });
          }, prev.nextDelayMs + Math.floor(Math.random() * 5_000)); // add small jitter
          refreshTimers.set(guildId, t);
        }

        throw e;
      } finally {
        refreshInflight.delete(guildId);
      }
    })();

    refreshInflight.set(guildId, p);
    return p;
  };

  /**
   * Wrapper for guild requests:
   * - Inject X-Guild-Authorization
   * - On 401, attempt refresh (single-flight) and retry once
   */
  const guildRequest = async (guildId, requestFn, { allowRefresh = true } = {}) => {
    const headers = buildGuildHeaders(guildId);

    try {
      return await requestFn(headers);
    } catch (error) {
      const status = error?.response?.status;
      const session = getGuildSession(guildId);

      if (!allowRefresh || !guildAutoRefresh || status !== 401 || !session?.refreshToken) {
        throw error;
      }

      const refreshed = await ensureFreshGuildSession(guildId, { reason: '401', force: true });
      if (!refreshed?.accessToken) {
        throw error;
      }

      const retryHeaders = { 'X-Guild-Authorization': `Bearer ${refreshed.accessToken}` };
      return await requestFn(retryHeaders);
    }
  };

  const guildPost = (guildId, url, body) =>
    guildRequest(guildId, (headers) => api.post(url, body, { headers }));

  async function guildSecurityLogin(guildId, { password, ttlSeconds, ttlMinutes } = {}) {
    try {
      const response = await api.post(`/api/guilds/${guildId}/security/login`, {
        password,
        ttlSeconds,
        ttlMinutes,
      });

      // Store with timestamps
      setGuildSession(guildId, {
        ...response.data,
        issuedAtMs: now(),
        lastRefreshAtMs: now(),
        refreshCount: 0,
      });

      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to login to guild security');
    }
  }

  async function guildSecurityRefresh(guildId, { refreshToken, ttlSeconds, ttlMinutes } = {}) {
    try {
      const response = await api.post(`/api/guilds/${guildId}/security/refresh`, {
        refreshToken,
        ttlSeconds,
        ttlMinutes,
      });

      // Do NOT set session here directly with setGuildSession(), because ensureFreshGuildSession
      // wraps the response to preserve counters/timestamps. But if guildSecurityRefresh is called
      // directly by the user, we should still store it.
      //
      // If ensureFreshGuildSession called this, it will override shortly after.
      setGuildSession(guildId, {
        ...response.data,
        issuedAtMs: now(),
        lastRefreshAtMs: now(),
      });

      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to refresh guild security session');
    }
  }

  async function guildSecurityLogout(guildId) {
    try {
      const session = getGuildSession(guildId);
      await api.post(`/api/guilds/${guildId}/security/logout`, {
        accessToken: session?.accessToken,
        refreshToken: session?.refreshToken,
      });

      clearGuildSession(guildId);
      return true;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to logout guild security session');
    }
  }

  // Optional helpers to control auto-refresh externally
  function guildSecurityStartAutoRefresh(guildId) {
    scheduleGuildRefresh(guildId);
    return true;
  }

  function guildSecurityStopAutoRefresh(guildId) {
    clearRefreshTimer(guildId);
    return true;
  }

  async function guildSecurityWarmup(guildId) {
    // Force refresh if near expiry; otherwise reschedule next refresh.
    return await ensureFreshGuildSession(guildId, { reason: 'warmup', force: false });
  }

  // ---- Normal Private Endpoints ----

  async function getWallets() {
    try {
      const response = await api.get('/api/wallets'); // Prefix if needed
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to fetch wallets');
    }
  }

  async function tip({ ticker, recipientIds, amountPerRecipient, notifyChannelId }) {
    try {
      const response = await api.post('/api/tip', {
        ticker,
        recipientIds,
        amountPerRecipient,
        notifyChannelId,
      });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to send tip');
    }
  }

  async function reactdrop({
    ticker,
    amount,
    channelId,
    duration = 300000,
    emoji,
    roleId,
    captcha = 'math', // 'math', 'none' or 'trivia'
    maxRecipients = '2000'
  }) {
    try {
      const response = await api.post('/api/airdrop/reactdrop', {
        ticker,
        amount,
        channelId,
        duration, // duration in milli-seconds
        emoji,
        roleId,
        captcha,
        maxRecipients,
      });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to initiate reactdrop');
    }
  }

  async function partydrop({
    ticker,
    amount,
    channelId,
    duration = 300000,
    roleId,
    maxRecipients = '2000'
  }) {
    try {
      const response = await api.post('/api/airdrop/partydrop', {
        ticker,
        amount,
        channelId,
        duration, // duration in milli-seconds
        roleId,
        maxRecipients,
      });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to initiate partydrop');
    }
  }

  async function flood({
    ticker,
    amount,
    maxRecipients,
    channelId,
    roleId,
  }) {
    try {
      const response = await api.post('/api/airdrop/flood', {
        ticker,
        amount,
        maxRecipients,
        channelId,
        roleId,
      });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to initiate flood');
    }
  }

  async function rain({
    ticker,
    amount,
    maxRecipients,
    channelId,
    roleId,
  }) {
    try {
      const response = await api.post('/api/airdrop/rain', {
        ticker,
        amount,
        maxRecipients,
        channelId,
        roleId,
      });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to initiate rain');
    }
  }

  async function soak({
    ticker,
    amount,
    maxRecipients,
    channelId,
    roleId,
  }) {
    try {
      const response = await api.post('/api/airdrop/soak', {
        ticker,
        amount,
        maxRecipients,
        channelId,
        roleId,
      });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to initiate soak');
    }
  }

  async function wave({
    ticker,
    amount,
    maxRecipients,
    channelId,
    roleId,
  }) {
    try {
      const response = await api.post('/api/airdrop/wave', {
        ticker,
        amount,
        maxRecipients,
        channelId,
        roleId,
      });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to initiate wave');
    }
  }

  async function trivia({
    ticker,
    amount,
    channelId,
    duration = 300000,
    roleId,
    categoryId,     // optional UUID
    questionId,     // optional UUID
    maxRecipients = '2000',
  }) {
    try {
      const payload = {
        ticker,
        amount,
        channelId,
        duration,
        roleId,
        maxRecipients,
      };
      if (categoryId) {
        payload.categoryId = categoryId;
      }
      if (questionId) {
        payload.questionId = questionId;
      }

      const response = await api.post('/api/airdrop/trivia', payload);
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to initiate trivia drop');
    }
  }

  // ---- Guild Privileged Endpoints (with X-Guild-Authorization) ----

  async function guildTip(guildId, { ticker, recipientIds, amountPerRecipient, notifyChannelId }) {
    try {
      const response = await guildPost(guildId, `/api/guilds/${guildId}/tip`, {
        ticker,
        recipientIds,
        amountPerRecipient,
        notifyChannelId,
      });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to send guild tip');
    }
  }

  async function guildFlood(guildId, {
    ticker,
    amount,
    maxRecipients,
    channelId,
    roleId,
  }) {
    try {
      const response = await guildPost(guildId, `/api/guilds/${guildId}/airdrop/flood`, {
        ticker,
        amount,
        maxRecipients,
        channelId,
        roleId,
      });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to initiate guild flood');
    }
  }

  async function guildRain(guildId, {
    ticker,
    amount,
    maxRecipients,
    channelId,
    roleId,
  }) {
    try {
      const response = await guildPost(guildId, `/api/guilds/${guildId}/airdrop/rain`, {
        ticker,
        amount,
        maxRecipients,
        channelId,
        roleId,
      });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to initiate guild rain');
    }
  }

  async function guildSoak(guildId, {
    ticker,
    amount,
    maxRecipients,
    channelId,
    roleId,
  }) {
    try {
      const response = await guildPost(guildId, `/api/guilds/${guildId}/airdrop/soak`, {
        ticker,
        amount,
        maxRecipients,
        channelId,
        roleId,
      });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to initiate guild soak');
    }
  }

  async function guildReactdrop(guildId, {
    ticker,
    amount,
    channelId,
    duration = 300000,
    emoji,
    roleId,
    captcha = 'math', // 'math', 'none' or 'trivia'
    maxRecipients = '2000',
  }) {
    try {
      const response = await guildPost(guildId, `/api/guilds/${guildId}/airdrop/reactdrop`, {
        ticker,
        amount,
        channelId,
        duration, // duration in milli-seconds
        emoji,
        roleId,
        captcha,
        maxRecipients,
      });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to initiate guild reactdrop');
    }
  }

  async function guildPartydrop(guildId, {
    ticker,
    amount,
    channelId,
    duration = 300000,
    roleId,
    maxRecipients = '2000',
  }) {
    try {
      const response = await guildPost(guildId, `/api/guilds/${guildId}/airdrop/partydrop`, {
        ticker,
        amount,
        channelId,
        duration, // duration in milli-seconds
        roleId,
        maxRecipients,
      });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to initiate guild partydrop');
    }
  }

  async function guildTrivia(guildId, {
    ticker,
    amount,
    channelId,
    duration = 300000,
    roleId,
    categoryId,
    questionId,
    maxRecipients = '2000',
  }) {
    try {
      const payload = {
        ticker,
        amount,
        channelId,
        duration,
        roleId,
        maxRecipients,
      };
      if (categoryId) {
        payload.categoryId = categoryId;
      }
      if (questionId) {
        payload.questionId = questionId;
      }

      const response = await guildPost(guildId, `/api/guilds/${guildId}/airdrop/trivia`, payload);
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to initiate guild trivia drop');
    }
  }

  async function guildWave(guildId, {
    ticker,
    amount,
    maxRecipients,
    channelId,
    roleId,
  }) {
    try {
      const response = await guildPost(guildId, `/api/guilds/${guildId}/airdrop/wave`, {
        ticker,
        amount,
        maxRecipients,
        channelId,
        roleId,
      });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to initiate guild wave');
    }
  }

  async function sleet({
    ticker,
    amount,
    channelId,
    roleId,
    maxRecipients = 400,
    duration = 900000, // 15 minutes default (matches backend)
  }) {
    try {
      const response = await api.post('/api/airdrop/sleet', {
        ticker,
        amount,
        channelId,
        roleId,
        maxRecipients,
        duration,
      });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to initiate sleet');
    }
  }

  async function guildSleet(guildId, {
    ticker,
    amount,
    channelId,
    roleId,
    maxRecipients = 400,
    duration = 900000,
  }) {
    try {
      const response = await guildPost(guildId, `/api/guilds/${guildId}/airdrop/sleet`, {
        ticker,
        amount,
        channelId,
        roleId,
        maxRecipients: String(maxRecipients),
        duration,
      });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to initiate guild sleet');
    }
  }

  // ---- Bulk Payout Endpoints (User) ----

  async function bulkPayout({ memo, notifyChannelId, payouts }) {
    try {
      const response = await api.post('/api/bulk-payout', {
        memo,
        notifyChannelId,
        payouts,
      });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to create bulk payout');
    }
  }

  async function getBulkPayouts({ page = 1, limit = 10 } = {}) {
    try {
      const response = await api.get('/api/bulk-payout', { params: { page, limit } });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to fetch bulk payouts');
    }
  }

  async function getBulkPayoutById(id) {
    try {
      const response = await api.get(`/api/bulk-payout/${id}`);
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to fetch bulk payout');
    }
  }

  // ---- Bulk Payout Endpoints (Guild) ----

  async function guildBulkPayout(guildId, { memo, notifyChannelId, payouts }) {
    try {
      const response = await guildPost(guildId, `/api/guilds/${guildId}/bulk-payout`, {
        memo,
        notifyChannelId,
        payouts,
      });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to create guild bulk payout');
    }
  }

  async function getGuildBulkPayouts(guildId, { page = 1, limit = 10 } = {}) {
    try {
      const response = await guildRequest(guildId, (headers) =>
        api.get(`/api/guilds/${guildId}/bulk-payouts`, { params: { page, limit }, headers })
      );
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to fetch guild bulk payouts');
    }
  }

  async function getGuildBulkPayoutById(guildId, id) {
    try {
      const response = await guildRequest(guildId, (headers) =>
        api.get(`/api/guilds/${guildId}/bulk-payouts/${id}`, { headers })
      );
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to fetch guild bulk payout');
    }
  }

  return {
    // regular private
    getWallets,
    tip,
    reactdrop,
    trivia,
    partydrop,
    flood,
    rain,
    soak,
    sleet,
    wave,

    // bulk payout (user)
    bulkPayout,
    getBulkPayouts,
    getBulkPayoutById,

    // guild private
    guildTip,
    guildFlood,
    guildRain,
    guildSoak,
    guildSleet,
    guildWave,
    guildReactdrop,
    guildPartydrop,
    guildTrivia,

    // guild bulk payout
    guildBulkPayout,
    getGuildBulkPayouts,
    getGuildBulkPayoutById,

    // guild security
    guildSecurityLogin,
    guildSecurityRefresh,
    guildSecurityLogout,

    // optional helpers
    guildSecurityStartAutoRefresh,
    guildSecurityStopAutoRefresh,
    guildSecurityWarmup,
  };
}
