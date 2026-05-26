// v2/services/wp-media.js
'use strict';

const logger = require('../../utils/logger');
const { getWpClient } = require('./learndash');

/**
 * Uploads a file to WP Media Library
 */
async function uploadMedia(content, filename, mimeType = 'text/calendar', wpCredentials) {
    try {
        const client = getWpClient(wpCredentials);

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
