// v2/services/http.js
// Cliente HTTP y manejo de token para Zoom S2S OAuth (Multi-Cuenta)

'use strict';

const axios = require('axios');
const logger = require('../../utils/logger');

// Mapeo dinamico para mantener tokens en cache por accountId
// zoomTokenCache = { "accountIdABC_xyz": { access_token: "...", expires_at: 1234 } }
let zoomTokenCache = {};

function base64(str) {
    return Buffer.from(str, 'utf8').toString('base64');
}

/**
 * Obtiene un access_token para Zoom S2S
 */
async function getZoomAccessToken(credentials) {
    if (!credentials || !credentials.accountId || !credentials.clientId || !credentials.clientSecret) {
        throw new Error('Faltan credenciales inyectadas de Zoom (accountId, clientId, clientSecret)');
    }

    const cacheKey = credentials.accountId;
    const now = Date.now();
    const cached = zoomTokenCache[cacheKey];

    if (cached && cached.access_token && cached.expires_at - 10000 > now) {
        return cached.access_token;
    }

    const url = `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(
        credentials.accountId
    )}`;

    try {
        const res = await axios.post(
            url,
            null,
            {
                headers: {
                    Authorization: `Basic ${base64(`${credentials.clientId}:${credentials.clientSecret}`)}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                timeout: 15000,
            }
        );

        const { access_token, expires_in } = res.data || {};
        if (!access_token) {
            throw new Error(`Respuesta inválida al obtener token Zoom: ${JSON.stringify(res.data)}`);
        }

        zoomTokenCache[cacheKey] = {
            access_token,
            expires_at: now + Math.max(0, (expires_in || 3500) * 1000)
        };

        logger.info(`[ZOOM] Token S2S obtenido para cuenta: ${cacheKey}`);
        return access_token;
    } catch (err) {
        const msg = err.response
            ? `[${err.response.status}] ${JSON.stringify(err.response.data)}`
            : (err.message || err);
        logger.error(`[ZOOM] Error al obtener token para ${cacheKey}:`, msg);
        throw err;
    }
}

/**
 * Crea un cliente axios autenticado interceptor.
 */
async function getZoomAxios(credentials) {
    const token = await getZoomAccessToken(credentials);

    const instance = axios.create({
        baseURL: 'https://api.zoom.us/v2',
        timeout: 20000,
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
    });

    // Interceptor para 401
    instance.interceptors.response.use(
        (resp) => resp,
        async (error) => {
            const originalRequest = error.config;
            if (error.response && error.response.status === 401 && !originalRequest._retry) {
                originalRequest._retry = true;
                // Limpiamos cache y reintentamos
                const cacheKey = credentials.accountId;
                zoomTokenCache[cacheKey] = { access_token: null, expires_at: 0 };
                const fresh = await getZoomAccessToken(credentials);
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
