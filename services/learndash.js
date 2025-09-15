// services/learndash.js
// Integración con WordPress/LearnDash (CommonJS)

'use strict';

const axios = require('axios');
const logger = require('../utils/logger');
const { getWpConfig } = require('./config');

// Utils
function base64(str) {
  return Buffer.from(str, 'utf8').toString('base64');
}

function hasWpCreds(cfg) {
  return Boolean(cfg.baseUrl && cfg.username && cfg.appPassword);
}

function sanitizeSlug(text) {
  if (!text) return '';
  const ascii = String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const slug = ascii
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // non-alnum -> dash
    .replace(/^-+|-+$/g, '') // trim dashes
    .replace(/-+/g, '-'); // collapse
  // WordPress allows long slugs but we'll be conservative
  return slug.slice(0, 190);
}

function buildDeterministicLessonSlug(courseSlug) {
  return sanitizeSlug(`${courseSlug}-datos-zoom`);
}

function getWpClient() {
  const cfg = getWpConfig();
  if (!hasWpCreds(cfg)) {
    throw new Error('Faltan credenciales WP en .env (WP_BASE_URL, WP_USER, WP_APP_PASSWORD)');
  }

  const auth = base64(`${cfg.username}:${cfg.appPassword}`);

  return axios.create({
    baseURL: cfg.baseUrl,
    timeout: 20000,
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
      'User-Agent': 'CursosAutomation/1.0',
    },
  });
}

async function findCourseBySlugOrTitle({ client, slug, title }) {
  const cfg = getWpConfig();

  // 1) Buscar por slug en WP API (wp/v2)
  try {
    const wpResp = await client.get(`${cfg.wpApiBase}/sfwd-courses`, {
      params: { slug, per_page: 1 },
    });
    const arr = Array.isArray(wpResp.data) ? wpResp.data : [];
    if (arr.length > 0) {
      const hit = arr[0];
      return { id: hit.id, source: 'wp', data: hit };
    }
  } catch (e) {
    logger.warn(`[LD] No se pudo buscar curso por slug en WP API: ${e.response?.status || e.message}`);
  }

  // 2) Buscar por título en LearnDash API (ldlms/v2)
  try {
    const ldResp = await client.get(`${cfg.ldApiBase}/sfwd-courses`, {
      params: { search: title, per_page: 20 },
    });
    const arr = Array.isArray(ldResp.data) ? ldResp.data : [];
    const exact = arr.find((c) => {
      const t = (c.title?.rendered || c.post_title || '').trim().toLowerCase();
      return t === String(title).trim().toLowerCase();
    });
    if (exact) {
      return { id: exact.id, source: 'ld', data: exact };
    }
  } catch (e) {
    logger.warn(`[LD] No se pudo buscar curso por título en LD API: ${e.response?.status || e.message}`);
  }

  return null;
}

