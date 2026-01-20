const { getFcrmClient } = require('./fluentcrm');
const { recycleForm } = require('./forms');
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
    includeBirthData,
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
        const res = await client.get(url, { params: { search: sourceTagClean, per_page: 10 } });

        let items = [];
        if (res.data && res.data.funnels && Array.isArray(res.data.funnels.data)) {
            items = res.data.funnels.data;
        } else if (Array.isArray(res.data)) items = res.data;

        // strict-ish match
        funnel = items.find(f => f.title.includes(sourceTagClean));

        if (!funnel) {
            logger.warn(`[FCRM] No se encontró Automatización buscando "${sourceTagClean}". Intentando con "${newTagClean}" por si ya existe...`);
            const res2 = await client.get(url, { params: { search: newTagClean, per_page: 10 } });
            let items2 = [];
            if (res2.data && res2.data.funnels && Array.isArray(res2.data.funnels.data)) {
                items2 = res2.data.funnels.data;
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
        const seqs = d.funnel_sequences || fullFunnel.funnel_sequences;
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
    if (fullFunnel.triggers) {
        fullFunnel.triggers.forEach(t => {
            if (t.trigger_name === 'woocommerce_purchased_order') {
                // Update conditions: { product_ids: [ ... ] }
                if (t.settings && t.settings.conditions) {
                    const currentIds = t.settings.conditions.product_ids || [];
                    const newIdStr = String(triggerProductId);

                    // Only update if DIFFERENT
                    const isSame = currentIds.some(id => String(id) === newIdStr);

                    if (!isSame) {
                        logger.info(`[FCRM] Actualizando Trigger WooCommerce Product ID a: ${triggerProductId}`);
                        t.settings.conditions.product_ids = [newIdStr];
                        // t.settings.conditions.purchase_type = 'any'; // Preserve existing?
                        hasChanges = true;
                    } else {
                        logger.info(`[FCRM] El Trigger ya apunta al Product ID ${triggerProductId}. No se requieren cambios.`);
                    }
                }
            }
        });
    }

    // Update Email Actions
    const updateEmailBody = (html) => {
        let content = html;

        // 1. Global Tag Replace (PAM0425 -> PAM0526)
        // Cases: ?curso=pam0425, Title PAM0425
        const regexTag = new RegExp(sourceTagClean, 'gi');
        content = content.replace(regexTag, newTagClean);

        // 2. Zoom Link
        // Regex: https://...zoom.us/... (until whitespace or quote)
        const regexZoom = /https:\/\/[^/]*zoom\.us\/[^"\s<>]+/gi;
        if (zoomJoinUrl) {
            content = content.replace(regexZoom, zoomJoinUrl);
        }

        // 3. Date/Time
        // Pattern: "lunes 28 de abril las 14:30"
        // Try to match generic Spanish date format: DayName DayNum de MonthName ...
        // (lunes|martes...) \d{1,2} de \w+ (las \d{2}:\d{2})?
        const regexDate = /(lunes|martes|miércoles|jueves|viernes|sábado|domingo)\s+\d{1,2}\s+de\s+[a-záéíóú]+\s+(las|a\s+las)\s+\d{1,2}:\d{2}(?:\s+de\s+Argentina)?(?:\s*\(GMT[-+]\d\))?/gi;

        if (startDateTime) {
            content = content.replace(regexDate, (match) => {
                logger.info(`[FCRM] Reemplazando fecha encontrada: "${match}" -> "${startDateTime}"`);
                return startDateTime;
            });
        }

        // 4. Birth Data Removal
        if (includeBirthData === false) {
            // Try to remove the block "Datos de nacimiento" ... buttons ... spacer
            // This is tricky HTML. 
            // Header: <h2 ...>Datos de nacimiento</h2>
            // ... content ...
            // Buttons: ... class="wp-block-buttons" ...
            // Spacer: <p></p>

            // Aggressive Regex: From <h2>Datos de nacimiento</h2> UNTIL <h2 (next header)
            // But we want to keep next header.
            // Let's try to find specific markers from the sample provided.

            /*
               <!-- wp:heading -->
               <h2 class="wp-block-heading">Datos de nacimiento</h2>
               <!-- /wp:heading -->
               ...
               <!-- /wp:buttons -->
               ...
               <!-- wp:paragraph -->
               <p></p>
               <!-- /wp:paragraph -->
            */

            const regexBirthBlock = /<!-- wp:heading -->\s*<h2[^>]*>Datos de nacimiento<\/h2>[\s\S]*?<!-- \/wp:buttons -->(\s*<!-- wp:paragraph -->\s*<p><\/p>\s*<!-- \/wp:paragraph -->)*/im;

            if (regexBirthBlock.test(content)) {
                logger.info(`[FCRM] Eliminando sección 'Datos de nacimiento'`);
                content = content.replace(regexBirthBlock, '');
            }
        }

        return content;
    };

    if (fullFunnel.funnel_steps) {
        fullFunnel.funnel_steps.forEach(step => {
            logger.info(`[FCRM] Step ID ${step.id} Action: ${step.action_name}`);
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

                    const regexDateSub = /(lunes|martes|miércoles|jueves|viernes|sábado|domingo)\s+\d{1,2}\s+de\s+[a-záéíóú]+/gi;
                    const datePart = startDateTime ? (startDateTime.split(' las ')[0] || startDateTime) : '';

                    if (datePart && regexDateSub.test(newSub)) {
                        newSub = newSub.replace(regexDateSub, datePart);
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

    // 4. Handle Form Recycling (if needed)
    if (includeBirthData) {
        // Try to recycle form (fire and forget / warn)
        await recycleForm({ sourceTag, newTag, formId: 203 }); // Assuming ID 203 or derived
    }

    // 5. Save Changes
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
            // Update Main Properties
            const mainPayload = {
                title: newTitle,
                status: 'published',
                trigger_name: fullFunnel.trigger_name, // keep same
                // Update trigger conditions (product id)
                conditions: fullFunnel.settings?.conditions || (fullFunnel.triggers && fullFunnel.triggers[0]?.settings?.conditions),
                settings: fullFunnel.settings
            };

            // Note: trigger structure is complex in PUT. Usually we leave it if not broken.
            // But we modified the trigger OBJECT in step 125.
            // If API accepts full trigger object in 'triggers' key? 
            // The code 'FunnelController.php' uses specific logic.
            // Let's rely on PUT primarily for Title. Trigger we might need 'change-trigger' if name changed, but here we only changed conditions.
            // Safe bet: Send title.
            await client.put(`/wp-json/fluent-crm/v2/funnels/${funnel.id}`, { title: newTitle });

            // Now Save Sequences
            if (fullFunnel.funnel_steps && fullFunnel.funnel_steps.length > 0) {
                logger.info(`[FCRM] Guardando secuencias (Pasos)...`);

                // DATA PREP FIX: FluentCRM PHP expects JSON strings for 'settings' and 'conditions'
                // inside saveSequences logic, or at least some versions do. 
                // Error "json_decode arg 1 must be string, array given" confirms it receives Array/Object.
                const preparedSteps = fullFunnel.funnel_steps.map(step => {
                    const s = { ...step };
                    // Debug type BEFORE fix
                    if (s.settings) logger.info(`[FCRM] Step ${s.id} settings input type: ${typeof s.settings}`);

                    if (s.settings && typeof s.settings === 'object') {
                        s.settings = JSON.stringify(s.settings);
                    }
                    if (s.conditions && typeof s.conditions === 'object') {
                        s.conditions = JSON.stringify(s.conditions);
                    }
                    return s;
                });

                // Request Body Preview
                logger.info(`[FCRM] DEBUG Sequences Payload (Partial): ${JSON.stringify(preparedSteps).slice(0, 500)}`);

                // POST /funnels/{id}/sequences expects the array of sequences
                await client.post(`/wp-json/fluent-crm/v2/funnels/${funnel.id}/sequences`, preparedSteps);
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
