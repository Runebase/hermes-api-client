// src/api.mjs
import axios from 'axios';

export function createApi(config) {
  const api = axios.create({
    baseURL: config.apiUrl,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  async function getWallets() {
    try {
      const response = await api.get('/wallets');
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to fetch wallets');
    }
  }

  return { getWallets };
}