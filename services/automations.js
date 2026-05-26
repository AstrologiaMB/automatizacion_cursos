const { getFcrmClient } = require('./fluentcrm');
const { getWpClient } = require('./learndash');
const logger = require('../utils/logger');

const getClient = () => getFcrmClient();

/**
 * Ensures an automation is recycled/updated.
 * @param {Object} params
 * @param {string} params.sourceTag - Existing tag to find automation
 * @param {string} params.newTag - New tag to set
 * @param {string|number} params.triggerProductId - New Woo Product ID
 * @param {string} params.startDateTime - Human readable start date string (e.g. "lunes 28 de abril las 14:30")
 * @param {string} params.zoomJoinUrl - New Zoom Join URL
 * @param {boolean} [params.includeBirthData=false] - Whether to keep/remove Birth Data section
 */
async function ensureAutomation({
    sourceTag,
    newTag,
    triggerProductId,
    startDateTime,
    zoomJoinUrl,
    timezoneLink,
    newListId: explicitNewListId
}) {
    const client = getClient();
    const sourceTagClean = String(sourceTag).trim();
    const newTagClean = String(newTag).trim();

    logger.info(`[FCRM] Iniciando reciclaje de Automatización. Tag Base: "${sourceTagClean}" -> Nuevo: "${newTagClean}"`);

    // 1. Find Automation
    let funnel = null;
    try {
        const url = `/wp-json/fluent-crm/v2/funnels`;
        // We need to list and search mentally or use ?search if supported (Funnel API support search?)
        // Probe showed "funnels" key. Let's try searching.
        const res = await client.get(url, { params: { search: sourceTagClean, per_page: 50 } });

        logger.info(`[FCRM] Funnels response keys: ${JSON.stringify(Object.keys(res.data || {}))}`);
        let items = [];
        if (res.data?.funnels?.data && Array.isArray(res.data.funnels.data)) {
            items = res.data.funnels.data;          // paginado: { funnels: { data: [] } }
        } else if (Array.isArray(res.data?.funnels)) {
            items = res.data.funnels;               // plano:    { funnels: [] }
        } else if (Array.isArray(res.data)) {
            items = res.data;                       // raíz:     []
        }

        logger.info(`[FCRM] Funnels encontrados: ${items.length}`);
        // strict-ish match
        funnel = items.find(f => f.title.includes(sourceTagClean));

        if (!funnel) {
            logger.warn(`[FCRM] No se encontró Automatización buscando "${sourceTagClean}". Intentando con "${newTagClean}" por si ya existe...`);
            const res2 = await client.get(url, { params: { search: newTagClean, per_page: 50 } });
            let items2 = [];
            if (res2.data?.funnels?.data && Array.isArray(res2.data.funnels.data)) {
                items2 = res2.data.funnels.data;
            } else if (Array.isArray(res2.data?.funnels)) {
                items2 = res2.data.funnels;
            } else if (Array.isArray(res2.data)) {
                items2 = res2.data;
            }
            funnel = items2.find(f => f.title.includes(newTagClean));
            if (funnel) {
                logger.info(`[FCRM] Automatización ya existente encontrada: ID ${funnel.id}`);
            }
        }
    } catch (e) {
        logger.error(`[FCRM] Error buscando automations: ${e.message}`);
        return null; // Abort
    }

    if (!funnel) {
        logger.error(`[FCRM] No se encontró ninguna automatización para reciclar. Abortando.`);
        return null;
    }

    logger.info(`[FCRM] Reciclando Automation ID ${funnel.id}: "${funnel.title}"`);

    // 2. Fetch Full Details
    let fullFunnel = null;
    try {
        const res = await client.get(`/wp-json/fluent-crm/v2/funnels/${funnel.id}`, {
            params: { with: ['funnel_sequences', 'triggers'] } // Use correct sequences key
        });
        const d = res.data;
        fullFunnel = d.funnel || d.data || d;

        // Normalize keys: API returns 'funnel_sequences' in 'data' usually, or inside funnel object check both
        const seqs = d.funnel_sequences || fullFunnel.funnel_sequences
                   || d.sequences || fullFunnel.sequences;
        if (seqs && Array.isArray(seqs)) {
            fullFunnel.funnel_steps = seqs;
        }

        logger.info(`[FCRM] Detalles obtenidos. Keys: ${Object.keys(fullFunnel).join(', ')}`);
        if (fullFunnel.funnel_steps) logger.info(`[FCRM] Se encontraron ${fullFunnel.funnel_steps.length} pasos/secuencias.`);
        else logger.warn(`[FCRM] ⚠️ No se encontraron pasos (funnel_sequences) en la respuesta.`);

        if (!fullFunnel.title) throw new Error('No se pudo leer el título del Funnel.');
    } catch (e) {
        logger.error(`[FCRM] Error fetching funnel details: ${e.message}`);
        return null;
    }

    // 2.5 Resolve List IDs (New and Old)
    let newListId = null;
    let oldListId = null;
    try {
        const listsRes = await client.get('/wp-json/fluent-crm/v2/lists', { params: { per_page: 50 } });
        let lists = listsRes.data.data || listsRes.data;
        if (!Array.isArray(lists)) lists = [];

        const findList = (name) => lists.find(l => l.title.toLowerCase().trim() === name.toLowerCase().trim());

        const lNew = findList(newTagClean);
        // Use explicit ID if provided, otherwise search result
        if (explicitNewListId) {
            newListId = explicitNewListId;
        } else if (lNew) {
            newListId = lNew.id;
        } else {
            logger.warn(`[FCRM] No se encontró la Lista nueva "${newTagClean}". Paso 'Aplicar lista' no se actualizará.`);
        }

        const lOld = findList(sourceTagClean);
        if (lOld) oldListId = lOld.id;
        else logger.warn(`[FCRM] No se encontró la Lista vieja "${sourceTagClean}". Paso 'Quitar lista' no se actualizará.`);

    } catch (e) {
        logger.warn(`[FCRM] Error resolviendo List IDs: ${e.message}`);
    }

    // 3. Prepare Updates
    let hasChanges = false;
    let newTitle = fullFunnel.title;

    // Update Title
    if (newTitle.includes(sourceTagClean)) {
        newTitle = newTitle.replace(sourceTagClean, newTagClean);
        hasChanges = true;
    }

    // Process Triggers & Actions (in-memory update)
    // Structure: fullFunnel.funnel_steps (Array? Object? Probe showed complex steps structure)
    // Actually, usually `funnel_steps` is an array of steps.
    // Wait, probe payload (Step 1490) showed:
    // "triggers": { ... }, "actions": { ... } ? No, probe showed "funnel_steps" inside the detail?
    // Let's assume standard FluentCRM structure: `funnel.conditions` (triggers) and `funnel.settings`?
    // Probe #1490:
    /*
      {
        "id": 135,
        "title": "...",
        "triggers": [ ... ],
        "funnel_steps": [ ... ] 
      }
    */

    // Update Trigger (WooCommerce Purchase)
    // API structure: trigger_name (string at root) + conditions (object at root, e.g. { product_ids: [] })
    if (triggerProductId && fullFunnel.trigger_name === 'woocommerce_purchased_order') {
        const cond = fullFunnel.conditions || {};
        const currentIds = cond.product_ids || [];
        const newIdStr = String(triggerProductId);
        const isSame = currentIds.some(id => String(id) === newIdStr);
        if (!isSame) {
            logger.info(`[FCRM] Actualizando Trigger WooCommerce Product ID: ${currentIds.join(',')} -> ${newIdStr}`);
            fullFunnel.conditions = { ...cond, product_ids: [newIdStr] };
            hasChanges = true;
        } else {
            logger.info(`[FCRM] Trigger ya apunta al Product ID ${triggerProductId}. Sin cambios.`);
        }
    } else if (triggerProductId) {
        logger.warn(`[FCRM] Trigger tipo "${fullFunnel.trigger_name}" no es woocommerce_purchased_order. Product ID no actualizado.`);
    }

    // Update Email Actions
    const updateEmailBody = (html) => {
        let content = html;

        // 1. Global Tag Replace (AT0425 -> AT0526)
        // Covers: ?curso=at0425, links con tag, títulos, etc.
        const regexTag = new RegExp(sourceTagClean, 'gi');
        content = content.replace(regexTag, newTagClean);

        // 2. Zoom Link
        // Regex: https://...zoom.us/... (until whitespace or quote)
        const regexZoom = /https:\/\/[^/]*zoom\.us\/[^"\s<>]+/gi;
        if (zoomJoinUrl) {
            content = content.replace(regexZoom, zoomJoinUrl);
        }

        // 3. Date/Time in body
        // Pattern: "martes 2 de junio las 14:30 de Argentina (GMT-3)"
        const regexDate = /(lunes|martes|miércoles|jueves|viernes|sábado|domingo)\s+\d{1,2}\s+de\s+[a-záéíóú]+\s+(las|a\s+las)\s+\d{1,2}:\d{2}(?:\s+de\s+Argentina)?(?:\s*\(GMT[-+]\d\))?/gi;
        if (startDateTime) {
            content = content.replace(regexDate, (match) => {
                logger.info(`[FCRM] Reemplazando fecha en cuerpo: "${match}" -> "${startDateTime}"`);
                return startDateTime;
            });
        }

        // 4. Timezone Link ("Hora de tu ciudad")
        // Regex: href="https://www.timeanddate.com/..." dentro de links
        const regexTimezone = /https:\/\/(?:www\.)?timeanddate\.com\/[^"\s<>]+/gi;
        if (timezoneLink) {
            content = content.replace(regexTimezone, (match) => {
                logger.info(`[FCRM] Reemplazando link timezone: "${match}" -> "${timezoneLink}"`);
                return timezoneLink;
            });
        }

        return content;
    };

    if (fullFunnel.funnel_steps) {
        fullFunnel.funnel_steps.forEach(step => {
            logger.info(`[FCRM] Step ID ${step.id} Action: ${step.action_name}`);

            // Actualizar título del bloque (nombre visible en el editor)
            if (step.title && typeof step.title === 'string' && step.title.includes(sourceTagClean)) {
                step.title = step.title.replace(new RegExp(sourceTagClean, 'gi'), newTagClean);
                hasChanges = true;
                logger.info(`[FCRM] Título de bloque actualizado: "${step.title}"`);
            }

            if (step.action_name === 'send_custom_email') {

                let targetSubjectObj = step.settings;
                // If it's a campaign-based step, keys are in 'campaign' object
                if (step.settings && step.settings.campaign) {
                    targetSubjectObj = step.settings.campaign;
                }

                // Update Subject
                if (targetSubjectObj && targetSubjectObj.email_subject) {
                    const oldSub = targetSubjectObj.email_subject;
                    let newSub = oldSub.replace(new RegExp(sourceTagClean, 'gi'), newTagClean);

                    if (startDateTime) {
                        // Build subject date string: "martes junio 2" from "martes 2 de junio las 14:30"
                        // startDateTime format: "martes 2 de junio las 14:30"
                        const parts = startDateTime.split(' ');
                        // parts: ["martes", "2", "de", "junio", "las", "14:30"]
                        const subjectDateStr = parts.length >= 4
                            ? `${parts[0]} ${parts[3]} ${parts[1]}`  // "martes junio 2"
                            : parts[0];

                        // Format in subject: "DiaNombre MesNombre DayNum" (e.g. "martes junio 2")
                        const regexDateSub = /(lunes|martes|miércoles|jueves|viernes|sábado|domingo)\s+[a-záéíóú]+\s+\d{1,2}/gi;
                        if (regexDateSub.test(newSub)) {
                            newSub = newSub.replace(regexDateSub, subjectDateStr);
                        }
                    }

                    if (newSub !== oldSub) {
                        targetSubjectObj.email_subject = newSub;
                        hasChanges = true;
                        logger.info(`[FCRM] Asunto actualizado: "${oldSub}" -> "${newSub}"`);
                    }
                }

                // Update Body
                if (targetSubjectObj && targetSubjectObj.email_body) {
                    const oldBody = targetSubjectObj.email_body;
                    const newBody = updateEmailBody(oldBody);
                    if (newBody !== oldBody) {
                        targetSubjectObj.email_body = newBody;
                        hasChanges = true;
                        logger.info(`[FCRM] Cuerpo del correo actualizado (Length: ${newBody.length})`);
                    }
                }
            }

            // Update Add to List
            if (step.action_name === 'add_contact_to_list') {
                if (step.settings && step.settings.lists && newListId) {
                    // Strategy: Replace ALL lists with the new one? Or just append?
                    // Usually for "Course Bought", it's a specific list.
                    // The user said: "agregar a la lista con etiqueta... PAM0526"
                    // We replace the logic to apply the NEW list.
                    logger.info(`[FCRM] Actualizando paso 'Aplicar lista' -> ID ${newListId}`);
                    step.settings.lists = [String(newListId)];
                    hasChanges = true;
                }
            }

            // Update Remove from List
            if (step.action_name === 'detach_contact_from_list') {
                if (step.settings && step.settings.lists && oldListId) {
                    // Strategy: Remove from OLD list.
                    logger.info(`[FCRM] Actualizando paso 'Quitar lista' -> ID ${oldListId}`);
                    step.settings.lists = [String(oldListId)];
                    hasChanges = true;
                }
            }
        });
    }

    // 4. Save Changes
    if (process.env.DRY_RUN === 'true') {
        logger.info(`[FCRM] DRY-RUN: Skipping Automation Save/Update.`);
        logger.info(`[FCRM] Payload Title: ${newTitle}`);
        // Dump logic check?
        return { id: funnel.id, updated: true, dryRun: true };
    }

    if (hasChanges) {
        // PUT /funnels/{id}
        // Need to send the FULL structure usually? Or partial?
        // FluentCRM update usually accepts partial or full. Safer to send updated fields.

        // SAVE STRATEGY: 
        // 1. Update Title/Trigger via PUT /funnels/{id}
        // 2. Update Sequences via POST /funnels/{id}/sequences

        try {
            try {
                const putPayload = { title: newTitle };
                if (fullFunnel.conditions) putPayload.conditions = fullFunnel.conditions;
                await client.put(`/wp-json/fluent-crm/v2/funnels/${funnel.id}`, putPayload);
                logger.info(`[FCRM] Funnel actualizado: title="${newTitle}", conditions=${JSON.stringify(fullFunnel.conditions)}`);
            } catch (ePut) {
                // Ignore 422 if message says "already has the same status" or similar (idempotency)
                if (ePut.response && ePut.response.status === 422) {
                    logger.warn(`[FCRM] Aviso PUT Funnel: ${ePut.response.data?.message || '422 Unprocessable Entity'} (Probablemente sin cambios)`);
                } else {
                    throw ePut;
                }
            }

            // Now Save Sequences
            if (fullFunnel.funnel_steps && fullFunnel.funnel_steps.length > 0) {
                logger.info(`[FCRM] Guardando secuencias (Pasos)...`);

                // El endpoint REST /sequences falla en PHP 8.1 (json_decode bug en FunnelHelper).
                // Usamos el bridge PHP que guarda directamente via modelo/FunnelHelper interno.
                // Nota: bridge requiere current_user_can('manage_options') -> usar WP App Password.
                logger.info(`[FCRM] Guardando sequences via bridge PHP...`);
                await getWpClient().post('/wp-json/mb-bridge/v1/save-sequences', {
                    funnel_id: funnel.id,
                    sequences: fullFunnel.funnel_steps,
                });
            }

            logger.info(`[FCRM] Automatización actualizada exitosamente.`);
            return { id: funnel.id, updated: true };
        } catch (e) {
            logger.error(`[FCRM] Error guardando automatización: ${e.message}`);
            if (e.response) logger.error(JSON.stringify(e.response.data));
            return null;
        }
    } else {
        logger.info(`[FCRM] No se detectaron cambios necesarios en la automatización.`);
    }

    return { id: funnel.id, updated: false };
}

module.exports = {
    ensureAutomation
};
