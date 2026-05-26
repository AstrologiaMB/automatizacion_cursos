// services/zoom.js
// Creación de reuniones Zoom (individual y recurrente: diaria, semanal, mensual) usando S2S OAuth

'use strict';

const { DateTime } = require('luxon');
const logger = require('../utils/logger');
const { getZoomAxios } = require('./http');
const { getZoomConfig, DEFAULT_TIMEZONE } = require('./config');

/**
 * Convierte fechaInicio (DD/MM/YYYY) + horaInicio (HH:mm) a:
 * - start_time string 'YYYY-MM-DDTHH:mm:ss'
 * - timezone IANA (por defecto America/Argentina/Buenos_Aires)
 * - weeklyDayZoom (1..7) donde 1=Dom, 7=Sab (convención Zoom)
 * - dayOfMonth (1..31) para mensual
 */
function buildStartFromInput({ fechaInicio, horaInicio, timezone = DEFAULT_TIMEZONE }) {
  const dt = DateTime.fromFormat(`${fechaInicio} ${horaInicio}`, 'dd/LL/yyyy HH:mm', { zone: timezone });
  if (!dt.isValid) {
    throw new Error(`Fecha/hora inválida: ${fechaInicio} ${horaInicio} (${dt.invalidReason || ''})`);
  }
  const start_time = dt.toFormat("yyyy-LL-dd'T'HH:mm:ss"); // Zoom: local time + timezone
  // Luxon weekday: 1=Lun .. 7=Dom → Zoom weekly_days: 1=Dom .. 7=Sab
  const luxonWeekday = dt.weekday; // 1..7 (Mon..Sun)
  const weeklyDayZoom = (luxonWeekday % 7) + 1; // Mon(1)->2 ... Sun(7)->1
  const dayOfMonth = dt.day; // 1..31
  return { start_time, timezone, weeklyDayZoom, dayOfMonth };
}

function buildSettings(overrides = {}) {
  const cfg = getZoomConfig();
  const defaults = cfg.defaults || {};
  return {
    waiting_room: defaults.waiting_room === true,
    join_before_host: defaults.join_before_host === true,
    mute_upon_entry: defaults.mute_upon_entry === true,
    auto_recording: defaults.auto_recording || 'none', // 'local' | 'cloud' | 'none'
    approval_type: 2, // auto-aprobado (sin registro)
    ...overrides,
  };
}

/**
 * Crea una reunión individual (type 2)
 */
async function createMeetingIndividual({
  topic,
  fechaInicio,
  horaInicio,
  duration,
  timezone,
  userId,
  settings,
  accountIndex = '1',
}) {
  const { start_time, timezone: tz } = buildStartFromInput({
    fechaInicio,
    horaInicio,
    timezone: timezone || DEFAULT_TIMEZONE,
  });

  const payload = {
    topic,
    type: 2,
    start_time, // local time string
    timezone: tz,
    duration: duration,
    settings: buildSettings(settings),
  };

  const client = await getZoomAxios(accountIndex);
  try {
    const res = await client.post(`/users/${encodeURIComponent(userId)}/meetings`, payload);
    const data = res.data || {};
    logger.info('[ZOOM] Reunión individual creada:', data.id);
    return {
      meetingId: data.id,
      joinUrl: data.join_url,
      startUrl: data.start_url,
      password: data.password || null,
      raw: data,
    };
  } catch (err) {
    const msg = err.response ? `[${err.response.status}] ${JSON.stringify(err.response.data)}` : (err.message || err);
    logger.error('[ZOOM] Error creando reunión individual:', msg);
    throw err;
  }
}

/**
 * Crea una reunión recurrente diaria (type 8, recurrence.type=1)
 */
async function createMeetingRecurrentDaily({
  topic,
  fechaInicio,
  horaInicio,
  duration,
  timezone,
  count,
  userId,
  settings,
  accountIndex = '1',
}) {
  const { start_time, timezone: tz } = buildStartFromInput({
    fechaInicio,
    horaInicio,
    timezone: timezone || DEFAULT_TIMEZONE,
  });

  const payload = {
    topic,
    type: 8,
    start_time,
    timezone: tz,
    duration: duration,
    recurrence: {
      type: 1, // daily
      repeat_interval: 1,
      end_times: count,
    },
    settings: buildSettings(settings),
  };

  const client = await getZoomAxios(accountIndex);
  try {
    const res = await client.post(`/users/${encodeURIComponent(userId)}/meetings`, payload);
    const data = res.data || {};
    logger.info('[ZOOM] Reunión recurrente diaria creada:', data.id);
    return {
      meetingId: data.id,
      joinUrl: data.join_url,
      startUrl: data.start_url,
      password: data.password || null,
      occurrences: data.occurrences || null,
      raw: data,
    };
  } catch (err) {
    const msg = err.response ? `[${err.response.status}] ${JSON.stringify(err.response.data)}` : (err.message || err);
    logger.error('[ZOOM] Error creando reunión recurrente diaria:', msg);
    throw err;
  }
}

