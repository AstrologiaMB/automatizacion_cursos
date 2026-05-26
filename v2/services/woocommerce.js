// v2/services/woocommerce.js
// Integración WooCommerce (Orquestada - Sin dependencias cruzadas con FCRM)

'use strict';

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const logger = require('../../utils/logger');
const { uploadMedia } = require('./wp-media');

function base64(str) {
    return Buffer.from(str, 'utf8').toString('base64');
}

function getWcClient(credentials) {
    if (!credentials || !credentials.baseUrl || !credentials.consumerKey || !credentials.consumerSecret) {
        throw new Error('Faltan credenciales inyectadas WP/WooCommerce');
    }

    const auth = base64(`${credentials.consumerKey}:${credentials.consumerSecret}`);
    const baseUrl = credentials.baseUrl.replace(/\/+$/, '');
    const apiBase = credentials.wcApiBase || '/wp-json/wc/v3';

    return axios.create({
        baseURL: baseUrl + apiBase,
        timeout: 20000,
        headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/json',
            'User-Agent': 'WooCommerceAutomation/2.0',
        },
        paramsSerializer: { indexes: null },
    });
}

function computeSkuCandidates(tagCurso) {
    const t = String(tagCurso || '').trim();
    if (!t || t.length < 2) return [];
    const prefixUpper = t.slice(0, 2).toUpperCase();
    const prefixLower = t.slice(0, 2).toLowerCase();
    return [`${prefixUpper}zoom`, `${prefixLower}zoom`];
}

async function getProductBySkuCandidates({ client, candidates }) {
    for (const sku of candidates) {
        try {
            const resp = await client.get('/products', { params: { sku, per_page: 10 } });
            const arr = Array.isArray(resp.data) ? resp.data : [];
            if (arr.length > 0) {
                logger.info(`[WC] Producto encontrado por SKU: ${sku} (ID=${arr[0].id})`);
                return arr[0];
            }
        } catch (e) {
            logger.warn(`[WC] Búsqueda por SKU falló: ${sku} ${e.message}`);
        }
    }
    return null;
}

async function getProductFull({ client, id }) {
    const resp = await client.get(`/products/${id}`, { params: { context: 'edit' } });
    return resp.data;
}

function isUrl(str) {
    return /^https?:\/\//i.test(String(str || ''));
}

async function maybeBuildImagePatch({ product, rutaImagen, wpCredentials }) {
    if (!rutaImagen) return { images: null, diff: null };

    if (isUrl(rutaImagen)) {
        const old = (product.images && product.images[0] && (product.images[0].src || product.images[0].id)) || '';
        if (String(old) === String(rutaImagen)) return { images: null, diff: null };
        return { images: [{ src: rutaImagen }], diff: { before: String(old), after: String(rutaImagen) } };
    }

    if (!fs.existsSync(path.resolve(rutaImagen))) {
        logger.warn(`[WC] Ruta imagen local no existe: ${rutaImagen}`);
        return { images: null, diff: null };
    }

    const stream = fs.createReadStream(path.resolve(rutaImagen));
    const form = new FormData();
    form.append('file', stream, path.basename(rutaImagen));

    try {
        const auth = base64(`${wpCredentials.username}:${wpCredentials.appPassword}`);
        const url = `${wpCredentials.baseUrl}/wp-json/wp/v2/media`;
        const resp = await axios.post(url, form, {
            headers: { ...form.getHeaders(), Authorization: `Basic ${auth}` },
            maxContentLength: Infinity, maxBodyLength: Infinity, timeout: 30000,
        });

        const mediaId = resp.data?.id;
        if (!mediaId) return { images: null, diff: null };

        const old = (product.images && product.images[0] && (product.images[0].id || product.images[0].src)) || '';
        if (String(old) === String(mediaId)) return { images: null, diff: null };

        logger.info(`[WC] Imagen subida a WP (ID=${mediaId})`);
        return { images: [{ id: mediaId }], diff: { before: String(old), after: String(mediaId) } };
    } catch (e) {
        logger.warn(`[WC] Falló subida de imagen local: ${e.message}`);
        return { images: null, diff: null };
    }
}

/**
 * Recibe los IDs ya resueltos desde el orquestador (para no depender de module fluentcrm.js)
 */
function buildFluentCrmMetas(tagPId, newTagId) {
    if (!tagPId || !newTagId) {
        logger.warn('[WC] No se inyectaron IDs de FluentCRM. Omitiendo actualización de tags FCRM.');
        return { metas: [], diffs: [] };
    }

    const purchaseAddValue = [tagPId, newTagId];
    const purchaseRemoveValue = [];
    const refundAddValue = [];
    const refundRemoveValue = [newTagId];

    const metas = [
        { key: '_fluentcrm_purchase_tags', value: purchaseAddValue },
        { key: '_fluentcrm_purchase_remove_tags', value: purchaseRemoveValue },
        { key: '_fluentcrm_refund_tags', value: refundAddValue },
        { key: '_fluentcrm_refund_remove_tags', value: refundRemoveValue }
    ];

    const fcrmSettingsValue = {
        purchase_apply_tags: purchaseAddValue.map(String),
        purchase_remove_tags: purchaseRemoveValue.map(String),
        refund_apply_tags: refundAddValue.map(String),
        refund_remove_tags: refundRemoveValue.map(String)
    };
    metas.push({ key: 'fcrm-settings-woo', value: fcrmSettingsValue });

    const diffs = [
        { scope: 'FluentCRM', field: 'PurchaseAdd', before: '(hidden)', after: JSON.stringify(purchaseAddValue) },
        { scope: 'FluentCRM', field: 'LegacyUI', before: '(hidden)', after: JSON.stringify(fcrmSettingsValue) }
    ];

    return { metas, diffs };
}