async function ensureCourse({ title, slug, existingCourseFlag, description }) {
  const client = getWpClient();
  const cfg = getWpConfig();
  const finalSlug = sanitizeSlug(slug) || sanitizeSlug(title);

  const found = await findCourseBySlugOrTitle({ client, slug: finalSlug, title });

  const payload = {
    title,
    content: description || '',
    status: 'publish',
    excerpt: description || '',
    meta: {
    // Forma “nueva” de LD (objeto de settings)
    _ld_course_settings:{
    course_price_type: 'closed',
    },
    // Forma “plana” (algunos sitios la requieren)
    _ld_course_price_type: 'closed',
    _ld_price_type: 'closed',
    course_price_type: 'closed',
   },
   };

  if (found && existingCourseFlag === true) {
    try {
      const resp = await client.put(`${cfg.ldApiBase}/sfwd-courses/${found.id}`, payload);
      logger.info(`[LD] Curso actualizado (ID=${found.id}).`);
      // Refuerzo: algunos sitios requieren un segundo guardado sólo con meta para fijar price_type
      try {
        const metaClosed = {
          meta: {
            _ld_course_settings: { course_price_type: 'closed' },
            _ld_course_price_type: 'closed',
            _ld_price_type: 'closed',
            course_price_type: 'closed',
          },
        };
        await client.put(`${cfg.ldApiBase}/sfwd-courses/${found.id}`, metaClosed);
        logger.info('[LD] Refuerzo de price_type=closed aplicado tras actualización.');
      } catch (eMeta) {
        logger.warn(`[LD] Refuerzo price_type falló: ${eMeta.response?.status || eMeta.message}`);
      }
      // Ajuste definitivo vía plugin: usar API nativa de LearnDash
      try {
        await client.post('/wp-json/ld-automation/v1/set-course-setting', {
          course_id: found.id,
          key: 'course_price_type',
          value: 'closed',
        });
        logger.info('[LD] Ajuste de course_price_type=closed aplicado vía plugin.');
      } catch (eSet) {
        logger.warn(`[LD] Plugin set-course-setting falló: ${eSet.response?.status || eSet.message}`);
      }
      return { courseId: found.id, wasCreated: false, wasUpdated: true };
    } catch (e) {
      logger.error(`[LD] Error actualizando curso ${found.id}: ${e.response?.status} ${e.response?.data?.message || e.message}`);
      throw e;
    }
  }

  if (found && existingCourseFlag === false) {
    // Idempotencia: si existe con el mismo slug, actualizamos en vez de crear duplicado
    logger.warn('[LD] Curso con el mismo slug ya existe. Se actualizará para mantener idempotencia.');
    try {
      const resp = await client.put(`${cfg.ldApiBase}/sfwd-courses/${found.id}`, payload);
      logger.info(`[LD] Curso actualizado (ID=${found.id}).`);
      // Refuerzo: algunos sitios requieren un segundo guardado sólo con meta para fijar price_type
      try {
        const metaClosed = {
          meta: {
            _ld_course_settings: { course_price_type: 'closed' },
            _ld_course_price_type: 'closed',
            _ld_price_type: 'closed',
            course_price_type: 'closed',
          },
        };
        await client.put(`${cfg.ldApiBase}/sfwd-courses/${found.id}`, metaClosed);
        logger.info('[LD] Refuerzo de price_type=closed aplicado tras actualización.');
      } catch (eMeta) {
        logger.warn(`[LD] Refuerzo price_type falló: ${eMeta.response?.status || eMeta.message}`);
      }
      // Ajuste definitivo vía plugin: usar API nativa de LearnDash
      try {
        await client.post('/wp-json/ld-automation/v1/set-course-setting', {
          course_id: found.id,
          key: 'course_price_type',
          value: 'closed',
        });
        logger.info('[LD] Ajuste de course_price_type=closed aplicado vía plugin.');
      } catch (eSet) {
        logger.warn(`[LD] Plugin set-course-setting falló: ${eSet.response?.status || eSet.message}`);
      }
      return { courseId: found.id, wasCreated: false, wasUpdated: true };
    } catch (e) {
      logger.error(`[LD] Error actualizando curso existente ${found.id}: ${e.response?.status} ${e.response?.data?.message || e.message}`);
      throw e;
    }
  }

  // Crear nuevo curso
  try {
    const payloadCreate = { ...payload, slug: finalSlug };
    const resp = await client.post(`${cfg.ldApiBase}/sfwd-courses`, payloadCreate);
    const id = resp.data?.id;
    logger.info(`[LD] Curso creado (ID=${id}).`);
    // Refuerzo: segundo PUT sólo con meta para fijar price_type en instalaciones que lo resetean en el primer guardado
    try {
      const metaClosed = {
        meta: {
          _ld_course_settings: { course_price_type: 'closed' },
          _ld_course_price_type: 'closed',
          _ld_price_type: 'closed',
          course_price_type: 'closed',
        },
      };
      await client.put(`${cfg.ldApiBase}/sfwd-courses/${id}`, metaClosed);
      logger.info('[LD] Refuerzo de price_type=closed aplicado tras creación.');
    } catch (eMeta) {
      logger.warn(`[LD] Refuerzo price_type post-creación falló: ${eMeta.response?.status || eMeta.message}`);
    }
    // Ajuste definitivo vía plugin: usar API nativa de LearnDash
    try {
      await client.post('/wp-json/ld-automation/v1/set-course-setting', {
        course_id: id,
        key: 'course_price_type',
        value: 'closed',
      });
      logger.info('[LD] Ajuste de course_price_type=closed aplicado vía plugin (post-creación).');
    } catch (eSet) {
      logger.warn(`[LD] Plugin set-course-setting post-creación falló: ${eSet.response?.status || eSet.message}`);
    }
    return { courseId: id, wasCreated: true, wasUpdated: false };
  } catch (e) {
    logger.error(`[LD] Error creando curso: ${e.response?.status} ${e.response?.data?.message || e.message}`);
    throw e;
  }
}