/**
 * Crea una reunión recurrente semanal (type 8)
 * weekly_days: 1=Dom .. 7=Sab (string, ej: "3" para martes)
 * end_times: cantidad de ocurrencias
 */
async function createMeetingRecurrentWeekly({
  topic,
  fechaInicio,
  horaInicio,
  duration,
  timezone,
  count,
  userId,
  settings,
  accountIndex = '1',
}) {
  const { start_time, timezone: tz, weeklyDayZoom } = buildStartFromInput({
    fechaInicio,
    horaInicio,
    timezone: timezone || DEFAULT_TIMEZONE,
  });

  const payload = {
    topic,
    type: 8,
    start_time,
    timezone: tz,
    duration: duration,
    recurrence: {
      type: 2, // weekly
      repeat_interval: 1,
      weekly_days: String(weeklyDayZoom), // ej: "3" (martes)
      end_times: count,
    },
    settings: buildSettings(settings),
  };

  const client = await getZoomAxios(accountIndex);
  try {
    const res = await client.post(`/users/${encodeURIComponent(userId)}/meetings`, payload);
    const data = res.data || {};
    logger.info('[ZOOM] Reunión recurrente semanal creada:', data.id);
    return {
      meetingId: data.id,
      joinUrl: data.join_url,
      startUrl: data.start_url,
      password: data.password || null,
      occurrences: data.occurrences || null,
      raw: data,
    };
  } catch (err) {
    const msg = err.response ? `[${err.response.status}] ${JSON.stringify(err.response.data)}` : (err.message || err);
    logger.error('[ZOOM] Error creando reunión recurrente semanal:', msg);
    throw err;
  }
}

/**
 * Crea una reunión recurrente mensual (type 8, recurrence.type=3)
 * Usamos monthly_day = día del mes de fechaInicio (1..31)
 */
async function createMeetingRecurrentMonthly({
  topic,
  fechaInicio,
  horaInicio,
  duration,
  timezone,
  count,
  userId,
  settings,
  accountIndex = '1',
}) {
  const { start_time, timezone: tz, dayOfMonth } = buildStartFromInput({
    fechaInicio,
    horaInicio,
    timezone: timezone || DEFAULT_TIMEZONE,
  });

  const payload = {
    topic,
    type: 8,
    start_time,
    timezone: tz,
    duration: duration,
    recurrence: {
      type: 3, // monthly
      repeat_interval: 1,
      monthly_day: dayOfMonth,
      end_times: count,
    },
    settings: buildSettings(settings),
  };

  const client = await getZoomAxios(accountIndex);
  try {
    const res = await client.post(`/users/${encodeURIComponent(userId)}/meetings`, payload);
    const data = res.data || {};
    logger.info('[ZOOM] Reunión recurrente mensual creada:', data.id);
    return {
      meetingId: data.id,
      joinUrl: data.join_url,
      startUrl: data.start_url,
      password: data.password || null,
      occurrences: data.occurrences || null,
      raw: data,
    };
  } catch (err) {
    const msg = err.response ? `[${err.response.status}] ${JSON.stringify(err.response.data)}` : (err.message || err);
    logger.error('[ZOOM] Error creando reunión recurrente mensual:', msg);
    throw err;
  }
}

/**
 * Helper de alto nivel: crea según tipoReunion ('individual' | 'recurrente')
 * y tipoRecurrencia ('diaria' | 'semanal' | 'mensual')
 */
async function createMeetingFromInput(input) {
  const accountIndex = String(input.zoomAccountIndex || '1');
  const cfg = getZoomConfig(accountIndex);
  const userId = cfg.hostEmail;
  if (!userId) {
    throw new Error(`Falta ZOOM${accountIndex === '2' ? '2' : ''}_HOST_EMAIL en .env para crear reuniones.`);
  }

  logger.info(`[ZOOM] Usando cuenta ${accountIndex} (${userId})`);

  const topic = input.nombreBase || input.nombreProducto || input.tagCurso || 'Curso';
  const timezone = cfg.defaults?.timezone || DEFAULT_TIMEZONE;
  const duration = input.duracionMinutos;
  const fechaInicio = input.fechaInicio;
  const horaInicio = input.horaInicio;

  if (input.tipoReunion === 'recurrente') {
    const count = input.cantidadEncuentros;
    const kind = (input.tipoRecurrencia || 'semanal').toLowerCase();
    if (kind === 'diaria') {
      return createMeetingRecurrentDaily({ topic, fechaInicio, horaInicio, duration, timezone, count, userId, accountIndex });
    }
    if (kind === 'mensual') {
      return createMeetingRecurrentMonthly({ topic, fechaInicio, horaInicio, duration, timezone, count, userId, accountIndex });
    }
    return createMeetingRecurrentWeekly({ topic, fechaInicio, horaInicio, duration, timezone, count, userId, accountIndex });
  }
  return createMeetingIndividual({ topic, fechaInicio, horaInicio, duration, timezone, userId, accountIndex });
}

module.exports = {
  buildStartFromInput,
  createMeetingIndividual,
  createMeetingRecurrentDaily,
  createMeetingRecurrentWeekly,
  createMeetingRecurrentMonthly,
  createMeetingFromInput,
};
