const { getFcrmClient } = require('./fluentcrm');
const logger = require('../utils/logger');

// Retrieve FluentForms client (reusing FCRM config as it's WP REST API)
const getFormsClient = () => {
    return getFcrmClient();
};

/**
 * Tries to recycle a form: Rename and Clear Entries.
 * @param {Object} params
 * @param {string} params.sourceTag - Old Tag (to find form or purely for logging)
 * @param {string} params.newTag - New Tag (for renaming)
 * @param {string|number} [params.formId=203] - Target Form ID
 */
async function recycleForm({ sourceTag, newTag, formId = 203 }) {
    const client = getFormsClient();
    const fid = Number(formId);

    // 0. Find Form Candidate if SourceTag is provided (Dynamic Search logic)
    let candidateId = fid; // Default to provided ID if search fails/empty

    if (sourceTag) {
        try {
            logger.info(`[FORMS] Buscando formulario candidato con tag: "${sourceTag}" y palabra "nacimiento"...`);

            // Mask Auth for logs
            const authH = client.defaults.headers.Authorization ? 'Basic [REDACTED]' : 'MISSING';
            logger.info(`[FORMS] DEBUG Headers Auth: ${authH}`);
            logger.info(`[FORMS] DEBUG: GET /wp-json/fluent-bridge/v1/list-forms?search=${sourceTag}`);

            const searchRes = await client.get('/wp-json/fluent-bridge/v1/list-forms', {
                params: { search: sourceTag }
            });

            if (searchRes.data && searchRes.data.success && Array.isArray(searchRes.data.forms)) {
                const forms = searchRes.data.forms;
                logger.info(`[FORMS] Encontrados ${forms.length} formularios con "${sourceTag}".`);

                // Filter: Must contain "nacimiento" (insensitive)
                const target = forms.find(f => f.title.toLowerCase().includes('nacimiento'));

                if (target) {
                    logger.info(`[FORMS] Candidato Ideal encontrado: ID ${target.id} - "${target.title}"`);
                    candidateId = target.id;
                } else {
                    logger.warn(`[FORMS] Se encontraron formularios con "${sourceTag}" pero ninguno tiene "nacimiento" en el título.`);
                    // Strict safety: If we found forms but none matched the strict criteria, 
                    // it is safer NOT to touch the default form (fid).
                    if (forms.length > 0) {
                        logger.warn(`[FORMS] ⚠️ Fallback SAFETY: NO SE TOCARÁ NINGÚN FORMULARIO.`);
                        return false;
                    }
                }
            } else {
                logger.warn('[FORMS] No se encontraron formularios via Bridge search.');
            }
        } catch (e) {
            logger.warn(`[FORMS] Error buscando formularios: ${e.message}`);
            if (e.response && e.response.status === 403) {
                logger.warn(`[FORMS] ⛔ Acceso Denegado (403) al Bridge Search. Verifica permisos.`);
                // Abort to be safe
                return false;
            }
        }
    }

    // Use found ID
    const finalId = Number(candidateId);
    if (!finalId) {
        logger.warn('[FORMS] No se determinó un ID de formulario válido. Omitiendo.');
        return false;
    }

    logger.info(`[FORMS] Intentando reciclar Formulario ID ${finalId} usando Bridge...`);

    const newTitle = `Formulario de Inscripción (${newTag})`;

    if (process.env.DRY_RUN === 'true') {
        logger.info(`[FORMS] DRY-RUN: Bridge POST /update-form`);
        logger.info(`[FORMS] Payload: { form_id: ${finalId}, title: "${newTitle}", delete_entries: true }`);
        return true;
    }

    try {
        logger.info(`[FORMS] DEBUG: POST /wp-json/fluent-bridge/v1/update-form`);
        const res = await client.post('/wp-json/fluent-bridge/v1/update-form', {
            form_id: finalId,
            title: newTitle,
            delete_entries: true
        });

        if (res.data && res.data.success) {
            logger.info(`[FORMS] ✅ ÉXITO: Formulario ID ${finalId} actualizado.`);
            logger.info(`[FORMS] Título nuevo: "${newTitle}"`);
            logger.info(`[FORMS] Entradas eliminadas: ${res.data.entries_deleted}`);
            return true;
        } else {
            throw new Error(res.data?.message || 'Error desconocido del Bridge');
        }

    } catch (e) {
        if (e.response && e.response.status === 404) {
            logger.warn(`[FORMS] ⚠️ Bridge no encontrado (404). El snippet PHP no está instalado.`);
            logger.warn(`[FORMS] Acción Manual Requerida: Renombrar formulario ID ${finalId} y borrar entradas.`);
        } else if (e.response && e.response.status === 403) {
            logger.warn(`[FORMS] ⛔ Acceso Denegado (403) al Bridge Update.`);
        } else {
            logger.warn(`[FORMS] Error contactando Bridge: ${e.message}`);
        }
        return false;
    }
}

module.exports = {
    recycleForm
};