async function findLessonForCourse({ client, courseId, title, slug }) {
  const cfg = getWpConfig();
  const finalSlug = sanitizeSlug(slug);

  // 1) Intentar por slug en WP API
  if (finalSlug) {
    try {
      const wpResp = await client.get(`${cfg.wpApiBase}/sfwd-lessons`, {
        params: { slug: finalSlug, per_page: 1 },
      });
      const arr = Array.isArray(wpResp.data) ? wpResp.data : [];
      if (arr.length > 0) {
        const hit = arr[0];
        // Verificar asociación si viene en meta (no siempre viene)
        return { id: hit.id, source: 'wp', data: hit };
      }
    } catch (e) {
      logger.warn(`[LD] No se pudo buscar lección por slug en WP API: ${e.response?.status || e.message}`);
    }
  }

  // 2) Buscar por título en LearnDash API
  try {
    const ldResp = await client.get(`${cfg.ldApiBase}/sfwd-lessons`, {
      params: { search: title, per_page: 20 },
    });
    const arr = Array.isArray(ldResp.data) ? ldResp.data : [];
    // Mejor esfuerzo: exact match por título y (si está) asociado al curso
    const normalized = String(title).trim().toLowerCase();
    const exacts = arr.filter((l) => (l.title?.rendered || l.post_title || '').trim().toLowerCase() === normalized);
    if (exacts.length > 0) {
      // Priorizar el que tenga meta de asociación
      const withMeta = exacts.find((l) => {
        const meta = l.meta || {};
        return meta.course_id === courseId || meta.associated_course === courseId || meta._ld_lesson_settings?.associated_course === courseId;
      });
      if (withMeta) return { id: withMeta.id, source: 'ld', data: withMeta };
      return { id: exacts[0].id, source: 'ld', data: exacts[0] };
    }
  } catch (e) {
    logger.warn(`[LD] No se pudo buscar lección por título en LD API: ${e.response?.status || e.message}`);
  }

  return null;
}

async function ensureLesson1({ courseId, title, contentHtml, courseSlug }) {
  const client = getWpClient();
  const cfg = getWpConfig();

  const desiredSlug = buildDeterministicLessonSlug(courseSlug || title);
  const found = await findLessonForCourse({ client, courseId, title, slug: desiredSlug });

  const payloadBase = {
    title,
    content: contentHtml,
    status: 'publish',
    course: courseId,
    meta: {
      course_id: courseId,
      _ld_lesson_settings: {
        associated_course: courseId,
      },
    },
  };

  if (found) {
    try {
      const resp = await client.put(`${cfg.ldApiBase}/sfwd-lessons/${found.id}`, payloadBase);
      logger.info(`[LD] Lección actualizada (ID=${found.id}).`);
      // Asegurar que la lección quede asignada al curso (Course Steps)
      await ensureLessonAssignedToCourse({ courseId, lessonId: found.id });
      return { lessonId: found.id, wasCreated: false, wasUpdated: true };
    } catch (e) {
      logger.error(`[LD] Error actualizando lección ${found.id}: ${e.response?.status} ${e.response?.data?.message || e.message}`);
      throw e;
    }
  }

  // Crear
  try {
    const createPayload = { ...payloadBase, slug: desiredSlug };
    const resp = await client.post(`${cfg.ldApiBase}/sfwd-lessons`, createPayload);
    const id = resp.data?.id;
    logger.info(`[LD] Lección creada (ID=${id}).`);
    // Asegurar que la lección quede asignada al curso (Course Steps)
    await ensureLessonAssignedToCourse({ courseId, lessonId: id });
    return { lessonId: id, wasCreated: true, wasUpdated: false };
  } catch (e) {
    logger.error(`[LD] Error creando lección: ${e.response?.status} ${e.response?.data?.message || e.message}`);
    throw e;
  }
}

