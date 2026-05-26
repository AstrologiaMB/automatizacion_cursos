// v2/services/zoom.js
// Creación de reuniones Zoom usando inyección de credenciales (S2S OAuth multipropósito)

'use strict';

const { DateTime } = require('luxon');
const logger = require('../../utils/logger');
const { getZoomAxios } = require('./http');

const DEFAULT_TIMEZONE = 'America/Argentina/Buenos_Aires';

/**
 * Convierte fechaInicio (DD/MM/YYYY) + horaInicio (HH:mm) a:
 * - start_time string 'YYYY-MM-DDTHH:mm:ss'
 * - timezone IANA
 * - weeklyDayZoom (1..7)
 * - dayOfMonth (1..31)
 */
function buildStartFromInput({ fechaInicio, horaInicio, timezone = DEFAULT_TIMEZONE }) {
    const dt = DateTime.fromFormat(`${fechaInicio} ${horaInicio}`, 'dd/LL/yyyy HH:mm', { zone: timezone });
    if (!dt.isValid) {
        throw new Error(`Fecha/hora inválida: ${fechaInicio} ${horaInicio} (${dt.invalidReason || ''})`);
    }
    const start_time = dt.toFormat("yyyy-LL-dd'T'HH:mm:ss");
    const luxonWeekday = dt.weekday; // 1..7 (Mon..Sun)
    const weeklyDayZoom = (luxonWeekday % 7) + 1; // Mon(1)->2 ... Sun(7)->1
    const dayOfMonth = dt.day; // 1..31
    return { start_time, timezone, weeklyDayZoom, dayOfMonth };
}

function buildSettings(overrides = {}, defaultSettings = {}) {
    return {
        waiting_room: defaultSettings.waiting_room === true,
        join_before_host: defaultSettings.join_before_host === true,
        mute_upon_entry: defaultSettings.mute_upon_entry === true,
        auto_recording: defaultSettings.auto_recording || 'none', // 'local' | 'cloud' | 'none'
        approval_type: 2, // auto-aprobado (sin registro)
        ...overrides,
    };
}

// ============================================
// Core Creation Functions
// ============================================

async function createMeetingIndividual({
    topic,
    fechaInicio,
    horaInicio,
    duration,
    timezone,
    userId,
    settings,
    credentials // { accountId, clientId, clientSecret }
}) {
    const { start_time, timezone: tz } = buildStartFromInput({
        fechaInicio,
        horaInicio,
        timezone: timezone || DEFAULT_TIMEZONE,
    });

    const payload = {
        topic,
        type: 2,
        start_time,
        timezone: tz,
        duration,
        settings: buildSettings(settings),
    };

    const client = await getZoomAxios(credentials);
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

async function createMeetingRecurrentDaily({
    topic, fechaInicio, horaInicio, duration, timezone, count, userId, settings, credentials
}) {
    const { start_time, timezone: tz } = buildStartFromInput({ fechaInicio, horaInicio, timezone });
    const payload = {
        topic, type: 8, start_time, timezone: tz, duration,
        recurrence: { type: 1, repeat_interval: 1, end_times: count },
        settings: buildSettings(settings),
    };

    const client = await getZoomAxios(credentials);
    const res = await client.post(`/users/${encodeURIComponent(userId)}/meetings`, payload);
    logger.info('[ZOOM] Reunión recurrente diaria creada:', res.data.id);
    return {
        meetingId: res.data.id, joinUrl: res.data.join_url, startUrl: res.data.start_url,
        password: res.data.password || null, occurrences: res.data.occurrences || null, raw: res.data
    };
}

async function createMeetingRecurrentWeekly({
    topic, fechaInicio, horaInicio, duration, timezone, count, userId, settings, credentials
}) {
    const { start_time, timezone: tz, weeklyDayZoom } = buildStartFromInput({ fechaInicio, horaInicio, timezone });
    const payload = {
        topic, type: 8, start_time, timezone: tz, duration,
        recurrence: { type: 2, repeat_interval: 1, weekly_days: String(weeklyDayZoom), end_times: count },
        settings: buildSettings(settings),
    };

    const client = await getZoomAxios(credentials);
    const res = await client.post(`/users/${encodeURIComponent(userId)}/meetings`, payload);
    logger.info('[ZOOM] Reunión recurrente semanal creada:', res.data.id);
    return {
        meetingId: res.data.id, joinUrl: res.data.join_url, startUrl: res.data.start_url,
        password: res.data.password || null, occurrences: res.data.occurrences || null, raw: res.data
    };
}

async function createMeetingRecurrentMonthly({
    topic, fechaInicio, horaInicio, duration, timezone, count, userId, settings, credentials
}) {
    const { start_time, timezone: tz, dayOfMonth } = buildStartFromInput({ fechaInicio, horaInicio, timezone });
    const payload = {
        topic, type: 8, start_time, timezone: tz, duration,
        recurrence: { type: 3, repeat_interval: 1, monthly_day: dayOfMonth, end_times: count },
        settings: buildSettings(settings),
    };

    const client = await getZoomAxios(credentials);
    const res = await client.post(`/users/${encodeURIComponent(userId)}/meetings`, payload);
    logger.info('[ZOOM] Reunión recurrente mensual creada:', res.data.id);
    return {
        meetingId: res.data.id, joinUrl: res.data.join_url, startUrl: res.data.start_url,
        password: res.data.password || null, occurrences: res.data.occurrences || null, raw: res.data
    };
}

/**
 * orquestador para llamadas a servicios zoom
 */
async function createMeetingFromInput(input, zoomConfig) {
    // Aquí la magia de inyección: el servicio NO sabe de .env
    // El Orchestrator envia: { credentials: { accountId, clientId, clientSecret }, hostEmail, settings }

    const { credentials, hostEmail, settings } = zoomConfig;

    if (!credentials || !credentials.accountId || !hostEmail) {
        throw new Error('[ZOOM] Faltan credenciales configuradas explícitamente o el Host Email');
    }

    const topic = input.nombreBase || input.nombreProducto || input.tagCurso || 'Curso';
    const timezone = settings?.timezone || DEFAULT_TIMEZONE;
    const duration = input.duracionMinutos;
    const fechaInicio = input.fechaInicio;
    const horaInicio = input.horaInicio;
    const userId = hostEmail;

    if (input.tipoReunion === 'recurrente') {
        const count = input.cantidadEncuentros;
        const kind = (input.tipoRecurrencia || 'semanal').toLowerCase();

        if (kind === 'diaria') {
            return createMeetingRecurrentDaily({ topic, fechaInicio, horaInicio, duration, timezone, count, userId, settings, credentials });
        }
        if (kind === 'mensual') {
            return createMeetingRecurrentMonthly({ topic, fechaInicio, horaInicio, duration, timezone, count, userId, settings, credentials });
        }
        return createMeetingRecurrentWeekly({ topic, fechaInicio, horaInicio, duration, timezone, count, userId, settings, credentials });
    }

    return createMeetingIndividual({ topic, fechaInicio, horaInicio, duration, timezone, userId, settings, credentials });
}

module.exports = {
    createMeetingFromInput,
};
