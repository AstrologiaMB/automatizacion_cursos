// v2/services/learndash.js
// Integración con WordPress/LearnDash (Multi-Cuenta / Orquestado)

'use strict';

const axios = require('axios');
const logger = require('../../utils/logger');

function base64(str) {
    return Buffer.from(str, 'utf8').toString('base64');
}

function sanitizeSlug(text) {
    if (!text) return '';
    const ascii = String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const slug = ascii.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/-+/g, '-');
    return slug.slice(0, 190);
}

function buildDeterministicLessonSlug(courseSlug) {
    return sanitizeSlug(`${courseSlug}-datos-zoom`);
}

function getWpClient(credentials) {
    if (!credentials || !credentials.baseUrl || !credentials.username || !credentials.appPassword) {
        throw new Error('Faltan credenciales WP inyectadas (baseUrl, username, appPassword)');
    }

    const auth = base64(`${credentials.username}:${credentials.appPassword}`);
    const wpApiBase = credentials.wpApiBase || '/wp-json/wp/v2';
    const ldApiBase = credentials.ldApiBase || '/wp-json/ldlms/v2';

    const client = axios.create({
        baseURL: credentials.baseUrl,
        timeout: 60000,
        headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/json',
            'User-Agent': 'CursosAutomation/2.0',
        },
    });

    // Attach paths for convenience
    client.wpApiBase = wpApiBase;
    client.ldApiBase = ldApiBase;

    return client;
}

async function getCourseByTag({ client, tag }) {
    try {
        const resp = await client.get(`${client.ldApiBase}/sfwd-courses`, {
            params: { search: tag, per_page: 5, status: 'publish' }
        });
        const results = Array.isArray(resp.data) ? resp.data : [];
        const match = results.find(c => c.title.rendered.includes(tag));
        return match || null;
    } catch (e) {
        logger.warn(`[LD] Error buscando curso por tag ${tag}: ${e.message}`);
        return null;
    }
}

async function findLessonForCourse({ client, courseId, title, slug }) {
    const finalSlug = sanitizeSlug(slug);

    if (finalSlug) {
        try {
            const wpResp = await client.get(`${client.wpApiBase}/sfwd-lessons`, {
                params: { slug: finalSlug, per_page: 1 },
            });
            const arr = Array.isArray(wpResp.data) ? wpResp.data : [];
            if (arr.length > 0) {
                const hit = arr[0];
                return { id: hit.id, source: 'wp', data: hit };
            }
        } catch (e) {
            logger.warn(`[LD] No se pudo buscar lección por slug: ${e.message}`);
        }
    }

    try {
        const ldResp = await client.get(`${client.ldApiBase}/sfwd-lessons`, {
            params: { search: title, per_page: 20 },
        });
        const arr = Array.isArray(ldResp.data) ? ldResp.data : [];
        const normalized = String(title).trim().toLowerCase();
        const exacts = arr.filter((l) => (l.title?.rendered || l.post_title || '').trim().toLowerCase() === normalized);

        if (exacts.length > 0) {
            const withMeta = exacts.find((l) => {
                const meta = l.meta || {};
                return meta.course_id === courseId || meta.associated_course === courseId || meta._ld_lesson_settings?.associated_course === courseId;
            });
            if (withMeta) return { id: withMeta.id, source: 'ld', data: withMeta };
            return { id: exacts[0].id, source: 'ld', data: exacts[0] };
        }
    } catch (e) {
        logger.warn(`[LD] No se pudo buscar lección por título: ${e.message}`);
    }

    return null;
}