function buildLesson1Content(input, courseConfig) {
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

  // Marcador para futuras actualizaciones idempotentes
  const marker = `<!-- AUTOGEN:LEARNDASH:course-slug=${slug};tag=${input?.tagCurso || ''} -->`;

  let html = '';
  html += `${marker}\n`;
  html += `<h2>${courseTitle} — Datos de conexión</h2>\n`;

  // Datos Zoom
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

  // Horario
  html += '<h3>Horario y duración</h3>\n';
  html += '<ul>\n';
  if (startDate) html += `  <li><strong>Fecha de inicio (BA):</strong> ${startDate}</li>\n`;
  if (startTime) html += `  <li><strong>Hora de inicio (BA):</strong> ${startTime}</li>\n`;
  if (duration) html += `  <li><strong>Duración:</strong> ${duration} minutos</li>\n`;
  html += `  <li><strong>Tipo:</strong> ${tipo}${tipo === 'recurrente' ? ` • Encuentros: ${count}` : ''}</li>\n`;
  html += '</ul>\n';

  // Tabla horarios por ciudad
  if (tad.tableHtml) {
    html += '<h3>Horarios por ciudad</h3>\n';
    html += tad.tableHtml;
  }

  // Enlaces de conversión
  if (converterList.length > 0) {
    html += '<h3>Conversor de horario por encuentro</h3>\n';
    html += '<ol>\n';
    converterList.forEach((u, idx) => {
      const n = idx + 1;
      html += `  <li><a href="${u}" target="_blank" rel="noopener">Encuentro ${n} — Ver en tu ciudad</a></li>\n`;
    });
    html += '</ol>\n';
  }

  // Notas opcionales
  if (input?.incluirForo) {
    html += '<p><em>Nota:</em> El foro del curso estará habilitado en la plataforma.</p>\n';
  }
  if (input?.incluirFormulario) {
    html += '<p><em>Nota:</em> Recibirás un formulario previo para conocerte mejor.</p>\n';
  }

  return html;
}

