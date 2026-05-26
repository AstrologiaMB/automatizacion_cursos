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

// ─────────────────────────────────────────────
// Funciones de administración post-curso
// ─────────────────────────────────────────────

/** Busca un tag por código. Devuelve { id, title } o null (no crea). */
async function findTagByCode({ code }) {
  const client = getFcrmClient();
  const found = await findExistingByTitleOrSlug({
    client,
    path: '/tags',
    title: String(code).trim(),
    slug: normalizeSlug(String(code).trim()),
  });
  return found ? { id: found.id, title: found.title } : null;
}

/** Busca una lista por código. Devuelve { id, title } o null (no crea). */
async function findListByCode({ code }) {
  const client = getFcrmClient();
  const found = await findExistingByTitleOrSlug({
    client,
    path: '/lists',
    title: String(code).trim(),
    slug: normalizeSlug(String(code).trim()),
  });
  return found ? { id: found.id, title: found.title } : null;
}

/** Devuelve los IDs de contactos con un tag dado via bridge PHP (Eloquent directo).
 *  La API REST de FluentCRM no filtra por tag_id correctamente en este servidor. */
async function getContactIdsByTag({ tagId }) {
  const wpClient = require('./learndash').getWpClient();
  const resp = await wpClient.post('/wp-json/mb-bridge/v1/contacts-by-tag', { tag_id: tagId });
  const ids = resp.data?.ids;
  if (!Array.isArray(ids)) throw new Error('[FCRM] Respuesta inesperada del bridge contacts-by-tag');
  logger.info(`[FCRM] Contactos con tag ${tagId}: ${ids.length}`);
  return { ids, total: resp.data.total ?? ids.length };
}

/** Cambia el tag de curso por el tag alumni via bridge PHP, en lotes de 50.
 *  Retorna { updated, failed }. */
async function swapTagOnContacts({ contactIds, removeTagId, addTagId }) {
  const wpClient = require('./learndash').getWpClient();
  const batchSize = 50;
  let totalUpdated = 0;
  let totalFailed = 0;

  for (let i = 0; i < contactIds.length; i += batchSize) {
    const batch = contactIds.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    try {
      const res = await wpClient.post('/wp-json/mb-bridge/v1/swap-contact-tags', {
        contact_ids: batch,
        remove_tag_id: removeTagId,
        add_tag_id: addTagId,
      });
      const updated = res.data?.updated ?? 0;
      const failed = batch.length - updated;
      totalUpdated += updated;
      totalFailed += failed;
      if (failed > 0) {
        logger.warn(`[FCRM] Lote ${batchNum}: ${updated}/${batch.length} actualizados (${failed} fallidos)`);
      } else {
        logger.info(`[FCRM] Lote ${batchNum}: ${updated} contactos actualizados`);
      }
    } catch (e) {
      totalFailed += batch.length;
      logger.warn(`[FCRM] Error en lote ${batchNum}: ${e.message}`);
    }
  }

  logger.info(`[FCRM] Swap total: ${totalUpdated} actualizados, ${totalFailed} fallidos`);
  return { updated: totalUpdated, failed: totalFailed };
}

/** Elimina una lista por ID. */
async function deleteList({ listId }) {
  const client = getFcrmClient();
  await client.delete(`/wp-json/fluent-crm/v2/lists/${listId}`);
  logger.info(`[FCRM] Lista ${listId} eliminada.`);
}

/** Elimina un tag por ID. */
async function deleteTag({ tagId }) {
  const client = getFcrmClient();
  await client.delete(`/wp-json/fluent-crm/v2/tags/${tagId}`);
  logger.info(`[FCRM] Tag ${tagId} eliminado.`);
}

/** Crea una campaña en FluentCRM. Devuelve { id } o null. */
async function createCampaign({ payload }) {
  const client = getFcrmClient();
  try {
    const resp = await client.post('/wp-json/fluent-crm/v2/campaigns', payload);
    const d = resp.data;
    const campaign = d?.campaign || d?.data || d;
    logger.info(`[FCRM] Campaña creada: ID ${campaign.id}`);
    return { id: campaign.id };
  } catch (e) {
    logger.error(`[FCRM] Error creando campaña: ${e.response ? JSON.stringify(e.response.data) : e.message}`);
    throw e;
  }
}

/** Envía una campaña (pasa de borrador a enviada). */
async function sendCampaign({ campaignId }) {
  const client = getFcrmClient();
  // Intentar endpoint /send primero
  try {
    await client.post(`/wp-json/fluent-crm/v2/campaigns/${campaignId}/send`);
    logger.info(`[FCRM] Campaña ${campaignId} enviada (endpoint /send).`);
    return;
  } catch (e) {
    logger.warn(`[FCRM] Endpoint /send falló (${e.response?.status}), intentando cambio de status...`);
  }
  // Fallback: actualizar status a scheduled con envío inmediato
  try {
    await client.put(`/wp-json/fluent-crm/v2/campaigns/${campaignId}`, {
      status: 'scheduled',
      scheduled_at: null,
    });
    logger.info(`[FCRM] Campaña ${campaignId} programada para envío inmediato.`);
  } catch (e2) {
    logger.error(`[FCRM] Error enviando campaña: ${e2.response ? JSON.stringify(e2.response.data) : e2.message}`);
    throw e2;
  }
}

module.exports = {
  getFcrmClient,
  ensureTagFromCode,
  ensureListFromCode,
  normalizeSlug,
  findTagByCode,
  findListByCode,
  getContactIdsByTag,
  swapTagOnContacts,
  deleteList,
  deleteTag,
  createCampaign,
  sendCampaign,
};
