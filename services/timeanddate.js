// services/timeanddate.js
// Construcción de URLs de TimeAndDate y tabla HTML de horarios por ciudad (sin usar API)

'use strict';

const { DateTime } = require('luxon');
const { DEFAULT_TIMEZONE } = require('./config');

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

// Devuelve la lista final con el orden solicitado: [UTC, BA, ...alfabético del resto]
function getOrderedCityDefs() {
  const [utc, ba, ...rest] = CITY_DEFS;
  const sorted = rest.slice().sort((a, b) => a.label.localeCompare(b.label, 'es'));
  return [utc, ba, ...sorted];
}

// Construye iso=YYYYMMDDTHHmmss en UTC a partir de la hora base en BA (o tz indicada)
function buildIsoUTCFromBA(fechaInicio, horaInicio, tzBA = DEFAULT_TIMEZONE) {
  const dtBA = DateTime.fromFormat(`${fechaInicio} ${horaInicio}`, 'dd/LL/yyyy HH:mm', { zone: tzBA });
  if (!dtBA.isValid) {
    throw new Error(`Fecha/hora BA inválida: ${fechaInicio} ${horaInicio} (${dtBA.invalidReason || ''})`);
  }
  return dtBA.setZone('UTC').toFormat("yyyyLLdd'T'HHmmss"); // ej: 20261211T193000
}

// Códigos de ciudades para timeanddate (según URL ejemplo usuario)
// p1=136 (London/UTC?), p2=141 (Madrid), p3=51 (BA), p4=232 (Santiago), p5=163 (New York/Miami?), p6=156 (Miami?), p7=155 (Mexico), p8=41 (Bogota), p9=131 (Lima)
const P_CODES_DEFAULT = [136, 141, 51, 232, 163, 156, 155, 41, 131];

// Link universal de conversión horaria de TimeAndDate (Con p-codes)
function buildConverterUrl({ fechaInicio, horaInicio, timezone = DEFAULT_TIMEZONE, pCodes = P_CODES_DEFAULT }) {
  const isoUTC = buildIsoUTCFromBA(fechaInicio, horaInicio, timezone);
  // Construir params p1=...
  const pParams = pCodes.map((code, idx) => `p${idx + 1}=${code}`).join('&');
  return `https://www.timeanddate.com/worldclock/converter.html?iso=${isoUTC}&${pParams}`;
}

// Genera ocurrencias a partir de BA (para individual o recurrente)
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
      // semanal (default)
      dt = dt0.plus({ weeks: i });
    }
    occs.push(dt);
  }
  return occs; // DateTime[] en timezone BA
}

// A partir de occurrences de Zoom (start_time ISO en UTC), convertir a BA
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
  return occs; // DateTime[] en timezone BA
}

// Convierte cada ocurrencia (en BA) a todas las ciudades (DST automático por ciudad)
function convertToCities(occurrencesBA, cityDefs = getOrderedCityDefs()) {
  return occurrencesBA.map((dtBA) => {
    const row = {
      dateBA: dtBA, // base para la columna de fecha
      cities: cityDefs.map((c) => ({
        zone: c.zone,
        label: c.label,
        dt: dtBA.setZone(c.zone),
      })),
    };
    return row;
  });
}

// Formateadores
function fmtDateBA(dt) {
  // Ejemplo: Vie 08/08/2025
  return dt.setLocale('es').toFormat('ccc dd/LL/yyyy');
}
function fmtTime(dt) {
  // 24h: HH:mm (ej. 19:30)
  return dt.toFormat('HH:mm');
}

// Construye una tabla HTML simple con una fila por encuentro y una columna por ciudad
function buildScheduleTableHtml(occurrencesPerCity) {
  const cityLabels = occurrencesPerCity.length > 0
    ? occurrencesPerCity[0].cities.map((c) => c.label)
    : getOrderedCityDefs().map((c) => c.label);

  let html = '';
  html += '<table border="1" cellspacing="0" cellpadding="6">\n';
  html += '  <thead>\n';
  html += '    <tr>\n';
  html += '      <th>Fecha (BA)</th>\n';
  for (const label of cityLabels) {
    html += `      <th>${label}</th>\n`;
  }
  html += '    </tr>\n';
  html += '  </thead>\n';
  html += '  <tbody>\n';

  for (const row of occurrencesPerCity) {
    html += '    <tr>\n';
    html += `      <td>${fmtDateBA(row.dateBA)}</td>\n`;
    for (const c of row.cities) {
      html += `      <td>${fmtTime(c.dt)}</td>\n`;
    }
    html += '    </tr>\n';
  }

  html += '  </tbody>\n';
  html += '</table>\n';
  html += '<p style="font-size: 0.9em; color: #666;">';
  html += 'La hora base es Buenos Aires (AR). Las demás ciudades ya contemplan automáticamente los cambios por horario de verano (DST) según cada ciudad.';
  html += '</p>\n';

  return html;
}

// Construye URLs de conversor por encuentro (una por cada ocurrencia)
function buildConverterUrlsPerOccurrence({ occurrencesBA, timezone = DEFAULT_TIMEZONE }) {
  return occurrencesBA.map((dtBA) => {
    const fecha = dtBA.toFormat('dd/LL/yyyy');
    const hora = dtBA.toFormat('HH:mm');
    return buildConverterUrl({ fechaInicio: fecha, horaInicio: hora, timezone });
  });
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
};
