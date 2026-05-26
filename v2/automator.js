// v2/automator.js
// El Orquestador Principal (Chef)

'use strict';

const logger = require('../utils/logger');
const { createMeetingFromInput } = require('./services/zoom');
const { generateTimeAndDate } = require('./services/timeanddate');
const { generateIcs } = require('./services/ics');
const { uploadMedia } = require('./services/wp-media');
const { setupFluentCrmTags } = require('./services/fluentcrm');
const { getCourseByTag, ensureLesson1, ensureLessonAssignedToCourse, getWpClient } = require('./services/learndash');
const { updateWooProductByInput } = require('./services/woocommerce');

class CourseAutomator {
    constructor(config = {}) {
        this.config = config;
        this.listeners = {};
    }

    on(event, callback) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
    }

    emit(event, data) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(cb => cb(data));
        }
    }

    async run(input) {
        const context = {
            input,
            zoom: null,
            timeanddate: null,
            fluentcrm: null,
            learndash: null,
            woocommerce: null
        };

        try {
            this.emit('step:start', '1. Iniciando automatización...');

            // 1. ZOOM 
            if (this.config.zoom && this.config.zoom.credentials) {
                this.emit('step:progress', 'Creando reunión en Zoom (Cuenta Inyectada)...');
                try {
                    context.zoom = await createMeetingFromInput(input, this.config.zoom);
                    this.emit('step:success', `Zoom: Reunión creada (${context.zoom.meetingId})`);
                } catch (e) {
                    this.emit('step:warn', `Zoom falló: ${e.message}. Continuando sin Zoom...`);
                }
            } else {
                this.emit('step:skip', 'Zoom omitido (sin credenciales config).');
            }

            // 2. TIME & DATE y CALENDARIO (ICS)
            this.emit('step:progress', 'Generando Horarios y Calendario (TimeAndDate / ICS)...');

            const tz = this.config.zoom?.settings?.timezone || 'America/Argentina/Buenos_Aires';
            context.timeanddate = generateTimeAndDate(input, context.zoom, tz);

            // Armamos un mini courseConfig virtual para mantener compatibilidad HTML con old script
            const virtualCourseConfig = {
                meta: { title: input.nombreBase, slug: input.tagCurso.toLowerCase() },
                integrations: { zoom: context.zoom, timeanddate: context.timeanddate },
                schedule: { type: input.tipoReunion, count: input.cantidadEncuentros, startDate: input.fechaInicio, time: input.horaInicio, durationMin: input.duracionMinutos }
            };

            let icsUrl = null;
            const icsString = generateIcs(input, context.zoom, virtualCourseConfig, tz);

            if (icsString && this.config.wp) {
                // Aprovechamos WP config para subir el ICS
                try {
                    const filename = `${virtualCourseConfig.meta.slug}-calendario.ics`;
                    icsUrl = await uploadMedia(icsString, filename, 'text/calendar', this.config.wp);
                    if (icsUrl) this.emit('step:success', `Calendario ICS subido exitosamente.`);
                } catch (e) {
                    this.emit('step:warn', `No se pudo enviar ICS a WP-Media: ${e.message}`);
                }
            }

            // 3. FLUENTCRM 
            this.emit('step:progress', 'Configurando FluentCRM...');
            if (this.config.fluentcrm && this.config.fluentcrm.credentials) {
                context.fluentcrm = await setupFluentCrmTags(input, this.config.fluentcrm);
                if (context.fluentcrm.tagId) {
                    this.emit('step:success', `FluentCRM: Tag ${input.tagCurso} asegurado (ID: ${context.fluentcrm.tagId})`);
                }
            } else {
                this.emit('step:skip', 'FluentCRM omitido.');
            }

            // 4. LEARNDASH
            this.emit('step:progress', 'Configurando LearnDash...');
            if (this.config.wp) {
                const targetTag = input.tagCurso;
                const wpClientMock = getWpClient(this.config.wp);

                const foundCourse = await getCourseByTag({ client: wpClientMock, tag: targetTag });

                if (!foundCourse) {
                    throw new Error(`[LD] NO se encontró un curso clonado con tag "${targetTag}".`);
                }

                context.learndash = { courseId: foundCourse.id, slug: foundCourse.slug };
                this.emit('step:success', `LearnDash: Curso base detectado (ID ${foundCourse.id})`);

                // Lección Datos Zoom
                const lessonTitle = `Datos del Encuentro (Zoom) — ${input.nombreBase}`;
                const lessonObj = await ensureLesson1({
                    credentials: this.config.wp,
                    courseId: foundCourse.id,
                    title: lessonTitle,
                    contentHtml: '', // Reconstruido adentro con ICS
                    courseSlug: foundCourse.slug,
                    courseConfig: virtualCourseConfig,
                    input,
                    icsUrl // Inyección del URL resuelto en paso 2
                });

                context.learndash.lessonId = lessonObj.lessonId;
                await ensureLessonAssignedToCourse({
                    credentials: this.config.wp,
                    courseId: foundCourse.id,
                    lessonId: lessonObj.lessonId
                });
                this.emit('step:success', 'LearnDash: Lección de Encuentro asignada.');
            } else {
                this.emit('step:skip', 'LearnDash omitido (Falta Config WP).');
            }

            // 5. WOOCOMMERCE
            this.emit('step:progress', 'Configurando WooCommerce...');
            if (this.config.woo) {
                // FluentCRM Tags (Inyectamos los ids limpios) => [P$, NuevoTag]
                const fcrmPId = 181; // <-- FIXME: Dependencia estricta, ideal pasarlo en config si P$ tiene un id fijo.
                const fcrmTagsContext = context.fluentcrm?.tagId ? {
                    pId: this.config.fluentcrm?.basePTagId || 181,
                    newTagId: context.fluentcrm.tagId
                } : null;

                const autoLink = context.timeanddate?.converterUrls?.[0] || '';

                const wooRes = await updateWooProductByInput({
                    input,
                    courseId: context.learndash?.courseId,
                    autoTimezoneLink: autoLink,
                    wcCredentials: this.config.woo,
                    wpCredentials: this.config.wp, // Por si sube imagen
                    fcrmTags: fcrmTagsContext
                });

                context.woocommerce = wooRes;
                this.emit('step:success', `WooCommerce: Producto actualizado (ID ${wooRes.productId})`);
            } else {
                this.emit('step:skip', 'WooCommerce omitido.');
            }

            this.emit('step:done', '¡Automatización V2 Completada con Éxito!');
            return context;

        } catch (error) {
            this.emit('step:error', `Error Crítico: ${error.message}`);
            throw error;
        }
    }
}

module.exports = CourseAutomator;
