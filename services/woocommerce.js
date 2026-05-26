'use strict';

/**
 * WooCommerce integration (CommonJS)
 * - Identify product ONLY by SKU = first 2 letters of tagCurso + 'zoom'
 *   - Case-insensitive on the 2-letter prefix: try ADzoom and adzoom (zoom in lowercase)
 *   - If not found, ABORT WooCommerce module and notify
 * - Update ONLY:
 *   - name: exactly input.nombreProducto
 *   - images: single primary image (URL src or uploaded media ID)
 *   - FluentCRM integration meta in product:
 *     * Purchase/Add tags: ensure 'p$' and new tagCurso; remove only old tagCurso if present; keep others intact
 *     * Refund/Remove tags: ensure new tagCurso; remove old tagCurso if present; keep others intact
 * - Preserve slug, price, descriptions, categories, and any other meta/taxonomies
 * - Dry-run supported via env DRY_RUN=true
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const logger = require('../utils/logger');
const { getWpConfig, getFcrmConfig } = require('./config');
const { getFcrmClient, ensureTagFromCode } = require('./fluentcrm');

function base64(str) {
  return Buffer.from(str, 'utf8').toString('base64');
}

function getWcConfig() {
  const { WP_BASE_URL, WC_CONSUMER_KEY, WC_CONSUMER_SECRET } = process.env;
  const baseUrl = (WP_BASE_URL || '').replace(/\/+$/, '');
  return {
    baseUrl,
    consumerKey: WC_CONSUMER_KEY || '',
    consumerSecret: WC_CONSUMER_SECRET || '',
    apiBase: '/wp-json/wc/v3',
  };
}

function hasWcCreds(wc) {
  return Boolean(wc.baseUrl && wc.consumerKey && wc.consumerSecret);
}

function buildWcAxios() {
  const wc = getWcConfig();
  if (!hasWcCreds(wc)) {
    throw new Error('Faltan credenciales WooCommerce (.env: WP_BASE_URL, WC_CONSUMER_KEY, WC_CONSUMER_SECRET)');
  }
  const credentials = `${wc.consumerKey}:${wc.consumerSecret}`;
  const encoded = base64(credentials);
  return axios.create({
    baseURL: wc.baseUrl + wc.apiBase,
    timeout: 20000,
    headers: {
      Authorization: `Basic ${encoded}`,
      'Content-Type': 'application/json',
      'User-Agent': 'WooCommerceAutomation/1.0',
    },
    paramsSerializer: {
      indexes: null,
    },
  });
}

function computeSkuCandidates(tagCurso) {
  const t = String(tagCurso || '').trim();
  if (!t || t.length < 2) return [];
  const match = t.match(/^([A-Za-z]+)/);
  const prefix = match ? match[1] : t.slice(0, 2);
  return [`${prefix.toUpperCase()}zoom`, `${prefix.toLowerCase()}zoom`];
}

async function getProductBySkuCandidates({ client, candidates }) {
  for (const sku of candidates) {
    try {
      const resp = await client.get('/products', { params: { sku, per_page: 10 } });
      const arr = Array.isArray(resp.data) ? resp.data : [];
      if (arr.length > 0) {
        const product = arr[0];
        logger.info('[WC] Producto encontrado por SKU:', sku, `ID=${product.id}`);
        return product;
      }
    } catch (e) {
      logger.warn('[WC] Búsqueda por SKU falló:', sku, e.response?.status || e.message);
    }
  }
  return null;
}

async function getProductFull({ client, id }) {
  try {
    const resp = await client.get(`/products/${id}`, { params: { context: 'edit' } });
    return resp.data;
  } catch (e) {
    logger.error('[WC] Error obteniendo producto completo:', e.response?.status || e.message);
    throw e;
  }
}

function isUrl(str) {
  if (!str) return false;
  return /^https?:\/\//i.test(String(str));
}

async function uploadImageToMediaIfLocal({ rutaImagen }) {
  if (!rutaImagen) return null;
  if (isUrl(rutaImagen)) {
    return { images: [{ src: rutaImagen }] };
  }

  // Local path: upload to WP Media
  try {
    const wp = getWpConfig();
    if (!wp.baseUrl || !wp.username || !wp.appPassword) {
      logger.warn('[WC] WP creds faltan para subir imagen. Omitiendo imagen.');
      return null;
    }
    const filePath = path.resolve(rutaImagen);
    if (!fs.existsSync(filePath)) {
      logger.warn('[WC] Ruta imagen local no existe. Omitiendo imagen:', filePath);
      return null;
    }

    const stream = fs.createReadStream(filePath);
    const form = new FormData();
    form.append('file', stream, path.basename(filePath));

    const auth = base64(`${wp.username}:${wp.appPassword}`);
    const url = `${wp.baseUrl}${wp.wpApiBase}/media`;

    const resp = await axios.post(url, form, {
      headers: {
        ...form.getHeaders(),
        Authorization: `Basic ${auth}`,
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 30000,
    });

    const media = resp.data;
    if (media && media.id) {
      logger.info('[WC] Imagen subida a Media. ID=', media.id);
      return { images: [{ id: media.id }] };
    }
    logger.warn('[WC] Subida de imagen no devolvió ID. Omitiendo imagen.');
    return null;
  } catch (e) {
    logger.warn('[WC] Falla subiendo imagen local. Omitiendo imagen:', e.response?.status || e.message);
    return null;
  }
}

function extractCodesFromValue(value) {
  // Supports:
  // - array of strings/numbers
  // - comma/space separated string
  // - plain string single token
  let type = 'array';
  let items = [];

  if (Array.isArray(value)) {
    items = value.slice();
  } else if (typeof value === 'string') {
    type = 'string';
    const raw = value.replace(/\s+/g, ',');
    items = raw.split(',').map((s) => s.trim()).filter(Boolean);
  } else if (value != null) {
    // unknown structure, attempt stringify and split
    try {
      const s = String(value);
      const raw = s.replace(/\s+/g, ',');
      items = raw.split(',').map((x) => x.trim()).filter(Boolean);
      type = 'string';
    } catch {
      items = [];
      type = 'array';
    }
  }

  // Normalize values: keep numbers as numbers; strings as strings
  const nums = [];
  const strs = [];
  for (const it of items) {
    if (typeof it === 'number') nums.push(it);
    else if (typeof it === 'string') {
      const n = it.match(/^\d+$/) ? Number(it) : null;
      if (n != null) nums.push(n);
      else strs.push(it);
    }
  }

  return {
    rawType: type,        // 'array' or 'string'
    numbers: nums,        // candidate IDs
    strings: strs,        // candidate codes like 'p$' or 'AD0825'
  };
}

function unique(arr) {
  const set = new Set(arr);
  return Array.from(set);
}

function likeTagCode(str) {
  return /^[A-Za-z]{2}\d{4}$/.test(String(str || ''));
}

function samePrefix(a, b) {
  return a && b && a.slice(0, 2).toUpperCase() === b.slice(0, 2).toUpperCase();
}

async function mapIdsToCodesIfNeeded({ ids, client }) {
  // Returns { mapIdToCode, mapCodeToId }
  const mapIdToCode = new Map();
  const mapCodeToId = new Map();

  if (!ids || !ids.length) return { mapIdToCode, mapCodeToId };

  // Try to fetch tags by ID one-by-one to avoid assumptions about include[] support
  await Promise.all(ids.map(async (id) => {
    try {
      const resp = await client.get(`/wp-json/fluent-crm/v2/tags/${id}`);
      const data = resp.data;
      const tag = data?.data || data?.tag || data;
      const title = tag?.title || tag?.name || tag?.slug || '';
      if (title) {
        mapIdToCode.set(id, title);
        mapCodeToId.set(title, id);
      }
    } catch (e) {
      // ignore failures silently
    }
  }));

  return { mapIdToCode, mapCodeToId };
}

function classifyFluentMetaCandidates(metaData) {
  // Return candidates that look like FluentCRM fields with tags
  const cands = [];
  for (const m of metaData || []) {
    const key = m.key || '';
    const val = m.value;

    const keyLooks = /fluent[-_]?crm/i.test(key) || /fluent/i.test(key);
    const valStr = typeof val === 'string' ? val : '';
    const hasP = /(^|[\s,;])p\$(?=$|[\s,;])/i.test(valStr) || (Array.isArray(val) && val.some((x) => String(x).toLowerCase() === 'p$'));

    const { numbers, strings } = extractCodesFromValue(val);
    const hasCodes = strings.some((s) => likeTagCode(s));
    const hasNums = numbers.length > 0;

    if (keyLooks || hasP || hasCodes || hasNums) {
      cands.push({ meta: m, parsed: { numbers, strings, hasP, hasCodes, hasNums } });
    }
  }
  return cands;
}

async function detectFluentCrmFields({ metaData, newTagCode }) {
  // Heuristic:
  // - purchaseAdd: field that includes 'p$'
  // - refundRemove: field that doesn't include 'p$' but contains tag-like codes/ids
  const cands = classifyFluentMetaCandidates(metaData);

  const purchase = cands.find((c) => c.parsed.hasP) || null;
  const refund = cands.find((c) => !c.parsed.hasP && (c.parsed.hasCodes || c.parsed.hasNums)) || null;

  return { purchaseAdd: purchase ? purchase.meta : null, refundRemove: refund ? refund.meta : null };
}

async function buildUpdatedValue({
  original,
  newTagCode,
  fcrmClient,
  mode, // 'purchaseAdd' | 'refundRemove'
}) {
  const { rawType, numbers, strings } = extractCodesFromValue(original.value);

  // Resolve IDs to codes if present
  const { mapIdToCode, mapCodeToId } = await mapIdsToCodesIfNeeded({ ids: numbers, client: fcrmClient });

  // Build working set of codes
  let codes = [];

  // From numbers -> codes via map
  for (const id of numbers) {
    const code = mapIdToCode.get(id);
    if (code) codes.push(code);
  }

  // From strings -> as-is (codes like 'p$' or 'AD0825')
  codes.push(...strings);

  // Normalize to uppercase for tag codes (not for 'p$')
  const canon = (c) => (c === 'p$' ? 'p$' : String(c || '').toUpperCase());
  codes = codes.map(canon);

  // Guess oldTag among present codes
  const upperNew = newTagCode.toUpperCase();
  const presentCandidates = codes.filter((c) => c !== 'p$' && likeTagCode(c));
  let oldTag = presentCandidates.find((c) => c !== upperNew && samePrefix(c, upperNew)) || null;

  // Apply rules
  const outCodes = new Set(codes);
  if (mode === 'purchaseAdd') {
    // Ensure p$ and newTag; remove oldTag if exists
    outCodes.add('p$');
    outCodes.add(upperNew);
    if (oldTag) outCodes.delete(oldTag);
  } else if (mode === 'refundRemove') {
    // Ensure only newTag adjustment: ensure newTag is present, remove oldTag if exists
    outCodes.add(upperNew);
    if (oldTag) outCodes.delete(oldTag);
  }

  // Keep non-tag tokens intact (already in outCodes)
  // Rebuild to original type: if original had numeric IDs, convert codes back to IDs where possible
  let finalValue = null;

  // If originally numbers existed and there was no strings, prefer IDs format
  const preferIds = numbers.length > 0 && strings.length === 0;

  if (preferIds) {
    // Convert codes back to IDs when possible; keep unknown codes as-is strings if map not found
    const result = [];
    for (const c of outCodes) {
      if (c === 'p$') {
        // get id for 'p$' (ensure exists)
        const pRes = await ensureTagFromCode({ code: 'p$' }).catch(() => null);
        if (pRes?.id != null) result.push(pRes.id);
      } else if (likeTagCode(c)) {
        const id = mapCodeToId.get(c);
        if (id != null) result.push(id);
        else {
          // ensure to get/create id for new tag; avoid creating for arbitrary others
          if (c === upperNew) {
            const res = await ensureTagFromCode({ code: c }).catch(() => null);
            if (res?.id != null) result.push(res.id);
          }
          // For any other unknown code, skip to avoid accidental creation/mismatch
        }
      } else {
        // unknown token; skip in IDs mode
      }
    }
    finalValue = unique(result);
  } else {
    // String/strings mode: return codes as strings, keep original casing for 'p$'
    const result = Array.from(outCodes);
    // Prefer 'p$' as lower-case; tag codes uppercase
    const norm = result.map((c) => (c === 'p$' ? 'p$' : c.toUpperCase()));
    if (rawType === 'string') {
      finalValue = norm.join(', ');
    } else {
      finalValue = norm;
    }
  }

  // Prepare diff data
  const beforeDisplay = Array.isArray(original.value) ? JSON.stringify(original.value) : String(original.value);
  const afterDisplay = Array.isArray(finalValue) ? JSON.stringify(finalValue) : String(finalValue);

  return {
    value: finalValue,
    diff: { key: original.key, before: beforeDisplay, after: afterDisplay },
  };
}

async function buildPatchForFluentCrm({ metaData, newTagCode }) {
  const fcrmCfg = getFcrmConfig();
  const hasFcrm = Boolean(fcrmCfg.baseUrl && fcrmCfg.user && fcrmCfg.pass);
  let fcrmClient = null;
  if (hasFcrm) {
    fcrmClient = getFcrmClient();
  }

  const { purchaseAdd, refundRemove } = await detectFluentCrmFields({ metaData, newTagCode });
  const metaPatches = [];
  const diffs = [];

  if (!purchaseAdd && !refundRemove) {
    logger.warn('[WC] No se detectaron campos FluentCRM en el producto. Omitiendo actualización de tags.');
    return { metaPatches, diffs };
  }

  if (purchaseAdd) {
    try {
      const upd = await buildUpdatedValue({
        original: purchaseAdd,
        newTagCode,
        fcrmClient,
        mode: 'purchaseAdd',
      });
      if (upd) {
        metaPatches.push({ id: purchaseAdd.id, key: purchaseAdd.key, value: upd.value });
        diffs.push({ scope: 'FluentCRM', field: 'purchaseAdd', ...upd.diff });
      }
    } catch (e) {
      logger.warn('[WC] No se pudo actualizar Purchase/Add tags:', e.message || e);
    }
  }

  if (refundRemove) {
    try {
      const upd2 = await buildUpdatedValue({
        original: refundRemove,
        newTagCode,
        fcrmClient,
        mode: 'refundRemove',
      });
      if (upd2) {
        metaPatches.push({ id: refundRemove.id, key: refundRemove.key, value: upd2.value });
        diffs.push({ scope: 'FluentCRM', field: 'refundRemove', ...upd2.diff });
      }
    } catch (e) {
      logger.warn('[WC] No se pudo actualizar Refund/Remove tags:', e.message || e);
    }
  }

  return { metaPatches, diffs };
}

function diffName(oldName, newName) {
  if (String(oldName) === String(newName)) return null;
  return { before: String(oldName), after: String(newName) };
}

async function maybeBuildImagePatch({ product, rutaImagen }) {
  if (!rutaImagen) return { images: null, diff: null };

  if (isUrl(rutaImagen)) {
    const old = (product.images && product.images[0] && (product.images[0].src || product.images[0].id)) || '';
    const next = rutaImagen;
    if (String(old) === String(next)) {
      return { images: null, diff: null };
    }
    return { images: [{ src: rutaImagen }], diff: { before: String(old), after: String(next) } };
  }
  // Local path: attempt upload
  const uploaded = await uploadImageToMediaIfLocal({ rutaImagen });
  if (!uploaded) return { images: null, diff: null };

  const old = (product.images && product.images[0] && (product.images[0].id || product.images[0].src)) || '';
  const next = uploaded.images[0].id || uploaded.images[0].src;
  if (String(old) === String(next)) {
    return { images: null, diff: null };
  }
  return { images: uploaded.images, diff: { before: String(old), after: String(next) } };
}

function isDryRun() {
  return String(process.env.DRY_RUN || 'false').toLowerCase() === 'true';
}

async function enforceFluentCrmTags({ overrides, newTagCode }) {
  // Strategy: Enforce [P$, newTag] for purchase logic.
  // We cannot rely on reading existing hidden meta, so we reconstruction the desired state.
  // Requirement: "Importante los tags P$ y ninguna deben permanecer" -> We ensure P$ is always there.

  const fcrmClient = getFcrmClient();

  // 1. Resolve IDs
  const pTag = await ensureTagFromCode({ code: 'p$' }).catch(() => null);
  const newTag = await ensureTagFromCode({ code: newTagCode }).catch(() => null);

  if (!pTag || !newTag) {
    logger.warn('[WC] No se pudieron resolver IDs para tags P$ o Nuevo Tag. Omitiendo actualización FluentCRM.');
    return [];
  }

  const pId = pTag.id;
  const nId = newTag.id;

  // 2. Construct payloads
  // Keys for FluentCRM integration (based on common behavior and user request)
  // Usually: _fluentcrm_purchase_tags (Add), _fluentcrm_purchase_remove_tags (Remove)
  //          _fluentcrm_refund_tags (Add), _fluentcrm_refund_remove_tags (Remove)

  // Purchase Add: P$ + NewTag
  const purchaseAddValue = [pId, nId];

  // Purchase Remove: Empty (user said "ninguna" - meaning no specific removals, or just clearing old logic)
  // Actually, setting this to empty ensures we don't accidentally remove P$ if it was there.
  const purchaseRemoveValue = [];

  // Refund Add: Empty
  const refundAddValue = [];

  // Refund Remove: NewTag (so if refunded, access is removed)
  const refundRemoveValue = [nId];

  // We target specific known keys. If they don't exist, WC will add them.
  const metas = [
    { key: '_fluentcrm_purchase_tags', value: purchaseAddValue },
    { key: '_fluentcrm_purchase_remove_tags', value: purchaseRemoveValue },
    { key: '_fluentcrm_refund_tags', value: refundAddValue },
    { key: '_fluentcrm_refund_remove_tags', value: refundRemoveValue }
  ];

  // CRITICAL FIX: The UI seems to read from 'fcrm-settings-woo', so we must update that too.
  // Format: { "purchase_apply_tags": ["123"], "purchase_remove_tags": [] } (IDs as strings usually, but numbers work in JSON)
  const fcrmSettingsValue = {
    purchase_apply_tags: purchaseAddValue.map(String),
    purchase_remove_tags: purchaseRemoveValue.map(String),
    refund_apply_tags: refundAddValue.map(String),
    refund_remove_tags: refundRemoveValue.map(String)
  };
  metas.push({ key: 'fcrm-settings-woo', value: fcrmSettingsValue });

  const diffs = [];
  // For logging only - meaningful diffs
  diffs.push({ scope: 'FluentCRM', field: 'PurchaseAdd', before: '(hidden)', after: JSON.stringify(purchaseAddValue) });
  diffs.push({ scope: 'FluentCRM', field: 'LegacyUI', before: '(hidden)', after: JSON.stringify(fcrmSettingsValue) });

  return { metas, diffs };
}

async function updateWooProductByInput({ input, courseId, autoTimezoneLink }) {
  const wcClient = buildWcAxios();

  if (courseId) {
    logger.info(`[WC] Recibido courseId para asociación: ${courseId} (Tipo: ${typeof courseId})`);
  }

  // Identify product by SKU candidates
  const candidates = computeSkuCandidates(input.tagCurso);
  if (!candidates.length) {
    throw new Error('[WC] TagCurso inválido para calcular SKU.');
  }

  const prodBase = await getProductBySkuCandidates({ client: wcClient, candidates });
  if (!prodBase) {
    const msg = `[WC] Producto no encontrado por SKU (${candidates.join(' | ')}). Abortando módulo WooCommerce.`;
    logger.error(msg);
    throw new Error(msg);
  }

  const product = await getProductFull({ client: wcClient, id: prodBase.id });

  const desiredName = String(input.nombreProducto).trim();
  const nameDiff = diffName(product.name, desiredName);

  const imagePatch = await maybeBuildImagePatch({ product, rutaImagen: input.rutaImagen });

  // FluentCRM enforced logic
  const { metas: fcrmMetas, diffs: fcrmDiffs } = await enforceFluentCrmTags({
    overrides: {}, // unused for now
    newTagCode: String(input.tagCurso || '').toUpperCase(),
  });

  // LearnDash Course Association logic
  let ldMeta = null;
  let ldDiff = null;
  if (courseId) {
    // Key: _related_course
    // Value: Array of IDs (e.g., [123]). We enforce Number.
    const targetIdNum = Number(courseId);

    const currentLd = product.meta_data.find(m => m.key === '_related_course');
    const currentVal = currentLd ? currentLd.value : [];
    // safe check: depends on if API returns it as array or string. Usually array for this key.
    const currentId = (Array.isArray(currentVal) && currentVal.length) ? currentVal[0] : null;

    if (String(currentId) !== String(targetIdNum)) {
      ldMeta = {
        key: '_related_course',
        value: [targetIdNum]
      };
      // CRITICAL FIX: If meta exists, must provide ID to update it
      if (currentLd && currentLd.id) {
        ldMeta.id = currentLd.id;
      }
      ldDiff = { scope: 'LearnDash', before: String(currentId), after: String(targetIdNum) };
    }
  }

  // Build Woo patch
  const patch = {};
  const diffs = [];
  const meta_data = [];

  if (nameDiff) {
    patch.name = desiredName;
    diffs.push({ scope: 'name', before: nameDiff.before, after: nameDiff.after });
  }
  if (imagePatch.images) {
    patch.images = imagePatch.images;
    if (imagePatch.diff) {
      diffs.push({ scope: 'image', before: imagePatch.diff.before, after: imagePatch.diff.after });
    }
  }

  // Accumulate metas
  if (fcrmMetas.length) {
    meta_data.push(...fcrmMetas);
    diffs.push(...fcrmDiffs);
  }
  if (ldMeta) {
    meta_data.push(ldMeta);
    diffs.push(ldDiff);
  }

  // ACF Ficha Tecnica Update
  if (input.startDateTime || input.timezoneLink || autoTimezoneLink) {
    const acfMetas = [];
    const acfDiffs = [];

    // Find Repeater Indices
    let dateIndex = -1;
    let linkIndex = -1;

    // Keys are like: ficha_tecnica_0_pregunta, ficha_tecnica_0_respuesta
    // We scan existing meta to find the indices based on the "pregunta"
    const fichaKeys = product.meta_data.filter(m => /^ficha_tecnica_\d+_pregunta$/.test(m.key));
    if (fichaKeys.length === 0) {
      logger.warn(`[WC] ACF: No se encontraron campos "ficha_tecnica_N_pregunta" en el producto. Las fechas/links NO se actualizarán.`);
    } else {
      logger.info(`[WC] ACF: Campos ficha_tecnica encontrados: ${fichaKeys.map(m => `${m.key}="${m.value}"`).join(', ')}`);
    }
    fichaKeys.forEach(m => {
      const match = m.key.match(/^ficha_tecnica_(\d+)_pregunta$/);
      if (match) {
        const index = match[1];
        const val = String(m.value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (val.includes('cuando') || val.includes('inicio') || val.includes('fecha')) {
          dateIndex = index;
        } else if (val.includes('ciudad') || val.includes('horario') || val.includes('hora')) {
          linkIndex = index;
        }
      }
    });

    if (dateIndex === -1 && input.startDateTime) {
      logger.warn(`[WC] ACF: No se encontró campo de fecha ("Cuándo comienza" o similar). La fecha NO se actualizará en ficha técnica.`);
    }

    if (dateIndex !== -1 && (input.meetingDatesShort || input.startDateTime)) {
      const newDateVal = input.meetingDatesShort
        ? `${input.meetingDatesShort} las ${input.horaInicio} (Hora Argentina)`
        : `${input.startDateTime} (Hora Argentina)`;
      const keyVal = `ficha_tecnica_${dateIndex}_respuesta`;

      // Find current value for diff (optional)
      const current = product.meta_data.find(m => m.key === keyVal);
      const currentVal = current ? current.value : '';

      if (currentVal !== newDateVal) {
        const patch = { key: keyVal, value: newDateVal };
        if (current && current.id) patch.id = current.id;
        acfMetas.push(patch);
        acfDiffs.push({ scope: 'ACF', field: 'FechaInicio', before: currentVal, after: newDateVal });
      }
    }

    if (linkIndex !== -1 && (input.timezoneLink || autoTimezoneLink)) {
      // Format as HTML Link
      // If input doesn't start with http, assume it's just a text url?
      // User prompt says "Link Horario".
      const linkUrl = (input.timezoneLink || autoTimezoneLink || '').trim();
      if (linkUrl) {
        const newLinkVal = `<a href="${linkUrl}" target="_blank" rel="noopener noreferrer">Ver hora en mi ciudad</a>`;
        const keyVal = `ficha_tecnica_${linkIndex}_respuesta`;

        const current = product.meta_data.find(m => m.key === keyVal);
        const currentVal = current ? current.value : '';

        // Check if link changed (regex compare url or full string)
        if (currentVal !== newLinkVal) {
          const patch = { key: keyVal, value: newLinkVal };
          if (current && current.id) patch.id = current.id;
          acfMetas.push(patch);
          acfDiffs.push({ scope: 'ACF', field: 'TimezoneLink', before: currentVal, after: newLinkVal });
        }
      }
    }

    if (acfMetas.length) {
      meta_data.push(...acfMetas);
      diffs.push(...acfDiffs);
    }
  }

  if (meta_data.length) {
    patch.meta_data = meta_data;
  }

  if (!Object.keys(patch).length) {
    logger.info('[WC] No hay cambios para aplicar (name, image, FluentCRM, LearnDash).');
    return { productId: product.id, changed: false, dryRun: isDryRun(), diffs: [], permalink: product.permalink };
  }

  if (isDryRun()) {
    logger.info('[WC] DRY-RUN habilitado. Cambios planificados:');
    for (const d of diffs) {
      logger.info('[WC] -', d.scope, '=>', d.before, '→', d.after);
    }
    return { productId: product.id, changed: true, dryRun: true, diffs, permalink: product.permalink };
  }

  // Apply PATCH
  try {
    const resp = await wcClient.put(`/products/${product.id}`, patch);
    logger.info('[WC] Producto actualizado (PATCH) ID=', product.id);
    return { productId: product.id, changed: true, dryRun: false, diffs, permalink: resp.data.permalink || product.permalink };
  } catch (e) {
    logger.error('[WC] Error aplicando PATCH al producto:', e.response?.status || e.message);
    throw e;
  }
}

module.exports = {
  updateWooProductByInput,
  computeSkuCandidates,
};

