// services/config.js
// Carga de configuración y defaults del sistema (CommonJS)

'use strict';

// Cargar .env si está disponible (sin requerir que esté instalada la dependencia)
try {
  // eslint-disable-next-line global-require
  require('dotenv').config();
} catch (_) {
  // dotenv no instalado; se ignora silenciosamente
}

const DEFAULT_TIMEZONE = 'America/Argentina/Buenos_Aires';

function getZoomConfig() {
  const {
    ZOOM_ACCOUNT_ID,
    ZOOM_CLIENT_ID,
    ZOOM_CLIENT_SECRET,
    ZOOM_HOST_EMAIL,
    ZOOM_USER_EMAIL,
  } = process.env;

  return {
    accountId: ZOOM_ACCOUNT_ID || '',
    clientId: ZOOM_CLIENT_ID || '',
    clientSecret: ZOOM_CLIENT_SECRET || '',
    hostEmail: ZOOM_HOST_EMAIL || ZOOM_USER_EMAIL || '', // email del usuario host
    defaults: {
      timezone: DEFAULT_TIMEZONE,
      waiting_room: true,
      join_before_host: false,
      mute_upon_entry: true,
      auto_recording: 'none', // 'local' | 'cloud' | 'none'
      // passcode: se enviará como "password" en el payload
    },
  };
}

function getTimezone() {
  return process.env.BASE_TIMEZONE || DEFAULT_TIMEZONE;
}

function getWpConfig() {
  const {
    WP_BASE_URL,
    WP_USER,
    WP_APP_PASSWORD,
  } = process.env;

  const baseUrl = (WP_BASE_URL || '').replace(/\/+$/, '');
  return {
    baseUrl,
    username: WP_USER || '',
    appPassword: (WP_APP_PASSWORD || '').replace(/\s+/g, ''),
    wpApiBase: '/wp-json/wp/v2',
    ldApiBase: '/wp-json/ldlms/v2',
  };
}

function getFcrmConfig() {
  const {
    WP_BASE_URL,
    FLUENTCRM_USER,
    FLUENTCRM_PASS,
    FLUENTCRM_API_USERNAME,
    FLUENTCRM_API_PASSWORD,
  } = process.env;

  const baseUrl = (WP_BASE_URL || '').replace(/\/+$/, '');

  const user = (FLUENTCRM_USER || FLUENTCRM_API_USERNAME || '').trim();
  const passRaw = (FLUENTCRM_PASS || FLUENTCRM_API_PASSWORD || '');
  // Algunas contraseñas (Application Password) incluyen espacios; los removemos para Basic Auth
  const pass = passRaw.replace(/\s+/g, '');

  return {
    baseUrl,
    user,
    pass,
    apiBase: '/wp-json/fluent-crm/v2',
  };
}

function getWooConfig() {
  const {
    WP_BASE_URL,
    WC_CONSUMER_KEY,
    WC_CONSUMER_SECRET,
  } = process.env;

  const url = (WP_BASE_URL || '').replace(/\/+$/, '');

  return {
    url,
    consumerKey: WC_CONSUMER_KEY || '',
    consumerSecret: WC_CONSUMER_SECRET || '',
    apiBase: '/wp-json/wc/v3',
  };
}

module.exports = {
  getZoomConfig,
  getTimezone,
  DEFAULT_TIMEZONE,
  getWpConfig,
  getFcrmConfig,
  getWooConfig,
};
