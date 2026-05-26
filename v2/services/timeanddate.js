// v2/services/timeanddate.js
// Construcción de URLs de TimeAndDate y tabla HTML de horarios por ciudad (sin usar API)

'use strict';

const { DateTime } = require('luxon');
const DEFAULT_TIMEZONE = 'America/Argentina/Buenos_Aires';

// Orden y etiquetas de ciudades (según preferencia: UTC, Buenos Aires, resto alfabético)
const CITY_DEFS = [
    { zone: 'UTC', label: 'UTC' },
    { zone: 'America/Argentina/Buenos_Aires', label: 'Buenos Aires' },
    { zone: 'America/Bogota', label: 'Bogotá' },              // Colombia
    { zone: 'America/Lima', label: 'Lima' },
    { zone: 'Europe/Madrid', label: 'Madrid' },
    { zone: 'America/Mexico_City', label: 'México (CDMX)' },
    { zone: 'America/New_York', label: 'Miami' },             // Usa la zona de New York
    { zone: 'America/Santiago', label: 'Santiago' },
];

function getOrderedCityDefs() {
    const [utc, ba, ...rest] = CITY_DEFS;
    const sorted = rest.slice().sort((a, b) => a.label.localeCompare(b.label, 'es'));
    return [utc, ba, ...sorted];
}

function buildIsoUTCFromBA(fechaInicio, horaInicio, tzBA = DEFAULT_TIMEZONE) {
    const dtBA = DateTime.fromFormat(`${fechaInicio} ${horaInicio}`, 'dd/LL/yyyy HH:mm', { zone: tzBA });
    if (!dtBA.isValid) {
        throw new Error(`Fecha/hora BA inválida: ${fechaInicio} ${horaInicio} (${dtBA.invalidReason || ''})`);
    }
    return dtBA.setZone('UTC').toFormat("yyyyLLdd'T'HHmmss"); // ej: 20261211T193000
}

const P_CODES_DEFAULT = [136, 141, 51, 232, 163, 156, 155, 41, 131];

function buildConverterUrl({ fechaInicio, horaInicio, timezone = DEFAULT_TIMEZONE, pCodes = P_CODES_DEFAULT }) {
    const isoUTC = buildIsoUTCFromBA(fechaInicio, horaInicio, timezone);
    const pParams = pCodes.map((code, idx) => `p${idx + 1}=${code}`).join('&');
    return `https://www.timeanddate.com/worldclock/converter.html?iso=${isoUTC}&${pParams}`;
}

function buildOccurrencesBA({ fechaInicio, horaInicio, tipoRecurrencia = 'semanal', cantidadEncuentros = 1, timezone = DEFAULT_TIMEZONE }) {
    const dt0 = DateTime.fromFormat(`${fechaInicio} ${horaInicio}`, 'dd/LL/yyyy HH:mm', { zone: timezone });
    if (!dt0.isValid) {
        throw new Error(`Fecha/hora BA inválida: ${fechaInicio} ${horaInicio} (${dt0.invalidReason || ''})`);
    }
    const occs = [];
    for (let i = 0; i < Math.max(1, cantidadEncuentros); i++) {
        let dt = dt0;
        if (tipoRecurrencia === 'diaria') {
            dt = dt0.plus({ days: i });
        } else if (tipoRecurrencia === 'mensual') {
            dt = dt0.plus({ months: i });
        } else {
            dt = dt0.plus({ weeks: i });
        }
        occs.push(dt);
    }
    return occs;
}

function buildOccurrencesFromZoom(zoomOccurrences = [], tzBA = DEFAULT_TIMEZONE) {
    const occs = [];
    for (const occ of zoomOccurrences) {
        if (occ && occ.start_time) {
            const dtUTC = DateTime.fromISO(occ.start_time, { zone: 'UTC' });
            if (dtUTC.isValid) {
                occs.push(dtUTC.setZone(tzBA));
            }
        }
    }
    return occs;
}

function convertToCities(occurrencesBA, cityDefs = getOrderedCityDefs()) {
    return occurrencesBA.map((dtBA) => {
        return {
            dateBA: dtBA,
            cities: cityDefs.map((c) => ({
                zone: c.zone,
                label: c.label,
                dt: dtBA.setZone(c.zone),
            })),
        };
    });
}

function fmtDateBA(dt) {
    return dt.setLocale('es').toFormat('ccc dd/LL/yyyy');
}
function fmtTime(dt) {
    return dt.toFormat('HH:mm');
}

function buildScheduleTableHtml(occurrencesPerCity) {
    const cityLabels = occurrencesPerCity.length > 0
        ? occurrencesPerCity[0].cities.map((c) => c.label)
        : getOrderedCityDefs().map((c) => c.label);

    let html = '';
    html += '<table border="1" cellspacing="0" cellpadding="6">\n';
    html += '  <thead>\n    <tr>\n      <th>Fecha (BA)</th>\n';
    for (const label of cityLabels) html += `      <th>${label}</th>\n`;
    html += '    </tr>\n  </thead>\n  <tbody>\n';

    for (const row of occurrencesPerCity) {
        html += '    <tr>\n';
        html += `      <td>${fmtDateBA(row.dateBA)}</td>\n`;
        for (const c of row.cities) html += `      <td>${fmtTime(c.dt)}</td>\n`;
        html += '    </tr>\n';
    }

    html += '  </tbody>\n</table>\n';
    html += '<p style="font-size: 0.9em; color: #666;">';
    html += 'La hora base es Buenos Aires (AR). Las demás ciudades ya contemplan automáticamente los cambios por horario de verano (DST) según cada ciudad.</p>\n';

    return html;
}

function buildConverterUrlsPerOccurrence({ occurrencesBA, timezone = DEFAULT_TIMEZONE }) {
    return occurrencesBA.map((dtBA) => {
        const fecha = dtBA.toFormat('dd/LL/yyyy');
        const hora = dtBA.toFormat('HH:mm');
        return buildConverterUrl({ fechaInicio: fecha, horaInicio: hora, timezone });
    });
}

/**
 * Service Wrapper para invocación limpia desde Automator.js
 */
function generateTimeAndDate(input, zoomResult = null, timezone = DEFAULT_TIMEZONE) {
    let occsBA;
    // Priorizar las ocurrencias reales devueltas por Zoom
    if (zoomResult && Array.isArray(zoomResult.occurrences) && zoomResult.occurrences.length) {
        occsBA = buildOccurrencesFromZoom(zoomResult.occurrences, timezone);
    } else {
        // Generar teóricas basadas en input si no hay Zoom
        const tipoRec = input.tipoReunion === 'recurrente' ? (input.tipoRecurrencia || 'semanal') : 'semanal';
        occsBA = buildOccurrencesBA({
            fechaInicio: input.fechaInicio,
            horaInicio: input.horaInicio,
            tipoRecurrencia: tipoRec,
            cantidadEncuentros: input.cantidadEncuentros || 1,
            timezone: timezone,
        });
    }

    const converterUrls = buildConverterUrlsPerOccurrence({ occurrencesBA: occsBA, timezone });
    const rows = convertToCities(occsBA);
    const tableHtml = buildScheduleTableHtml(rows);

    return { converterUrls, tableHtml, occurrencesBA: occsBA };
}

module.exports = {
    buildConverterUrl,
    buildIsoUTCFromBA,
    buildOccurrencesBA,
    buildOccurrencesFromZoom,
    convertToCities,
    buildScheduleTableHtml,
    buildConverterUrlsPerOccurrence,
    getOrderedCityDefs,
    generateTimeAndDate
};
