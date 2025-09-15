// Validators and parsers for input module (CommonJS)
'use strict';

const TAG_REGEX = /^[A-Za-z0-9_-]+$/;

function isNonEmptyString(s) {
  return typeof s === 'string' && s.trim().length > 0;
}

function validateTag(tag) {
  if (!isNonEmptyString(tag)) {
    return { ok: false, error: 'El tag no puede estar vacío.' };
  }
  if (!TAG_REGEX.test(tag.trim())) {
    return { ok: false, error: 'El tag solo puede contener letras, números, guiones y guiones bajos.' };
  }
  return { ok: true, value: tag.trim() };
}

function validateDateDDMMYYYY(str) {
  if (typeof str !== 'string') {
    return { ok: false, error: 'La fecha debe ser un string en formato DD/MM/YYYY.' };
  }
  const trimmed = str.trim();
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  if (!m) {
    return { ok: false, error: 'Formato inválido. Usa DD/MM/YYYY (ej: 11/12/2026).' };
  }
  const dd = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  const yyyy = parseInt(m[3], 10);
  if (mm < 1 || mm > 12) {
    return { ok: false, error: 'Mes inválido (01-12).' };
  }
  const daysInMonth = new Date(yyyy, mm, 0).getDate(); // JS month is 1-based here
  if (dd < 1 || dd > daysInMonth) {
    return { ok: false, error: `Día inválido para el mes. Debe ser 01-${String(daysInMonth).padStart(2, '0')}.` };
  }
  // Construct and verify date consistency
  const jsDate = new Date(yyyy, mm - 1, dd);
  if (
    jsDate.getFullYear() !== yyyy ||
    jsDate.getMonth() !== mm - 1 ||
    jsDate.getDate() !== dd
  ) {
    return { ok: false, error: 'Fecha inválida.' };
  }
  return {
    ok: true,
    value: `${String(dd).padStart(2, '0')}/${String(mm).padStart(2, '0')}/${String(yyyy)}`,
  };
}

function validateTimeHHmm(str) {
  if (typeof str !== 'string') {
    return { ok: false, error: 'La hora debe ser un string en formato HH:mm.' };
  }
  const trimmed = str.trim();
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(trimmed);
  if (!m) {
    return { ok: false, error: 'Formato inválido. Usa HH:mm (ej: 19:30).' };
  }
  const hh = m[1];
  const mm = m[2];
  return { ok: true, value: `${hh}:${mm}` };
}

function parsePriceUSD(input) {
  if (typeof input === 'number' && Number.isFinite(input)) {
    if (input < 0) return { ok: false, error: 'El precio no puede ser negativo.' };
    const rounded = Math.round(input * 100) / 100;
    return { ok: true, value: rounded };
  }
  if (typeof input !== 'string') {
    return { ok: false, error: 'El precio debe ser un número o string.' };
  }
  let s = input.trim();
  if (!s) return { ok: false, error: 'El precio no puede estar vacío.' };
  s = s.replace(/\$/g, '').replace(/\s+/g, '');
  // Permitir coma o punto como separador decimal
  s = s.replace(',', '.');
  const n = Number(s);
  if (!Number.isFinite(n)) return { ok: false, error: 'Precio inválido.' };
  if (n < 0) return { ok: false, error: 'El precio no puede ser negativo.' };
  const rounded = Math.round(n * 100) / 100;
  return { ok: true, value: rounded };
}

function parseYesNoBoolean(input) {
  if (typeof input === 'boolean') return { ok: true, value: input };
  if (typeof input !== 'string') {
    return { ok: false, error: 'Debe responder con "s" o "n".' };
  }
  const s = input.trim().toLowerCase();
  if (['s', 'si', 'sí', 'y', 'yes', 'true', '1'].includes(s)) return { ok: true, value: true };
  if (['n', 'no', 'false', '0'].includes(s)) return { ok: true, value: false };
  return { ok: false, error: 'Entrada inválida. Responda "s" (sí) o "n" (no).' };
}

function parseTipoReunion(input) {
  if (typeof input !== 'string') {
    return { ok: false, error: 'Tipo de reunión inválido.' };
  }
  const s = input.trim().toLowerCase();
  if (s === 'individual' || s === 'recurrente') {
    return { ok: true, value: s };
  }
  return { ok: false, error: 'Tipo de reunión debe ser "individual" o "recurrente".' };
}

function parseIntegerMin1(input) {
  let n;
  if (typeof input === 'number') {
    n = input;
  } else if (typeof input === 'string') {
    if (!input.trim()) return { ok: false, error: 'El número no puede estar vacío.' };
    n = Number(input.trim());
  } else {
    return { ok: false, error: 'Entrada inválida, debe ser un número.' };
  }
  if (!Number.isFinite(n) || !Number.isInteger(n)) return { ok: false, error: 'Debe ser un número entero.' };
  if (n < 1) return { ok: false, error: 'Debe ser un entero mayor o igual a 1.' };
  return { ok: true, value: n };
}

function parseOptionalPath(input) {
  if (input == null) return { ok: true, value: '' };
  if (typeof input !== 'string') return { ok: false, error: 'La ruta debe ser un string.' };
  const s = input.trim();
  // Permitimos vacío como "no provisto"
  return { ok: true, value: s };
}

/**
 * Parsea una elección numérica 1..2. Devuelve {ok, value:Number}
 */
function parseChoice12(input) {
  let n;
  if (typeof input === 'number') n = input;
  else if (typeof input === 'string') n = Number(input.trim());
  else return { ok: false, error: 'Entrada inválida, debe ser 1 o 2.' };

  if (!Number.isInteger(n) || n < 1 || n > 2) {
    return { ok: false, error: 'Elija 1 o 2.' };
  }
  return { ok: true, value: n };
}

/**
 * Parsea la recurrencia (1..3 o string) y devuelve el tipo canónico.
 * Acepta: 1|diaria, 2|semanal, 3|mensual
 */
function parseRecurrenceChoice(input) {
  if (typeof input === 'number') {
    if (input === 1) return { ok: true, value: 'diaria' };
    if (input === 2) return { ok: true, value: 'semanal' };
    if (input === 3) return { ok: true, value: 'mensual' };
    return { ok: false, error: 'Elija 1 (diaria), 2 (semanal) o 3 (mensual).' };
  }
  if (typeof input === 'string') {
    const s = input.trim().toLowerCase();
    if (s === '1' || s === 'diaria') return { ok: true, value: 'diaria' };
    if (s === '2' || s === 'semanal') return { ok: true, value: 'semanal' };
    if (s === '3' || s === 'mensual') return { ok: true, value: 'mensual' };
    return { ok: false, error: 'Entrada inválida. Use 1 (diaria), 2 (semanal) o 3 (mensual).' };
  }
  return { ok: false, error: 'Entrada inválida para recurrencia.' };
}

module.exports = {
  isNonEmptyString,
  validateTag,
  validateDateDDMMYYYY,
  validateTimeHHmm,
  parsePriceUSD,
  parseYesNoBoolean,
  parseTipoReunion,
  parseIntegerMin1,
  parseOptionalPath,
  parseChoice12,
  parseRecurrenceChoice,
};