async function updateWooProductByInput({ input, courseId, autoTimezoneLink, wcCredentials, wpCredentials, fcrmTags }) {
    const wcClient = getWcClient(wcCredentials);

    const candidates = computeSkuCandidates(input.tagCurso);
    if (!candidates.length) throw new Error('[WC] TagCurso inválido para calcular SKU.');

    const prodBase = await getProductBySkuCandidates({ client: wcClient, candidates });
    if (!prodBase) throw new Error(`[WC] Producto no encontrado por SKU (${candidates.join(' | ')}).`);

    const product = await getProductFull({ client: wcClient, id: prodBase.id });

    let nameDiff = null;
    const desiredName = String(input.nombreProducto).trim();
    if (product.name !== desiredName) nameDiff = { before: product.name, after: desiredName };

    const imagePatch = await maybeBuildImagePatch({ product, rutaImagen: input.rutaImagen, wpCredentials });

    // Inyección de FCRM
    const { metas: fcrmMetas, diffs: fcrmDiffs } = buildFluentCrmMetas(fcrmTags?.pId, fcrmTags?.newTagId);

    let ldMeta = null;
    let ldDiff = null;
    if (courseId) {
        const targetIdNum = Number(courseId);
        const currentLd = product.meta_data.find(m => m.key === '_related_course');
        const currentVal = currentLd ? currentLd.value : [];
        const currentId = (Array.isArray(currentVal) && currentVal.length) ? currentVal[0] : null;

        if (String(currentId) !== String(targetIdNum)) {
            ldMeta = { key: '_related_course', value: [targetIdNum] };
            if (currentLd && currentLd.id) ldMeta.id = currentLd.id;
            ldDiff = { scope: 'LearnDash', before: String(currentId), after: String(targetIdNum) };
        }
    }

    const patch = {};
    const diffs = [];
    const meta_data = [...fcrmMetas];
    if (fcrmDiffs.length) diffs.push(...fcrmDiffs);

    if (ldMeta) {
        meta_data.push(ldMeta);
        diffs.push(ldDiff);
    }

    if (nameDiff) {
        patch.name = desiredName;
        diffs.push({ scope: 'name', before: nameDiff.before, after: nameDiff.after });
    }

    if (imagePatch.images) {
        patch.images = imagePatch.images;
        if (imagePatch.diff) diffs.push({ scope: 'image', before: imagePatch.diff.before, after: imagePatch.diff.after });
    }

    // Actualizar Ficha Técnica (ACF Date/Link replacement regex logic from old script)
    if (input.startDateTime || input.timezoneLink || autoTimezoneLink) {
        let dateIndex = -1;
        let linkIndex = -1;
        product.meta_data.forEach(m => {
            const match = m.key.match(/^ficha_tecnica_(\d+)_pregunta$/);
            if (match) {
                const val = String(m.value || '').toLowerCase();
                if (val.includes('cuando comienza') || val.includes('cuándo comienza')) dateIndex = match[1];
                else if (val.includes('ciudad') || val.includes('horario')) linkIndex = match[1];
            }
        });

        if (dateIndex !== -1 && input.startDateTime) {
            const newDateVal = `${input.startDateTime} (Hora Argentina)`;
            const keyVal = `ficha_tecnica_${dateIndex}_respuesta`;
            const current = product.meta_data.find(m => m.key === keyVal);
            if (current?.value !== newDateVal) {
                meta_data.push({ id: current?.id, key: keyVal, value: newDateVal });
                diffs.push({ scope: 'ACF', field: 'Fecha', before: current?.value, after: newDateVal });
            }
        }

        const linkUrl = (input.timezoneLink || autoTimezoneLink || '').trim();
        if (linkIndex !== -1 && linkUrl) {
            const newLinkVal = `<a href="${linkUrl}" target="_blank" rel="noopener noreferrer">Ver hora en mi ciudad</a>`;
            const keyVal = `ficha_tecnica_${linkIndex}_respuesta`;
            const current = product.meta_data.find(m => m.key === keyVal);
            if (current?.value !== newLinkVal) {
                meta_data.push({ id: current?.id, key: keyVal, value: newLinkVal });
                diffs.push({ scope: 'ACF', field: 'TimezoneLink', before: current?.value, after: newLinkVal });
            }
        }
    }

    if (meta_data.length) patch.meta_data = meta_data;

    if (!Object.keys(patch).length) {
        logger.info('[WC] No hay cambios necesarios.');
        return { productId: product.id, changed: false, diffs: [], permalink: product.permalink };
    }

    await wcClient.put(`/products/${product.id}`, patch);
    logger.info(`[WC] Producto (PATCH) ID=${product.id} exitoso.`);

    return { productId: product.id, changed: true, diffs, permalink: product.permalink };
}

module.exports = {
    updateWooProductByInput,
    computeSkuCandidates
};
