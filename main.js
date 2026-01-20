// main.js
// Orquestador: invoca el Módulo INPUT, construye template de curso y orquesta integraciones con UX mejorada (spinners)

'use strict';

const ora = require('ora');
const chalk = require('chalk');
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
const { ensureSmartLink } = require('./services/smartlinks');
const { ensureAutomation } = require('./services/automations');
const { recycleForm } = require('./services/forms');
const { getZoomConfig, DEFAULT_TIMEZONE, getWpConfig, getFcrmConfig, getWcConfig, validateConfigs, getWooConfig } = require('./services/config');
const { updateWooProductByInput } = require('./services/woocommerce');

function hasZoomCreds(cfg) {
  return Boolean(cfg.accountId && cfg.clientId && cfg.clientSecret && cfg.hostEmail);
}

async function main() {
  try {
    // 1. INPUT
    const nonInteractiveJson = process.env.NON_INTERACTIVE_JSON;
    const input = await getInputData(
      nonInteractiveJson
        ? { interactive: false, defaults: JSON.parse(nonInteractiveJson) }
        : { interactive: true }
    );

    if (!input) {
      // Usuario canceló en prompts
      return;
    }

    console.log(''); // Espacio visual
    const mainSpinner = ora({ text: 'Iniciando automatización...', color: 'cyan' }).start();

    // 2. CONFIG BASE
    mainSpinner.text = 'Construyendo configuración base...';
    await new Promise(r => setTimeout(r, 500)); // Pequeña pausa para que se vea el spinner
    const courseConfig = buildCourseConfig(input);

    // 3. ZOOM
    const zoomCfg = getZoomConfig();
    let zoomResult = null;
    if (hasZoomCreds(zoomCfg)) {
      mainSpinner.text = 'Creando reunión en Zoom...';
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
        mainSpinner.succeed(chalk.green('Zoom: Reunión creada exitosamente.'));
        mainSpinner.start(); // Reiniciar para siguiente paso
      } catch (e) {
        mainSpinner.warn(chalk.yellow(`Zoom: Falló creación (${e.message}). Continuando...`));
        mainSpinner.start();
      }
    } else {
      mainSpinner.info(chalk.dim('Zoom: Credenciales no configuradas. Omitiendo.'));
      mainSpinner.start();
    }

    // 4. TIME AND DATE
    mainSpinner.text = 'Generando horarios y URLs (TimeAndDate)...';
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

      mainSpinner.succeed(chalk.green('TimeAndDate: URLs y tabla generadas.'));
      mainSpinner.start();
    } catch (e) {
      mainSpinner.fail(chalk.red(`TimeAndDate: Error (${e.message}).`));
      mainSpinner.start();
    }

    // 5. FLUENTCRM
    const fcrmCfg = getFcrmConfig();
    if (Boolean(fcrmCfg.baseUrl && fcrmCfg.user && fcrmCfg.pass)) {
      mainSpinner.text = 'Configurando FluentCRM (Tags/Listas)...';
      try {
        const code = input.tagCurso;
        if (!code || !String(code).trim()) {
          mainSpinner.warn(chalk.yellow('FluentCRM: tagCurso vacío. Omitiendo.'));
        } else {
          const tagRes = await ensureTagFromCode({ code });
          // Pequeña pausa para no saturar si es muy rápido
          const listRes = await ensureListFromCode({ code });
          courseConfig.integrations.fluentcrm = {
            code,
            tagId: tagRes?.id || null,
            listId: listRes?.id || null,
          };
          mainSpinner.succeed(chalk.green('FluentCRM: Tag y Lista asegurados.'));
        }
      } catch (e) {
        mainSpinner.warn(chalk.yellow(`FluentCRM: Error parcial (${e.message}).`));
      }
    } else {
      mainSpinner.info(chalk.dim('FluentCRM: Credenciales no configuradas. Omitiendo.'));
    }
    mainSpinner.start();

    // 6. Configurar LEARNDASH (Curso y Lección)
    const wpCfg = getWpConfig();
    const ldKey = process.env.WP_USER;
    if (Boolean(wpCfg.baseUrl && ldKey)) {
      mainSpinner.text = 'LearnDash: Creando/Actualizando curso base...';
      try {
        const { createOrUpdateCourse, ensureLesson1, ensureLessonAssignedToCourse, getCourseByTag, buildLesson1Content } = require('./services/learndash');

        // 1. Buscar curso YA EXISTENTE (Manual Clone)
        const targetTag = input.tagCurso;
        mainSpinner.text = `LearnDash: Buscando curso CLONADO con tag "${targetTag}"...`;

        const foundCourse = await getCourseByTag({ client: require('./services/learndash').getWpClient(), tag: targetTag });

        if (!foundCourse) {
          throw new Error(`[LD] NO se encontró ningún curso con el tag "${targetTag}". Por favor clónalo manualmente primero y asegúrate de que el título contenga el tag.`);
        }

        const courseId = foundCourse.id;
        courseConfig.integrations.learndash.courseId = courseId;

        logger.info(`[LD] Curso encontrado: "${foundCourse.title.rendered}" (ID: ${courseId})`);
        mainSpinner.succeed(chalk.green(`LearnDash: Curso validado (ID ${courseId}).`));

        // Auto-correct Slug if needed
        const currentSlug = foundCourse.slug;
        const desiredSlug = String(targetTag).toLowerCase().trim();

        if (currentSlug !== desiredSlug) {
          mainSpinner.text = `LearnDash: Corrigiendo URL del curso (${currentSlug} -> ${desiredSlug})...`;
          try {
            const client = require('./services/learndash').getWpClient();
            const cfg = getWpConfig();
            await client.post(`${cfg.ldApiBase}/sfwd-courses/${courseId}`, {
              slug: desiredSlug
            });
            // Update local reference
            foundCourse.slug = desiredSlug;
            mainSpinner.succeed(chalk.green(`LearnDash: URL corregida a /${desiredSlug}`));
          } catch (errSlug) {
            logger.warn(`[LD] No se pudo corregir el slug: ${errSlug.message}`);
            mainSpinner.warn(chalk.yellow('LearnDash: No se pudo actualizar la URL (Slug), pero continuamos.'));
          }
        }

        // Note: We skip createOrUpdateCourse as per "Manual Clone" directive.
        // We assume the manual clone is correct.

        /* Removed Auto-Cloning Logic */

        // 3. Crear Lección Zoom
        mainSpinner.start('LearnDash: Creando lección Zoom...');
        const contentHtml = buildLesson1Content(input, courseConfig);
        const lessonTitle = `Datos del Encuentro (Zoom) — ${input.nombreBase}`; // Use input name cleanly

        const lessonEnsure = await ensureLesson1({
          courseId: courseId,
          title: lessonTitle,
          contentHtml,
          courseSlug: foundCourse.slug, // Use confirmed slug
          courseConfig,
          input,
          zoomResult
        });

        courseConfig.integrations.learndash.lessonIds = [lessonEnsure.lessonId];

        // 4. Asignar Lección (si no usamos el plugin de automatización implícito)
        if (String(process.env.USE_LD_PLUGIN || '').toLowerCase() !== 'true') {
          try {
            await ensureLessonAssignedToCourse({
              courseId: courseId,
              lessonId: lessonEnsure.lessonId,
            });
          } catch (e2) { }
        }

        mainSpinner.succeed(chalk.green('LearnDash: Lección de Zoom creada y asignada.'));

      } catch (e) {
        mainSpinner.fail(chalk.red(`LearnDash: Error crítico (${e.message}).`));
      }
    } else {
      mainSpinner.info(chalk.dim('LearnDash: Credenciales no configuradas. Omitiendo.'));
    }
    mainSpinner.start();

    // 7. WOOCOMMERCE
    // Pre-calculate Date String for Woo & Automation (ACF/Email Body)
    try {
      if (input.fechaInicio && input.horaInicio) {
        const [day, month, year] = input.fechaInicio.split('/').map(Number);
        const dateObj = new Date(year, month - 1, day);
        const daysSpan = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
        const monthsSpan = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
        input.startDateTime = `${daysSpan[dateObj.getDay()]} ${day} de ${monthsSpan[month - 1]} las ${input.horaInicio}`;
      }
    } catch (ed) { }

    const wpCfg2 = getWpConfig();
    const wcKey = process.env.WC_CONSUMER_KEY;
    const wcSecret = process.env.WC_CONSUMER_SECRET;
    if (Boolean(wpCfg2.baseUrl && wcKey && wcSecret)) {
      mainSpinner.text = 'Actualizando WooCommerce...';
      try {
        // Get auto-generated link if available
        const autoLink = (courseConfig.integrations.timeanddate.converterUrls || [])[0];

        const wcRes = await updateWooProductByInput({
          input,
          courseId: courseConfig.integrations.learndash.courseId,
          autoTimezoneLink: autoLink
        });
        if (wcRes && wcRes.productId) {
          courseConfig.integrations.woocommerce.productId = wcRes.productId;
        }
        const mode = wcRes && wcRes.dryRun ? 'DRY-RUN' : 'LIVE';
        mainSpinner.succeed(chalk.green(`WooCommerce: Producto actualizado (${mode}).`));

        // 8. SMARTLINKS (FluentCRM)
        if (input.smartLinkSourceTag || input.tagCurso) {
          mainSpinner.text = 'FluentCRM: Procesando SmartLink...'; // reuse spinner
          try {
            // Retrieve IDs from config
            const fcrmData = courseConfig.integrations.fluentcrm || {};
            const tagIds = fcrmData.tagId ? [fcrmData.tagId] : [];
            const listIds = fcrmData.listId ? [fcrmData.listId] : [];

            const { ensureSmartLink } = require('./services/smartlinks');
            // wcRes might be dry run or live, but we need permalink
            const productUrl = (wcRes && wcRes.permalink) || '';

            const slRes = await ensureSmartLink({
              sourceTag: input.smartLinkSourceTag, // "Old Tag"
              newTag: input.tagCurso,             // "New Tag"
              productUrl: productUrl,
              addTagIds: tagIds,
              addListIds: listIds
            });

            if (slRes) {
              const slMsg = slRes.wasCreated ? 'CREADO' : 'RECICLADO';
              logger.info(`[FCRM] SmartLink ${slMsg}: ID ${slRes.id}, Short: ${slRes.shortUrl}`);
              courseConfig.integrations.fluentcrm.smartLinkId = slRes.id;
              courseConfig.integrations.fluentcrm.smartLinkUrl = slRes.shortUrl;
              mainSpinner.succeed(chalk.green(`FluentCRM: SmartLink ${slMsg}.`));
            } else {
              mainSpinner.warn(chalk.yellow('FluentCRM: No se pudo procesar SmartLink (ver log).'));
            }
          } catch (exSl) {
            logger.error(`[FCRM] SmartLink Error: ${exSl.message}`);
            mainSpinner.warn(chalk.yellow('FluentCRM: Error en SmartLink.'));
          }

          // 9. AUTOMATION RECYCLING
          if (input.smartLinkSourceTag) {
            mainSpinner.text = 'FluentCRM: Procesando Automatización...';
            try {
              const { ensureAutomation } = require('./services/automations');

              // Formatear Fecha (ya calculado arriba en input.startDateTime)
              const formattedDate = input.startDateTime || '';

              const autoRes = await ensureAutomation({
                sourceTag: input.smartLinkSourceTag,
                newTag: input.tagCurso,
                triggerProductId: courseConfig.integrations.woocommerce.productId,
                startDateTime: formattedDate,
                zoomJoinUrl: courseConfig.integrations.zoom.joinUrl || '',
                includeBirthData: input.incluirFormulario,
                newListId: courseConfig.integrations.fluentcrm.listId
              });

              if (autoRes && autoRes.updated) {
                const msg = process.env.DRY_RUN === 'true' ? ' (DRY-RUN)' : '';
                mainSpinner.succeed(chalk.green(`FluentCRM: Automatización reciclada${msg} (ID ${autoRes.id})`));
              } else {
                mainSpinner.warn(chalk.yellow('FluentCRM: No se actualizó la automatización (ver logs).'));
              }
            } catch (eAuto) {
              logger.error(`[FCRM] Auto Error: ${eAuto.message}`);
              mainSpinner.warn(chalk.yellow(`FluentCRM: Error en Automatización (${eAuto.message}).`));
            }

            // 4. FluentForms Recycle
            if (input.incluirFormulario) {
              mainSpinner.text = 'FluentForms: Procesando Formulario...';
              try {
                const formRes = await recycleForm({
                  sourceTag: input.tagCursoAnterior,
                  newTag: input.tagCurso
                });
                if (formRes) {
                  const msg = process.env.DRY_RUN === 'true' ? ' (DRY-RUN)' : '';
                  mainSpinner.succeed(chalk.green(`FluentForms: Formulario procesado${msg}.`));
                } else {
                  mainSpinner.warn(chalk.yellow('FluentForms: No se pudo automatizar. Requiere revisión manual.'));
                }
              } catch (eForm) {
                logger.error(`[FORMS] Error: ${eForm.message}`);
                mainSpinner.warn(chalk.yellow(`FluentForms: Error (${eForm.message}).`));
              }
            } else {
              mainSpinner.info(chalk.dim('FluentForms: Omitido (No se requieren datos de nacimiento).'));
            }
          }
        }
      } catch (eWc) {
        mainSpinner.warn(chalk.yellow(`WooCommerce: Falló actualización (${eWc.message}).`));
      }
    } else {
      mainSpinner.info(chalk.dim('WooCommerce: Credenciales no configuradas. Omitiendo.'));
    }

    mainSpinner.stop(); // Detener spinner para mostrar resumen final

    // RESUMEN FINAL
    console.log('');
    console.log(chalk.bold.inverse(' RESUMEN FINAL DE AUTOMATIZACIÓN '));
    console.log('');

    // Tabla simple manual
    const logRow = (label, val) => console.log(chalk.cyan(label.padEnd(20)) + ': ' + val);

    logRow('Curso', input.nombreBase);
    logRow('Tag', input.tagCurso);
    logRow('Zoom ID', courseConfig.integrations.zoom.meetingId || chalk.red('No creado'));
    logRow('Join URL', courseConfig.integrations.zoom.joinUrl || '-');
    logRow('FluentCRM Tag ID', courseConfig.integrations.fluentcrm.tagId || '-');
    logRow('LearnDash Curso ID', courseConfig.integrations.learndash.courseId || '-');

    if (courseConfig.integrations.timeanddate.converterUrls && courseConfig.integrations.timeanddate.converterUrls[0]) {
      logRow('Time&Date URL', courseConfig.integrations.timeanddate.converterUrls[0]);
    }

    console.log('');
    console.log(chalk.green('✅ Proceso finalizado.'));

  } catch (err) {
    if (typeof mainSpinner !== 'undefined') mainSpinner.stop();
    logger.error('Error fatal en main:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  main().then(() => process.exit(0));
}

module.exports = { main };
