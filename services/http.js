// services/http.js
// Cliente HTTP y manejo de token para Zoom S2S OAuth (CommonJS)

'use strict';

const axios = require('axios');
const logger = require('../utils/logger');
const { getZoomConfig } = require('./config');

let zoomTokenCache = {
  access_token: null,
  // epoch millis when token expires
  expires_at: 0,
};

function base64(str) {
  return Buffer.from(str, 'utf8').toString('base64');
}

/**
 * Obtiene un access_token para Zoom S2S (Server-to-Server)
 * Usa grant_type=account_credentials y cachea hasta expirar.
 */
async function getZoomAccessToken() {
  const cfg = getZoomConfig();

  if (!cfg.accountId || !cfg.clientId || !cfg.clientSecret) {
    throw new Error('Faltan credenciales Zoom en .env (ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET)');
  }

  const now = Date.now();
  if (zoomTokenCache.access_token && zoomTokenCache.expires_at - 10_000 > now) {
    // token aún válido con 10s de margen
    return zoomTokenCache.access_token;
  }

  const url = `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(
    cfg.accountId
  )}`;

  try {
    const res = await axios.post(
      url,
      null,
      {
        headers: {
          Authorization: `Basic ${base64(`${cfg.clientId}:${cfg.clientSecret}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 15000,
      }
    );

    const { access_token, expires_in } = res.data || {};
    if (!access_token) {
      throw new Error(`Respuesta inválida al obtener token Zoom: ${JSON.stringify(res.data)}`);
    }

    zoomTokenCache.access_token = access_token;
    zoomTokenCache.expires_at = Date.now() + Math.max(0, (expires_in || 3500) * 1000);

    logger.info('[ZOOM] Token S2S obtenido.');
    return access_token;
  } catch (err) {
    const msg = err.response
      ? `[${err.response.status}] ${JSON.stringify(err.response.data)}`
      : (err.message || err);
    logger.error('[ZOOM] Error al obtener token:', msg);
    throw err;
  }
}

/**
 * Crea un cliente axios autenticado contra la API de Zoom.
 * Incluye retry básico ante 401 (intenta refrescar token una vez).
 */
async function getZoomAxios() {
  const token = await getZoomAccessToken();

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
        // Reset cache for token and get a fresh one
        zoomTokenCache.access_token = null;
        zoomTokenCache.expires_at = 0;
        const fresh = await getZoomAccessToken();
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
