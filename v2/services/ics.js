// v2/services/ics.js
// Generación de calendario (.ics) 

'use strict';

const ics = require('ics');
const { DateTime } = require('luxon');
const logger = require('../../utils/logger');

const DEFAULT_TIMEZONE = 'America/Argentina/Buenos_Aires';

function buildIcsEventDate(dateIsoStr, tz) {
    if (!dateIsoStr) return null;
    const dt = DateTime.fromISO(dateIsoStr, { zone: 'UTC' }).setZone(tz);
    if (!dt.isValid) return null;
    return [dt.year, dt.month, dt.day, dt.hour, dt.minute];
}

function buildIcsEventDateFromInput(fechaStr, horaStr, tz) {
    if (!fechaStr || !horaStr) return null;
    const dt = DateTime.fromFormat(`${fechaStr} ${horaStr}`, 'dd/LL/yyyy HH:mm', { zone: tz });
    if (!dt.isValid) return null;
    return [dt.year, dt.month, dt.day, dt.hour, dt.minute];
}

function generateIcs(input, zoomResult, courseConfig, timezone = DEFAULT_TIMEZONE) {
    const title = input.nombreBase || input.nombreProducto || 'Encuentro del Curso';
    const duration = parseInt(input.duracionMinutos) || 60;

    const icsEvents = [];

    const addEvent = (startArr, indexStr) => {
        if (!startArr) return;
        const ev = {
            start: startArr,
            startInputType: 'local',
            startOutputType: 'local',
            duration: { minutes: duration },
            title: `${title} ${indexStr}`.trim(),
            description: `
Enlace Zoom: ${zoomResult?.joinUrl || 'N/A'}
ID Reunión: ${zoomResult?.meetingId || 'N/A'}
Clave: ${zoomResult?.password || 'N/A'}
      `.trim()
        };

        if (zoomResult?.joinUrl) {
            ev.url = zoomResult.joinUrl;
        }

        icsEvents.push(ev);
    };

    if (zoomResult && Array.isArray(zoomResult.occurrences) && zoomResult.occurrences.length > 0) {
        zoomResult.occurrences.forEach((occ, i) => {
            const idx = zoomResult.occurrences.length > 1 ? `(Encuentro ${i + 1})` : '';
            const arr = buildIcsEventDate(occ.start_time, timezone);
            addEvent(arr, idx);
        });
    } else if (zoomResult && zoomResult.raw && zoomResult.raw.start_time) {
        const arr = buildIcsEventDate(zoomResult.raw.start_time, timezone);
        addEvent(arr, '');
    } else {
        // Teórico (sin Zoom)
        let occs = 1;
        if (input.tipoReunion === 'recurrente') occs = parseInt(input.cantidadEncuentros) || 1;

        // Simplificación de ICS para recurrentes sin API de Zoom (ej. manual).
        for (let i = 0; i < occs; i++) {
            let dt = DateTime.fromFormat(`${input.fechaInicio} ${input.horaInicio}`, 'dd/LL/yyyy HH:mm', { zone: timezone });
            if (input.tipoRecurrencia === 'diaria') dt = dt.plus({ days: i });
            else if (input.tipoRecurrencia === 'mensual') dt = dt.plus({ months: i });
            else dt = dt.plus({ weeks: i }); // semanal

            const arr = [dt.year, dt.month, dt.day, dt.hour, dt.minute];
            addEvent(arr, occs > 1 ? `(Encuentro ${i + 1})` : '');
        }
    }

    if (icsEvents.length === 0) {
        logger.warn('[ICS] No se pudieron generar eventos para el calendario.');
        return null;
    }

    const { error, value } = ics.createEvents(icsEvents);
    if (error) {
        logger.error(`[ICS] Error creando ICS: ${error.message}`, error);
        return null;
    }

    return value; // string con contenido .ics
}

module.exports = {
    generateIcs
};
