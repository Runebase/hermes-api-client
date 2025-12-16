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
      if (categoryId) {params.categoryId = categoryId;}
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
  }) {
    try {
      const response = await api.post('/api/airdrop/partydrop', {
        ticker,
        amount,
        channelId,
        duration, // duration in milli-seconds    
        roleId,
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
  }) {
    try {
      const payload = {
        ticker,
        amount,
        channelId,
        duration,
        roleId,
      };
      if (categoryId) {payload.categoryId = categoryId;}
      if (questionId) {payload.questionId = questionId;}

      const response = await api.post('/api/airdrop/trivia', payload);
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to initiate trivia drop');
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

  async function guildFlood(guildId, { 
    ticker,
    amount,
    maxRecipients,
    channelId,
    roleId,
  }) {
    try {
      const response = await api.post(`/api/guilds/${guildId}/airdrop/flood`, {
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
      const response = await api.post(`/api/guilds/${guildId}/airdrop/rain`, {
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
      const response = await api.post(`/api/guilds/${guildId}/airdrop/soak`, {
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
  }) {
    try {
      const response = await api.post(`/api/guilds/${guildId}/airdrop/reactdrop`, {
        ticker,
        amount,
        channelId,
        duration, // duration in milli-seconds
        emoji,        
        roleId,
        captcha,
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
  }) {
    try {
      const response = await api.post(`/api/guilds/${guildId}/airdrop/partydrop`, {
        ticker,
        amount,
        channelId,
        duration, // duration in milli-seconds    
        roleId,
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
  }) {
    try {
      const payload = {
        ticker,
        amount,
        channelId,
        duration,
        roleId,
      };
      if (categoryId) {payload.categoryId = categoryId;}
      if (questionId) {payload.questionId = questionId;}

      const response = await api.post(`/api/guilds/${guildId}/airdrop/trivia`, payload);
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
      const response = await api.post(`/api/guilds/${guildId}/airdrop/wave`, {
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
      const response = await api.post(`/api/guilds/${guildId}/airdrop/sleet`, {
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

  return {
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
    guildTip,
    guildFlood,
    guildRain,
    guildSoak,
    guildSleet,
    guildWave,
    guildReactdrop,
    guildPartydrop,
    guildTrivia,
  };
}