async function ensureLessonAssignedToCourse({ courseId, lessonId }) {
  const client = getWpClient();
  const cfg = getWpConfig();

  // 0) Prefer plugin first if USE_LD_PLUGIN=true
  try {
    const usePluginFirst = String(process.env.USE_LD_PLUGIN || '').toLowerCase() === 'true';
    if (usePluginFirst) {
      const bodyP0 = {
        course_id: courseId,
        step_id: lessonId,
        step_type: 'sfwd-lessons',
        step_parent_id: 0,
      };
      const respP0 = await client.post('/wp-json/ld-automation/v1/assign-step', bodyP0);
      const codeP0 = respP0.status || 200;
      if (codeP0 === 200 || codeP0 === 201) {
        logger.info('[LD] Lección asignada al curso vía plugin ld-automation (preferido por USE_LD_PLUGIN).');
        return { ok: true, method: 'plugin-first' };
      }
    }
  } catch (eP0) {
    logger.warn(`[LD] Plugin ld-automation preferido falló o no disponible: ${eP0.response?.status || eP0.message}`);
  }

  // 1) Endpoint genérico (preferido)
  try {
    const body = {
      course_id: courseId,
      step_id: lessonId,
      step_type: 'sfwd-lessons',
      step_parent_id: 0,
    };
    const resp = await client.post(`${cfg.ldApiBase}/course-steps`, body);
    const code = resp.status || 200;
    if (code === 200 || code === 201) {
      logger.info(`[LD] Lección asignada al curso (course_id=${courseId}, lesson_id=${lessonId}).`);
      return { ok: true, method: 'generic' };
    }
  } catch (e) {
    const code = e.response?.status;
    if (code === 409) {
      logger.info('[LD] La lección ya estaba asignada al curso (idempotente).');
      return { ok: true, already: true, method: 'generic' };
    }
    logger.warn(`[LD] Falla asignando con endpoint genérico: ${code || e.message}`);
  }

  // 2) Fallback con ruta jerárquica
  try {
    const resp2 = await client.post(`${cfg.ldApiBase}/course-steps/${courseId}/sfwd-lessons/${lessonId}`);
    const code2 = resp2.status || 200;
    if (code2 === 200 || code2 === 201) {
      logger.info(`[LD] Lección asignada al curso vía fallback (course_id=${courseId}, lesson_id=${lessonId}).`);
      return { ok: true, method: 'path' };
    }
  } catch (e2) {
    const code = e2.response?.status;
    if (code === 409) {
      logger.info('[LD] La lección ya estaba asignada al curso (idempotente) [fallback].');
      return { ok: true, already: true, method: 'path' };
    }
    logger.warn(`[LD] Falla asignando con ruta jerárquica: ${code || e2.message}`);
  }

  // 3) Endpoint del curso con body steps
  try {
    const body3 = {
      steps: [
        { step_id: lessonId, step_type: 'sfwd-lessons', step_parent_id: 0 },
      ],
    };
    const resp3 = await client.post(`${cfg.ldApiBase}/course-steps/${courseId}`, body3);
    const code3 = resp3.status || 200;
    if (code3 === 200 || code3 === 201) {
      logger.info(`[LD] Lección asignada al curso vía endpoint de curso (course_id=${courseId}, lesson_id=${lessonId}).`);
      return { ok: true, method: 'course-steps-course' };
    }
  } catch (e3) {
    const code = e3.response?.status;
    if (code === 409) {
      logger.info('[LD] La lección ya estaba asignada al curso (idempotente) [endpoint curso].');
      return { ok: true, already: true, method: 'course-steps-course' };
    }
    logger.warn(`[LD] Falla asignando con endpoint de curso: ${code || e3.message}`);
  }

  // 4) Refuerzo: actualizar lección con campo "course" y reintentar 3)
  try {
    const updateLesson = {
      course: courseId,
      menu_order: 0,
      meta: {
        course_id: courseId,
        _ld_lesson_settings: {
          associated_course: courseId,
        },
      },
    };
    await client.put(`${cfg.ldApiBase}/sfwd-lessons/${lessonId}`, updateLesson);
    try {
      const body3 = {
        steps: [
          { step_id: lessonId, step_type: 'sfwd-lessons', step_parent_id: 0 },
        ],
      };
      const resp3b = await client.post(`${cfg.ldApiBase}/course-steps/${courseId}`, body3);
      const code3b = resp3b.status || 200;
      if (code3b === 200 || code3b === 201) {
        logger.info('[LD] Lección asignada al curso tras refuerzo (update lesson + endpoint curso).');
        return { ok: true, method: 'course-steps-course-after-lesson-update' };
      }
    } catch (e3b) {
      const code = e3b.response?.status;
      if (code === 409) {
        logger.info('[LD] La lección ya estaba asignada al curso (idempotente) tras refuerzo.');
        return { ok: true, already: true, method: 'course-steps-course-after-lesson-update' };
      }
      logger.warn(`[LD] Falla reintento endpoint de curso tras refuerzo: ${code || e3b.message}`);
    }
  } catch (eUpd) {
    logger.warn(`[LD] Falla actualizando lección con campo course: ${eUpd.response?.status || eUpd.message}`);
  }

  // 5) Fallback vía plugin ld-automation (usa funciones internas del Builder)
  try {
    const bodyP = {
      course_id: courseId,
      step_id: lessonId,
      step_type: 'sfwd-lessons',
      step_parent_id: 0,
    };
    const respP = await client.post('/wp-json/ld-automation/v1/assign-step', bodyP);
    const codeP = respP.status || 200;
    if (codeP === 200 || codeP === 201) {
      logger.info('[LD] Lección asignada al curso vía plugin ld-automation.');
      return { ok: true, method: 'plugin' };
    }
  } catch (eP) {
    logger.warn(`[LD] Falla asignando con plugin ld-automation: ${eP.response?.status || eP.message}`);
  }

  return { ok: false };
}

