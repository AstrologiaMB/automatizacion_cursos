'use strict';

const logger = require('../utils/logger');
const { getFcrmClient } = require('./fluentcrm');
const { getFcrmConfig } = require('./config');

/**
 * Ensures a SmartLink exists (Recycle or Create).
 */
async function ensureSmartLink({
    sourceTag,
    newTag,
    productUrl,
    addTagIds = [],
    addListIds = []
}) {
    const client = getFcrmClient();
    const cfg = getFcrmConfig();
    const apiPath = cfg.apiBase;

    const newTagClean = String(newTag).trim();
    const sourceTagClean = String(sourceTag || '').trim();

    // Helper to search via API
    const searchLinks = async (term) => {
        try {
            const url = `${apiPath}/smart-links`;
            logger.info(`[FCRM] DEBUG: Requesting GET ${client.defaults.baseURL}${url} ?search=${term}`);

            const res = await client.get(url, { params: { search: term, per_page: 10 } });
            const body = res.data;
            logger.info(`[FCRM] DEBUG BODY keys: ${Object.keys(body).join(', ')}`);
            logger.info(`[FCRM] DEBUG BODY preview: ${JSON.stringify(body).slice(0, 300)}`);

            let items = [];
            if (body) {
                // Handle "smart_links" key (found in some probes?)
                if (body.smart_links && Array.isArray(body.smart_links.data)) {
                    items = body.smart_links.data;
                }
                // Handle "action_links" object (Laravel Paginator) -> .data
                else if (body.action_links && body.action_links.data && Array.isArray(body.action_links.data)) {
                    items = body.action_links.data;
                }
                // Handle "action_links" generic array (fallback)
                else if (body.action_links && Array.isArray(body.action_links)) {
                    items = body.action_links;
                }
                // Standard Paged
                else if (body.data && Array.isArray(body.data)) {
                    items = body.data;
                }
                // Direct Array
                else if (Array.isArray(body)) {
                    items = body;
                }
            }
            logger.info(`[FCRM] Buscando "${term}"... encontrados: ${items.length}`);
            if (items.length > 0) {
                items.forEach(i => logger.info(`[FCRM] Candidato: ID ${i.id} Title: "${i.title}"`));
            }
            return items || [];
        } catch (e) {
            logger.warn(`[FCRM] Search failed for term "${term}": ${e.message}`);
            return [];
        }
    };

    // 1. Find Candidate
    let candidate = null;

    if (sourceTagClean) {
        const results = await searchLinks(sourceTagClean);
        // Case-insensitive find
        const termLower = sourceTagClean.toLowerCase();
        candidate = results.find(l => l.title && l.title.toLowerCase().includes(termLower));

        if (candidate) {
            logger.info(`[FCRM] SmartLink encontrado para reciclar (Tag anterior "${sourceTagClean}"): ID ${candidate.id} - "${candidate.title}"`);
        } else {
            logger.warn(`[FCRM] No se encontró SmartLink buscando "${sourceTagClean}". Se buscará por nuevo tag.`);
        }
    }

    if (!candidate && newTagClean) {
        const results = await searchLinks(newTagClean);
        candidate = results.find(l => l.title && l.title.includes(newTagClean));
        if (candidate) {
            logger.info(`[FCRM] SmartLink ya existente para el nuevo tag "${newTagClean}": ID ${candidate.id}`);
        }
    }

    // 3. Prepare Payload
    const title = `Curso ${newTagClean}`;
    const target_url = productUrl ? `${productUrl}?utm_source=correo&utm_medium=organic&utm_campaign=smartlink` : '';

    const payload = {
        title: candidate ? candidate.title.replace(sourceTagClean || '???', newTagClean) : title,
        target_url: target_url || undefined,
        status: 'published'
    };

    // If we match strictly by sourceTag, replace that portion in title
    if (candidate && sourceTagClean && candidate.title.includes(sourceTagClean)) {
        payload.title = candidate.title.replace(sourceTagClean, newTagClean);
    } else if (!candidate) {
        // Creating new
        payload.title = `Curso ${newTagClean}`;
    }

    // Determine items to remove (Clean Swap)
    let removeLists = [];
    let removeTags = [];

    if (candidate && candidate.actions) {
        // If we are recycling, we want to remove the OLD lists/tags to avoid accumulation.
        // safely handle if keys are missing
        if (Array.isArray(candidate.actions.lists)) {
            // Map objects or IDs to String IDs
            removeLists = candidate.actions.lists.map(item => (typeof item === 'object' && item !== null) ? String(item.id) : String(item));
        }
        if (Array.isArray(candidate.actions.tags)) {
            removeTags = candidate.actions.tags.map(item => (typeof item === 'object' && item !== null) ? String(item.id) : String(item));
        }
    }

    const actions = {
        lists: addListIds.map(String),
        tags: addTagIds.map(String),
        remove_lists: removeLists,
        remove_tags: removeTags
    };
    payload.actions = actions;

    // 4. Update or Create
    const isDryRun = String(process.env.DRY_RUN || '').toLowerCase() === 'true';

    try {
        if (candidate) {
            // UPDATE
            logger.info(`[FCRM] (PRE-UPDATE) SmartLink ID ${candidate.id}. Payload: ${JSON.stringify(payload)}`);

            if (isDryRun) {
                logger.info('[FCRM] DRY-RUN: Skipping SmartLink Update.');
                return { id: candidate.id, wasCreated: false, shortUrl: candidate.short_url, dryRun: true };
            }

            const upRes = await client.put(`${apiPath}/smart-links/${candidate.id}`, payload);
            const upData = upRes.data.data || upRes.data;
            logger.info(`[FCRM] SmartLink actualizado: "${upData.title || payload.title}" (ID: ${candidate.id})`);
            return { id: candidate.id, wasCreated: false, shortUrl: upData.short_url || candidate.short_url };
        } else {
            // CREATE
            logger.info(`[FCRM] (PRE-CREATE) Payload: ${JSON.stringify(payload)}`);

            if (isDryRun) {
                logger.info('[FCRM] DRY-RUN: Skipping SmartLink Create.');
                return { id: 999999, wasCreated: true, shortUrl: 'http://dry-run/short', dryRun: true };
            }

            const cRes = await client.post(`${apiPath}/smart-links`, payload);
            const cData = cRes.data.data || cRes.data;
            logger.info(`[FCRM] SmartLink CREADO: "${cData.title}" (ID: ${cData.id})`);
            return { id: cData.id, wasCreated: true, shortUrl: cData.short_url };
        }
    } catch (e) {
        logger.error(`[FCRM] Error guardando SmartLink: ${e.response ? JSON.stringify(e.response.data) : e.message}`);
        return null;
    }
}

module.exports = {
    ensureSmartLink
};
