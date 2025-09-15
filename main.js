// main.js
// Orquestador: invoca el Módulo INPUT, construye template de curso y (si hay credenciales) crea reunión Zoom

'use strict';

const logger = require('./utils/logger');
const { getInputData } = require('./modulos/input');
const { buildCourseConfig } = require('./templates/course-template');
const { createMeetingFromInput } = require('./services/zoom');
const {
  buildOccurrencesFromZoom,
  buildOccurrencesBA,
  buildConverterUrlsPerOccurrence,
  convertToCities,
  buildScheduleTableHtml,
} = require('./services/timeanddate');
const { ensureCourse, ensureLesson1, buildLesson1Content, ensureLessonAssignedToCourse, ensureExistingCourseByTag, enforceCourseClosed, renameCourseTitle } = require('./services/learndash');
const { ensureTagFromCode, ensureListFromCode } = require('./services/fluentcrm');
const { getZoomConfig, DEFAULT_TIMEZONE, getWpConfig, getFcrmConfig } = require('./services/config');
const { updateWooProductByInput } = require('./services/woocommerce');

function hasZoomCreds(cfg) {
  return Boolean(cfg.accountId && cfg.clientId && cfg.clientSecret && cfg.hostEmail);
}

async function main() {
  try {
    // Modo no interactivo opcional vía variable de entorno (para pruebas/CI)
    // NON_INTERACTIVE_JSON debe contener el objeto defaults en JSON.
    const nonInteractiveJson = process.env.NON_INTERACTIVE_JSON;

    const input = await getInputData(
      nonInteractiveJson
        ? { interactive: false, defaults: JSON.parse(nonInteractiveJson) }
        : { interactive: true }
    );

    if (!input) {
      logger.warn('[MAIN] Proceso cancelado por el usuario.');
      return;
    }

    logger.info('[MAIN] Datos INPUT validados. Construyendo configuración base de curso...');
    const courseConfig = buildCourseConfig(input);

    // Intentar crear reunión Zoom solo si hay credenciales completas
    const zoomCfg = getZoomConfig();
    let zoomResult = null;
    if (hasZoomCreds(zoomCfg)) {
      logger.info('[MAIN] Credenciales Zoom detectadas. Creando reunión...');
      try {
        const z = await createMeetingFromInput(input);
        zoomResult = z;
        courseConfig.integrations.zoom.meetingId = z.meetingId || null;
        courseConfig.integrations.zoom.joinUrl = z.joinUrl || null;
        courseConfig.integrations.zoom.startUrl = z.startUrl || null;
        courseConfig.integrations.zoom.password = z.password || null;
        if (z.occurrences) {
          courseConfig.integrations.zoom.occurrences = z.occurrences;
        }
        logger.info('[MAIN] Reunión Zoom creada.');
      } catch (e) {
        logger.error('[MAIN] Falló la creación de la reunión Zoom:', e && e.message ? e.message : e);
        // Continuamos sin Zoom para no interrumpir todo el flujo
      }
    } else {
      logger.warn('[MAIN] Credenciales Zoom no configuradas (.env). Omitiendo creación de reunión.');
    }

    // Generar URLs y tabla TimeAndDate
    try {
      const tz = zoomCfg.defaults?.timezone || DEFAULT_TIMEZONE;
      let occsBA;
      if (zoomResult && Array.isArray(zoomResult.occurrences) && zoomResult.occurrences.length) {
        occsBA = buildOccurrencesFromZoom(zoomResult.occurrences, tz);
      } else {
        const tipoRec = input.tipoReunion === 'recurrente' ? (input.tipoRecurrencia || 'semanal') : 'semanal';
        occsBA = buildOccurrencesBA({
          fechaInicio: input.fechaInicio,
          horaInicio: input.horaInicio,
          tipoRecurrencia: tipoRec,
          cantidadEncuentros: input.cantidadEncuentros || 1,
          timezone: tz,
        });
      }
      const convUrls = buildConverterUrlsPerOccurrence({ occurrencesBA: occsBA, timezone: tz });
      const rows = convertToCities(occsBA);
      const tableHtml = buildScheduleTableHtml(rows);
      courseConfig.integrations.timeanddate.converterUrls = convUrls;
      courseConfig.integrations.timeanddate.tableHtml = tableHtml;
    } catch (e) {
      logger.error('[MAIN] Error generando TimeAndDate:', e && e.message ? e.message : e);
    }

    // Integración FluentCRM: crear etiqueta y lista (ambas = tagCurso) de forma idempotente
    try {
      const fcrmCfg = getFcrmConfig();
      const hasFcrm = Boolean(fcrmCfg.baseUrl && fcrmCfg.user && fcrmCfg.pass);
      if (hasFcrm) {
        logger.info('[MAIN] Credenciales FluentCRM detectadas. Creando/Asegurando etiqueta y lista...');
        const code = input.tagCurso;
        if (!code || !String(code).trim()) {
          logger.warn('[MAIN] tagCurso vacío. Omitiendo FluentCRM.');
        } else {
          const tagRes = await ensureTagFromCode({ code });
          const listRes = await ensureListFromCode({ code });
          courseConfig.integrations.fluentcrm = {
            code,
            tagId: tagRes?.id || null,
            listId: listRes?.id || null,
          };
          logger.info('[MAIN] FluentCRM actualizado (tag y lista asegurados).');
        }
      } else {
        logger.warn('[MAIN] Credenciales FluentCRM no configuradas (.env). Omitiendo FluentCRM.');
      }
    } catch (e) {
      logger.error('[MAIN] Error en FluentCRM:', e && e.message ? e.message : e);
    }

    // Integración LearnDash
    try {
      const wpCfg = getWpConfig();
      const hasWp = Boolean(wpCfg.baseUrl && wpCfg.username && wpCfg.appPassword);
      if (hasWp) {
        const courseTitle = courseConfig.meta.title;
        const defaultSlug = courseConfig.meta.slug;
        const desc = courseConfig.meta.description;

        // Rama: usar curso ya clonado por tag (minimiza riesgo; el usuario clonó manualmente)
        if (input.useExistingClonedCourse && input.existingTag) {
          const existingSlug = String(input.existingTag).toLowerCase();
          logger.info(`[MAIN] Usando curso clonado existente por tag="${existingSlug}".`);
          const { courseId } = await ensureExistingCourseByTag({ tagOrSlug: existingSlug });

          // Renombrar el curso clonado: "Copy of ..." -> nuevo título, y normalizar slug al tag
          try {
            await renameCourseTitle({ courseId, newTitle: courseTitle, newSlug: existingSlug });
          } catch (eRename) {
            logger.warn('[MAIN] No se pudo renombrar el curso clonado:', eRename && eRename.message ? eRename.message : eRename);
          }

          // Generar/actualizar Lección Zoom en el curso clonado (slug determinístico basado en existingTag)
          const contentHtml = buildLesson1Content(input, courseConfig);
          const lessonTitle = `Datos del Encuentro (Zoom) — ${courseTitle}`;
          const lessonEnsure = await ensureLesson1({
            courseId,
            title: lessonTitle,
            contentHtml,
            courseSlug: existingSlug,
          });

          courseConfig.integrations.learndash.courseId = courseId;
          courseConfig.integrations.learndash.lessonIds = [lessonEnsure.lessonId];

          // Enforce course_price_type = closed (idempotente)
          await enforceCourseClosed({ courseId });

          logger.info('[MAIN] LearnDash actualizado (curso clonado existente + lección Zoom).');
        } else {
          // Rama original: crear/actualizar curso y Lección 1
          logger.info('[MAIN] Credenciales WordPress detectadas. Creando/actualizando curso y lección en LearnDash...');
          const courseEnsure = await ensureCourse({
            title: courseTitle,
            slug: defaultSlug,
            existingCourseFlag: courseConfig.meta.existingCourse,
            description: desc,
          });

          const contentHtml = buildLesson1Content(input, courseConfig);
          const lessonTitle = `Datos del Encuentro (Zoom) — ${courseTitle}`;

          const lessonEnsure = await ensureLesson1({
            courseId: courseEnsure.courseId,
            title: lessonTitle,
            contentHtml,
            courseSlug: defaultSlug,
          });

          courseConfig.integrations.learndash.courseId = courseEnsure.courseId;
          courseConfig.integrations.learndash.lessonIds = [lessonEnsure.lessonId];

          // Refuerzo: asegurar que la lección quede asignada como step del curso (idempotente)
          // Si USE_LD_PLUGIN=true, ya se intentó primero vía plugin y evitamos reintentos innecesarios.
          if (String(process.env.USE_LD_PLUGIN || '').toLowerCase() !== 'true') {
            try {
              await ensureLessonAssignedToCourse({
                courseId: courseEnsure.courseId,
                lessonId: lessonEnsure.lessonId,
              });
            } catch (e2) {
              logger.warn('[MAIN] No se pudo asignar lección al curso (Course Steps):', e2 && e2.message ? e2.message : e2);
            }
          }

          logger.info('[MAIN] LearnDash actualizado.');
        }
      } else {
        logger.warn('[MAIN] Credenciales WordPress no configuradas (.env). Omitiendo LearnDash.');
      }
    } catch (e) {
      logger.error('[MAIN] Error en LearnDash:', e && e.message ? e.message : e);
    }

    // Integración WooCommerce
    try {
      const wpCfg2 = getWpConfig();
      const wcKey = process.env.WC_CONSUMER_KEY;
      const wcSecret = process.env.WC_CONSUMER_SECRET;
      const hasWc = Boolean(wpCfg2.baseUrl && wcKey && wcSecret);
      if (hasWc) {
        logger.info('[MAIN] Credenciales WooCommerce detectadas. Actualizando producto...');
        try {
          const wcRes = await updateWooProductByInput({ input });
          if (wcRes && wcRes.productId) {
            courseConfig.integrations.woocommerce.productId = wcRes.productId;
          }
          const mode = wcRes && wcRes.dryRun ? 'DRY-RUN' : 'LIVE';
          logger.info(`[MAIN] WooCommerce ${mode} completado. Cambios: ${wcRes && wcRes.changed ? 'sí' : 'no'}.`);
        } catch (eWc) {
          logger.error('[MAIN] WooCommerce abortado:', eWc && eWc.message ? eWc.message : eWc);
        }
      } else {
        logger.warn('[MAIN] Credenciales WooCommerce no configuradas (.env). Omitiendo WooCommerce.');
      }
    } catch (e) {
      logger.error('[MAIN] Error en WooCommerce:', e && e.message ? e.message : e);
    }

    logger.info('[MAIN] Resultado final.');
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({
      input,
      courseConfig,
    }, null, 2));
  } catch (err) {
    logger.error('[MAIN] Error:', err && err.stack ? err.stack : (err && err.message) || err);
    process.exit(1);
  }
}

if (require.main === module) {
  main().then(() => process.exit(0));
}

module.exports = { main };
