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

  return {
    getOperations,
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

  return {
    getWallets,
  };
}