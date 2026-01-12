// services/ics.js
'use strict';

const ics = require('ics');
const { DateTime } = require('luxon');
const logger = require('../utils/logger');
const { DEFAULT_TIMEZONE } = require('./config');

/**
 * Convierte fecha DD/MM/YYYY + Hora HH:mm en array [2026, 12, 31, 15, 30]
 */
function parseDateTimeToArr(dateStr, timeStr) {
    // dateStr: "11/12/2026"
    // timeStr: "19:30"
    if (!dateStr || !timeStr) return null;
    const [d, m, y] = dateStr.split('/').map(Number);
    const [hh, mm] = timeStr.split(':').map(Number);
    return [y, m, d, hh, mm];
}

/**
 * Genera el contenido .ics para el curso
 * @param {Object} input 
 * @param {Object} zoomData 
 * @param {Object} [courseConfig]
 */
function generateIcs(input, zoomData, courseConfig) {
    const { nombreBase, fechaInicio, horaInicio, duracionMinutos, tipoReunion, tipoRecurrencia, cantidadEncuentros, nombreProducto } = input || {};
    const meta = courseConfig?.meta || {};
    const title = meta.title || nombreBase || 'Curso';
    const description = `Enlace de Zoom: ${zoomData.joinUrl || 'Ver en plataforma'}\n\n${meta.description || ''}`;

    const start = parseDateTimeToArr(fechaInicio, horaInicio);
    if (!start) {
        logger.warn('[ICS] Fecha de inicio inválida. No se generó ICS.');
        return null;
    }

    // Recurrencia (rrule)
    let recurrenceRule = undefined;
    if (tipoReunion === 'recurrente') {
        // Zoom recurrencia a ICS recurrencia
        // Zoom: 1=diaria, 2=semanal, 3=mensual
        // ICS expects 'FREQ=WEEKLY;INTERVAL=1;COUNT=4'
        const count = cantidadEncuentros || 1;
        let freq = 'WEEKLY';
        if (tipoRecurrencia === 'diaria') freq = 'DAILY';
        if (tipoRecurrencia === 'mensual') freq = 'MONTHLY';

        recurrenceRule = `FREQ=${freq};INTERVAL=1;COUNT=${count}`;
    }

    const event = {
        start: start, // [YYYY, MM, DD, HH, mm]
        duration: { minutes: extractInt(duracionMinutos) || 90 },
        title: title,
        description: description,
        location: zoomData.joinUrl || 'Online (Zoom)',
        url: zoomData.joinUrl,
        status: 'CONFIRMED',
        busyStatus: 'BUSY',
        organizer: { name: 'Maria Blaquier', email: 'cursos@mariablaquier.com' }
    };

    if (recurrenceRule) {
        event.recurrenceRule = recurrenceRule;
    }

    const { error, value } = ics.createEvent(event);

    if (error) {
        logger.error('[ICS] Error generando evento:', error);
        return null;
    }

    return value;
}

function extractInt(val) {
    if (typeof val === 'number') return val;
    const parsed = parseInt(val, 10);
    return isNaN(parsed) ? null : parsed;
}

module.exports = {
    generateIcs
};