async function ensureExistingCourseByTag({ tagOrSlug }) {
  const client = getWpClient();
  const tag = String(tagOrSlug || '').toLowerCase().trim();
  const cfg = getWpConfig();

  // 1) Buscar por título en LearnDash API con search=<tag>
  try {
    const ldResp = await client.get(`${cfg.ldApiBase}/sfwd-courses`, {
      params: { search: tag, per_page: 50 },
    });
    const arr = Array.isArray(ldResp.data) ? ldResp.data : [];
    if (arr.length > 0) {
      // Prioridad 1: título empieza con "Copy of " y contiene el tag
      const startsWithCopy = arr.find((c) => {
        const t = (c.title?.rendered || c.post_title || '').toLowerCase();
        return t.startsWith('copy of ') && t.includes(tag);
      });
      if (startsWithCopy) {
        return { courseId: startsWithCopy.id };
      }
      // Prioridad 2: cualquier título que contenga el tag
      const containsTag = arr.find((c) => {
        const t = (c.title?.rendered || c.post_title || '').toLowerCase();
        return t.includes(tag);
      });
      if (containsTag) {
        return { courseId: containsTag.id };
      }
    }
  } catch (e) {
    logger.warn(`[LD] Búsqueda por título (search=${tag}) falló: ${e.response?.status || e.message}`);
  }

  // 2) Fallback: buscar por slug exacto (wp/v2) o por título exacto = tag
  const slug = sanitizeSlug(tag);
  const found = await findCourseBySlugOrTitle({ client, slug, title: slug });
  if (!found || !found.id) {
    throw new Error(`[LD] Curso no encontrado para tag="${tag}".`);
  }
  return { courseId: found.id };
}

/**
 * Fuerza Course Price Type = 'closed' usando el endpoint del plugin (API nativa LD).
 * Idempotente y no bloqueante.
 */
async function enforceCourseClosed({ courseId }) {
  const client = getWpClient();
  try {
    await client.post('/wp-json/ld-automation/v1/set-course-setting', {
      course_id: courseId,
      key: 'course_price_type',
      value: 'closed',
    });
    logger.info('[LD] course_price_type=closed aplicado vía plugin (enforceCourseClosed).');
  } catch (eSet) {
    logger.warn(`[LD] Plugin set-course-setting falló (enforceCourseClosed): ${eSet.response?.status || eSet.message}`);
  }
}

/**
 * Renombra un curso existente (title y, opcionalmente, slug).
 * Idempotente: si ya coincide, LD devolverá 200/OK sin cambios relevantes.
 */
async function renameCourseTitle({ courseId, newTitle, newSlug }) {
  const client = getWpClient();
  const cfg = getWpConfig();
  const payload = {
    title: String(newTitle || '').trim(),
  };
  if (newSlug) {
    payload.slug = sanitizeSlug(String(newSlug).toLowerCase());
  }
  try {
    await client.put(`${cfg.ldApiBase}/sfwd-courses/${courseId}`, payload);
    logger.info(`[LD] Curso renombrado (ID=${courseId}) → title="${payload.title}"${payload.slug ? `, slug="${payload.slug}"` : ''}.`);
  } catch (e) {
    logger.warn(`[LD] No se pudo renombrar curso ${courseId}: ${e.response?.status || e.message}`);
  }
}

module.exports = {
  getWpClient,
  ensureCourse,
  ensureLesson1,
  ensureLessonAssignedToCourse,
  buildLesson1Content,
  ensureExistingCourseByTag,
  enforceCourseClosed,
  renameCourseTitle,
};
