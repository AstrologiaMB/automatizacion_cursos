// services/fluentcrm.js
// Integración básica con FluentCRM para crear etiqueta (tag) y lista (list) a partir de tagCurso (CommonJS)

'use strict';

const axios = require('axios');
const logger = require('../utils/logger');
const { getFcrmConfig } = require('./config');

function base64(str) {
  return Buffer.from(str, 'utf8').toString('base64');
}

function hasFcrmCreds(cfg) {
  return Boolean(cfg.baseUrl && cfg.user && cfg.pass);
}

function normalizeSlug(text) {
  if (!text) return '';
  const ascii = String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const slug = ascii
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // no alfanum -> guion
    .replace(/^-+|-+$/g, '')     // recortar guiones extremos
    .replace(/-+/g, '-');        // colapsar guiones
  return slug.slice(0, 190);
}

function getFcrmClient() {
  const cfg = getFcrmConfig();
  if (!hasFcrmCreds(cfg)) {
    throw new Error('Faltan credenciales FluentCRM en .env (FLUENTCRM_USER, FLUENTCRM_PASS, WP_BASE_URL)');
  }
  const auth = base64(`${cfg.user}:${cfg.pass}`);
  return axios.create({
    baseURL: cfg.baseUrl,
    timeout: 20000,
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
      'User-Agent': 'CursosAutomation/1.0',
    },
  });
}

// Utilidad para desenrollar diferentes formatos de respuesta
function unwrapCollection(resp, fallbackKey) {
  if (!resp || !resp.data) return [];
  const d = resp.data;

  // Direct array
  if (Array.isArray(d)) return d;

  // Standard Laravel pagination: { data: [...] }
  if (Array.isArray(d.data)) return d.data;

  // Key-based collection: { tags: [...] } or { tags: { data: [...] } }
  if (fallbackKey && d[fallbackKey]) {
    const k = d[fallbackKey];
    if (Array.isArray(k)) return k;
    if (k.data && Array.isArray(k.data)) return k.data;
  }

  // Fallback: look for any key that contains 'data' or is an array
  const val = Object.values(d)[0];
  if (val && Array.isArray(val.data)) return val.data;

  return [];
}

function unwrapSingle(resp, fallbackKey) {
  if (!resp || !resp.data) return null;
  const d = resp.data;

  // Standard: { data: {...} }
  if (d.data && typeof d.data === 'object' && !Array.isArray(d.data)) return d.data;

  // Explicit key: { tag: {...} } or { list: {...} }
  if (d.tag) return d.tag;
  if (d.list) return d.list;
  if (d.item) return d.item; // V2 often uses 'item'

  // Fallback by key
  if (fallbackKey && d[fallbackKey]) return d[fallbackKey];

  return d;
}

async function findExistingByTitleOrSlug({ client, path, title, slug }) {
  try {
    const search = slug || title;
    const resp = await client.get(`/wp-json/fluent-crm/v2${path}`, {
      params: { search },
    });
    const arr = unwrapCollection(resp, path.replace(/^\//, ''));
    const normTitle = String(title).trim().toLowerCase();
    const normSlug = String(slug).trim().toLowerCase();
    const hit = arr.find((item) => {
      const itTitle = (item.title || item.name || '').trim().toLowerCase();
      const itSlug = (item.slug || '').trim().toLowerCase();
      return itSlug === normSlug || itTitle === normTitle;
    });
    return hit || null;
  } catch (e) {
    logger.warn(`[FCRM] No se pudo buscar en ${path}: ${e.response?.status || e.message}`);
    return null;
  }
}

async function ensureEntity({ path, payload, type }) {
  const client = getFcrmClient();
  const title = payload.title;
  const slug = payload.slug || normalizeSlug(title);

  // Buscar existente
  const found = await findExistingByTitleOrSlug({ client, path, title, slug });
  if (found && found.id) {
    logger.info(`[FCRM] ${type} ya existe (ID=${found.id}).`);
    return { id: found.id, wasCreated: false, wasUpdated: false };
  }

  // Crear
  try {
    const resp = await client.post(`/wp-json/fluent-crm/v2${path}`, { ...payload, slug });
    const obj = unwrapSingle(resp);
    const id = obj?.id;
    logger.info(`[FCRM] ${type} creado (ID=${id}).`);
    return { id, wasCreated: true, wasUpdated: false };
  } catch (e) {
    const code = e.response?.status;
    logger.error(`[FCRM] Error creando ${type}: ${code || ''} ${e.response?.data?.message || e.message}`);
    throw e;
  }
}

/**
 * Crea (idempotente) etiqueta en FluentCRM con título = code (ej. "AD0825")
 * Slug normalizado (ej. "ad0825") para evitar duplicados por mayúsculas/acentos.
 */
async function ensureTagFromCode({ code }) {
  const title = String(code || '').trim();
  if (!title) throw new Error('[FCRM] Código de tag vacío.');
  const slug = normalizeSlug(title);
  return ensureEntity({
    path: '/tags',
    payload: { title, slug },
    type: 'Tag',
  });
}

/**
 * Crea (idempotente) lista en FluentCRM con título = code (ej. "AD0825")
 * Slug normalizado (ej. "ad0825") para consistencia.
 */
async function ensureListFromCode({ code }) {
  const title = String(code || '').trim();
  if (!title) throw new Error('[FCRM] Código de lista vacío.');
  const slug = normalizeSlug(title);
  return ensureEntity({
    path: '/lists',
    payload: { title, slug },
    type: 'Lista',
  });
}

module.exports = {
  getFcrmClient,
  ensureTagFromCode,
  ensureListFromCode,
  normalizeSlug,
};
