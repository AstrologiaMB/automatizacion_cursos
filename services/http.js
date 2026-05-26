// services/http.js
// Cliente HTTP y manejo de token para Zoom S2S OAuth (CommonJS)

'use strict';

const axios = require('axios');
const logger = require('../utils/logger');
const { getZoomConfig } = require('./config');

const zoomTokenCache = {
  '1': { access_token: null, expires_at: 0 },
  '2': { access_token: null, expires_at: 0 },
};

function base64(str) {
  return Buffer.from(str, 'utf8').toString('base64');
}

/**
 * Obtiene un access_token para Zoom S2S (Server-to-Server)
 * Usa grant_type=account_credentials y cachea hasta expirar.
 */
async function getZoomAccessToken(accountIndex = '1') {
  const idx = String(accountIndex) === '2' ? '2' : '1';
  const cfg = getZoomConfig(idx);
  const cache = zoomTokenCache[idx];

  if (!cfg.accountId || !cfg.clientId || !cfg.clientSecret) {
    throw new Error(`Faltan credenciales Zoom cuenta ${idx} en .env (ZOOM${idx === '2' ? '2' : ''}_ACCOUNT_ID, etc.)`);
  }

  const now = Date.now();
  if (cache.access_token && cache.expires_at - 10_000 > now) {
    return cache.access_token;
  }

  const url = `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(cfg.accountId)}`;

  try {
    const res = await axios.post(url, null, {
      headers: {
        Authorization: `Basic ${base64(`${cfg.clientId}:${cfg.clientSecret}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: 15000,
    });

    const { access_token, expires_in } = res.data || {};
    if (!access_token) {
      throw new Error(`Respuesta inválida al obtener token Zoom: ${JSON.stringify(res.data)}`);
    }

    cache.access_token = access_token;
    cache.expires_at = Date.now() + Math.max(0, (expires_in || 3500) * 1000);

    logger.info(`[ZOOM] Token S2S obtenido (cuenta ${idx}).`);
    return access_token;
  } catch (err) {
    const msg = err.response
      ? `[${err.response.status}] ${JSON.stringify(err.response.data)}`
      : (err.message || err);
    logger.error(`[ZOOM] Error al obtener token (cuenta ${idx}):`, msg);
    throw err;
  }
}

/**
 * Crea un cliente axios autenticado contra la API de Zoom.
 * Incluye retry básico ante 401 (intenta refrescar token una vez).
 */
async function getZoomAxios(accountIndex = '1') {
  const idx = String(accountIndex) === '2' ? '2' : '1';
  const token = await getZoomAccessToken(idx);

  const instance = axios.create({
    baseURL: 'https://api.zoom.us/v2',
    timeout: 20000,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  // Interceptor para 401: refrescar token una sola vez
  instance.interceptors.response.use(
    (resp) => resp,
    async (error) => {
      const originalRequest = error.config;
      if (error.response && error.response.status === 401 && !originalRequest._retry) {
        originalRequest._retry = true;
        zoomTokenCache[idx].access_token = null;
        zoomTokenCache[idx].expires_at = 0;
        const fresh = await getZoomAccessToken(idx);
        originalRequest.headers.Authorization = `Bearer ${fresh}`;
        return instance(originalRequest);
      }
      return Promise.reject(error);
    }
  );

  return instance;
}

module.exports = {
  getZoomAccessToken,
  getZoomAxios,
};
