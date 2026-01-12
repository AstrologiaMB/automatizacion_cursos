// services/wp-media.js
'use strict';

const logger = require('../utils/logger');
const { getWpClient } = require('./learndash'); // Reutilizamos el cliente configurado (axios + auth)

/**
 * Uploads a file to WP Media Library
 * @param {string|Buffer} content - File content
 * @param {string} filename - e.g. "calendario-curso.ics"
 * @param {string} mimeType - e.g. "text/calendar"
 * @returns {Promise<string|null>} Public URL of the uploaded file or null
 */
async function uploadMedia(content, filename, mimeType = 'text/calendar') {
    try {
        const client = getWpClient();

        // WP REST API Media endpoint
        // Requires header: Content-Disposition: attachment; filename="..."

        const resp = await client.post('/wp-json/wp/v2/media', content, {
            headers: {
                'Content-Type': mimeType,
                'Content-Disposition': `attachment; filename="${filename}"`
            }
        });

        if (resp.status === 201 || resp.status === 200) {
            const sourceUrl = resp.data.source_url;
            logger.info(`[WP-MEDIA] Archivo subido exitosamente: ${filename}`);
            return sourceUrl;
        }

        logger.warn(`[WP-MEDIA] Respuesta inesperada al subir: ${resp.status}`);
        return null;
    } catch (e) {
        logger.error(`[WP-MEDIA] Error subiendo archivo ${filename}: ${e.response?.status} ${e.response?.data?.message || e.message}`);
        return null;
    }
}

module.exports = {
    uploadMedia
};
