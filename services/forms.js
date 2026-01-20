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

    logger.info(`[FORMS] Intentando reciclar Formulario ID ${fid} usando Bridge...`);

    // 1. Calculate New Title Logic (We need to guess or pass it blindly? 
    // Ideally we fetch current title to replace ID. But fetches might be 403?
    // Let's assume the Bridge handles replacement logic? No, PHP snippet expects "title".
    // Strategy: Try to fetch title via Bridge? No, Bridge is simple.
    // Strategy: We can't know current title without fetching. 
    // BUT: The native API /forms/{id} is 403.
    // So we can blindly set a normalized title if we knew it.
    // "Formulario Inscripción [TAG]"
    // Or we ask the user in input.js? Too complex.
    // BEST EFFORT: Construct a generic title or try to use bridge to fetch?
    // Let's update PHP snippet to support "replace_tag" pattern if we want.
    // OR: Just set it to "Formulario de Inscripción (TAG)"
    const newTitle = `Formulario de Inscripción (${newTag})`;

    if (process.env.DRY_RUN === 'true') {
        logger.info(`[FORMS] DRY-RUN: Bridge POST /update-form`);
        logger.info(`[FORMS] Payload: { form_id: ${fid}, title: "${newTitle}", delete_entries: true }`);
        return true;
    }

    try {
        const res = await client.post('/wp-json/fluent-bridge/v1/update-form', {
            form_id: fid,
            title: newTitle,
            delete_entries: true
        });

        if (res.data && res.data.success) {
            logger.info(`[FORMS] ✅ ÉXITO: Formulario ID ${fid} actualizado.`);
            logger.info(`[FORMS] Título nuevo: "${newTitle}"`);
            logger.info(`[FORMS] Entradas eliminadas: ${res.data.entries_deleted}`);
            return true;
        } else {
            throw new Error(res.data?.message || 'Error desconocido del Bridge');
        }

    } catch (e) {
        if (e.response && e.response.status === 404) {
            logger.warn(`[FORMS] ⚠️ Bridge no encontrado (404). El snippet PHP no está instalado.`);
            logger.warn(`[FORMS] Acción Manual Requerida: Renombrar formulario ID ${fid} y borrar entradas.`);
        } else if (e.response && e.response.status === 403) {
            logger.warn(`[FORMS] ⛔ Acceso Denegado (403) al Bridge. Verifica permisos de usuario.`);
        } else {
            logger.warn(`[FORMS] Error contactando Bridge: ${e.message}`);
        }
        return false;
    }
}

module.exports = {
    recycleForm
};
