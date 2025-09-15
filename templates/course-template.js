// templates/course-template.js
// Placeholder de estructura de curso basada en el input del Módulo INPUT (CommonJS)

'use strict';

/**
 * Construye una estructura base de curso a partir del input validado.
 * Nota: Es un placeholder para la integración futura con LearnDash/TablePress/WooCommerce.
 *
 * @param {Object} input - Objeto validado del Módulo INPUT:
 * {
 *   nombreBase: string,
 *   fechaInicio: 'DD/MM/YYYY',
 *   tagCurso: string,
 *   tipoReunion: 'individual' | 'recurrente',
 *   cantidadEncuentros: number,
 *   precio: number,
 *   cursoExistente: boolean,
 *   incluirForo: boolean,
 *   incluirFormulario: boolean,
 *   rutaImagen: string
 * }
 * @returns {Object} estructura de curso
 */
function buildCourseConfig(input) {
  const slug = input.tagCurso.toLowerCase();
  const title = input.nombreBase;
  const description = `Inicio: ${input.fechaInicio} • Tipo: ${input.tipoReunion} • Encuentros: ${input.cantidadEncuentros}`;

  const lessons = Array.from({ length: input.cantidadEncuentros }, (_, i) => ({
    order: i + 1,
    title: `${title} — Encuentro ${i + 1}`,
    content: `Contenido placeholder del encuentro ${i + 1}.`,
    resources: [],
  }));

  return {
    meta: {
      tag: input.tagCurso,
      slug,
      title,
      description,
      imagePath: input.rutaImagen || '',
      priceUSD: input.precio,
      existingCourse: input.cursoExistente,
    },
    features: {
      forum: input.incluirForo,
      form: input.incluirFormulario,
    },
    schedule: {
      startDate: input.fechaInicio, // DD/MM/YYYY
      time: input.horaInicio, // HH:mm (BA)
      durationMin: input.duracionMinutos, // minutos
      type: input.tipoReunion, // individual | recurrente
      count: input.cantidadEncuentros,
      recurrence: input.tipoReunion === 'recurrente'
        ? { kind: input.tipoRecurrencia, repeatInterval: 1 }
        : null,
    },
    content: {
      lessons,
    },
    integrations: {
      // Estos campos se completarán en etapas posteriores del flujo
      zoom: {
        meetingType: input.tipoReunion,
        meetingId: null,
        startUrl: null,
        joinUrl: null,
        recurrence: input.tipoReunion === 'recurrente' ? { count: input.cantidadEncuentros } : null,
      },
      timeanddate: {
        converterUrls: [],
        tableHtml: ''
      },
      learndash: {
        courseId: null,
        lessonIds: [],
      },
      tablepress: {
        tableId: null,
      },
      woocommerce: {
        productId: null,
      },
      fluentcrm: {
        tagId: null,
        listId: null,
        automationId: null,
      },
      fluentcommunity: {
        spaceId: null,
      },
    },
  };
}

module.exports = {
  buildCourseConfig,
};