function buildLesson1Content(input, courseConfig, icsUrl) {
    const courseTitle = courseConfig?.meta?.title || input?.nombreBase || 'Curso';
    const slug = courseConfig?.meta?.slug || sanitizeSlug(courseTitle);

    const zoom = courseConfig?.integrations?.zoom || {};
    const tad = courseConfig?.integrations?.timeanddate || { converterUrls: [], tableHtml: '' };

    const schedule = courseConfig?.schedule || {};
    const tipo = schedule?.type || input?.tipoReunion || 'individual';
    const count = schedule?.count || input?.cantidadEncuentros || 1;
    const startDate = schedule?.startDate || input?.fechaInicio || '';
    const startTime = schedule?.time || input?.horaInicio || '';
    const duration = schedule?.durationMin || input?.duracionMinutos || '';

    const converterList = Array.isArray(tad.converterUrls) ? tad.converterUrls : [];

    const marker = `<!-- AUTOGEN:LEARNDASH:course-slug=${slug};tag=${input?.tagCurso || ''} -->`;

    let html = '';
    html += `${marker}\n`;
    html += `<h2>${courseTitle} — Datos de conexión</h2>\n`;

    html += '<div style="background:#f4f6f8;border:1px solid #e0e6eb;border-radius:6px;padding:12px;margin:16px 0;">\n';
    html += '  <h3>Acceso a la reunión (Zoom)</h3>\n';
    if (zoom.joinUrl) {
        html += `  <p><strong>Enlace de acceso:</strong> <a href="${zoom.joinUrl}" target="_blank" rel="noopener">${zoom.joinUrl}</a></p>\n`;
    }
    if (zoom.meetingId) {
        html += `  <p><strong>ID de reunión:</strong> ${zoom.meetingId}</p>\n`;
    }
    if (zoom.password) {
        html += `  <p><strong>Contraseña:</strong> ${zoom.password}</p>\n`;
    }
    html += '</div>\n';

    if (icsUrl) {
        html += '<div style="margin: 20px 0; padding: 15px; border: 1px solid #cce5ff; background-color: #d4edda; border-radius: 5px;">\n';
        html += `  <a href="${icsUrl}" class="button" style="background-color: #28a745; color: white; padding: 10px 15px; text-decoration: none; border-radius: 5px; font-weight: bold;">📅 Descargar Calendario (.ics)</a>\n`;
        html += '  <p style="margin-top: 10px; font-size: 0.9em; color: #555;">\n    <strong>Importante:</strong> Descarga este archivo y ábrelo para agendar todos los encuentros automáticamente en tu calendario.\n  </p>\n</div>\n';
    }

    html += '<h3>Horario y duración</h3>\n<ul>\n';
    if (startDate) html += `  <li><strong>Fecha de inicio (BA):</strong> ${startDate}</li>\n`;
    if (startTime) html += `  <li><strong>Hora de inicio (BA):</strong> ${startTime}</li>\n`;
    if (duration) html += `  <li><strong>Duración:</strong> ${duration} minutos</li>\n`;
    html += `  <li><strong>Tipo:</strong> ${tipo}${tipo === 'recurrente' ? ` • Encuentros: ${count}` : ''}</li>\n</ul>\n`;

    if (tad.tableHtml) {
        html += '<h3>Horarios por ciudad</h3>\n' + tad.tableHtml;
    }

    if (converterList.length > 0) {
        html += '<h3>Conversor de horario por encuentro</h3>\n<ol>\n';
        converterList.forEach((u, idx) => html += `  <li><a href="${u}" target="_blank" rel="noopener">Encuentro ${idx + 1} — Ver en tu ciudad</a></li>\n`);
        html += '</ol>\n';
    }

    if (input?.incluirForo) html += '<p><em>Nota:</em> El foro del curso estará habilitado en la plataforma.</p>\n';
    if (input?.incluirFormulario) html += '<p><em>Nota:</em> Recibirás un formulario previo para conocerte mejor.</p>\n';

    return html;
}

// Orquestador inyecta icsUrl, ya no lo generamos acá
async function ensureLesson1({ credentials, courseId, title, contentHtml, courseSlug, courseConfig, input, icsUrl }) {
    const client = getWpClient(credentials);

    // Re-renderizamos el HTML con la URL del ICS
    if (icsUrl && courseConfig && input) {
        contentHtml = buildLesson1Content(input, courseConfig, icsUrl);
    }

    const desiredSlug = buildDeterministicLessonSlug(courseSlug || title);
    const found = await findLessonForCourse({ client, courseId, title, slug: desiredSlug });

    const payloadBase = {
        title,
        content: contentHtml,
        status: 'publish',
        course: courseId,
        meta: {
            course_id: courseId,
            _ld_lesson_settings: { associated_course: courseId },
        },
    };

    if (found) {
        const resp = await client.put(`${client.ldApiBase}/sfwd-lessons/${found.id}`, payloadBase);
        logger.info(`[LD] Lección actualizada (ID=${found.id}).`);
        return { lessonId: found.id, wasCreated: false, wasUpdated: true, icsUrl };
    }

    const createPayload = { ...payloadBase, slug: desiredSlug };
    const resp = await client.post(`${client.ldApiBase}/sfwd-lessons`, createPayload);
    logger.info(`[LD] Lección creada (ID=${resp.data?.id}).`);
    return { lessonId: resp.data?.id, wasCreated: true, wasUpdated: false, icsUrl };
}

async function ensureLessonAssignedToCourse({ credentials, courseId, lessonId, usePlugin = true }) {
    const client = getWpClient(credentials);

    if (usePlugin) {
        try {
            const resp = await client.post('/wp-json/ld-automation/v1/assign-step', {
                course_id: courseId, step_id: lessonId, step_type: 'sfwd-lessons', step_parent_id: 0,
            });
            if (resp.status === 200 || resp.status === 201) return { ok: true, method: 'plugin' };
        } catch (e) {
            logger.warn(`[LD] Plugin ld-automation preferido falló: ${e.message}`);
        }
    }

    try {
        const resp = await client.post(`${client.ldApiBase}/course-steps`, {
            course_id: courseId, step_id: lessonId, step_type: 'sfwd-lessons', step_parent_id: 0,
        });
        return { ok: true, method: 'generic' };
    } catch (e) {
        if (e.response?.status === 409) return { ok: true, already: true, method: 'generic' };
        logger.warn(`[LD] Falla asignando con endpoint genérico: ${e.message}`);
    }
    return { ok: false };
}

module.exports = {
    getWpClient,
    getCourseByTag,
    ensureLesson1,
    ensureLessonAssignedToCourse,
    buildLesson1Content
};
