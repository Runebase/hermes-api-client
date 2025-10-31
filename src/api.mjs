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

  return {
    getOperations,
    getCoins,
    getGuildWallets,
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
    durationMs = 300000,
    emoji,    
    roleId,
  }) {
    try {
      const response = await api.post('/api/airdrop/reactdrop', {
        ticker,
        amount,
        channelId,
        durationMs,
        emoji,        
        roleId,
      });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to initiate reactdrop');
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
      throw new Error(error.response?.data?.error || 'Failed to initiate flood');
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
      throw new Error(error.response?.data?.error || 'Failed to initiate flood');
    }
  }

  async function guildTip(guildId, { ticker, recipientIds, amountPerRecipient, notifyChannelId }) {
    try {
      const response = await api.post(`/api/guilds/${guildId}/tip`, {
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

  return {
    getWallets,
    tip,
    reactdrop,
    flood,
    rain,
    soak,
    guildTip,
  };
}