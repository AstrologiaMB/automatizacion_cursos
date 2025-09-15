// modulos/input.js
// CLI interactivo para recopilar y validar datos del curso (CommonJS)

'use strict';

const readline = require('readline');
const logger = require('../utils/logger');
const {
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
} = require('../utils/validator');

function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function question(rl, q) {
  return new Promise((resolve) => rl.question(q, resolve));
}

function fmtPrompt(label, def) {
  if (def === undefined || def === null || def === '') return `${label}: `;
  return `${label} [${def}]: `;
}

async function askValidated(rl, label, parserFn, defValue) {
  // parserFn debe devolver { ok: boolean, value?: any, error?: string }
  // Si el usuario presiona enter y hay default, usamos default y validamos
  while (true) {
    const ans = await question(rl, fmtPrompt(label, defValue));
    const raw = (ans == null || ans === '') ? defValue : ans;
    const res = parserFn(raw);
    if (res && res.ok) return res.value;
    logger.warn(`[INPUT] ${res && res.error ? res.error : 'Entrada inválida.'}`);
  }
}

async function askStringNonEmpty(rl, label, defValue) {
  while (true) {
    const ans = await question(rl, fmtPrompt(label, defValue));
    const raw = (ans == null || ans === '') ? defValue : ans;
    if (isNonEmptyString(raw)) return raw.trim();
    logger.warn('[INPUT] El valor no puede estar vacío.');
  }
}

async function getInputInteractive(defaults = {}) {
  const rl = createInterface();
  try {
    logger.info('[INPUT] Iniciando captura de datos del curso...');
    const nombreBase = await askStringNonEmpty(rl, '1) Nombre del curso', defaults.nombreBase);

    const nombreProducto = await askStringNonEmpty(
      rl,
      '1.b) Nombre del producto (título público en la tienda)',
      defaults.nombreProducto
    );

    const fechaInicio = await askValidated(
      rl,
      '2) Fecha inicio (DD/MM/YYYY)',
      (v) => validateDateDDMMYYYY(v),
      defaults.fechaInicio
    );

    const horaInicio = await askValidated(
      rl,
      '2.b) Hora de inicio (HH:mm, zona Buenos Aires)',
      (v) => validateTimeHHmm(v),
      defaults.horaInicio ?? '19:30'
    );

    const duracionMinutos = await askValidated(
      rl,
      '2.c) Duración en minutos (entero >= 1)',
      (v) => parseIntegerMin1(v),
      defaults.duracionMinutos ?? 90
    );

    const tagCurso = await askValidated(
      rl,
      '3) Tag identificatorio (alfanumérico, -, _)',
      (v) => validateTag(v),
      defaults.tagCurso
    );

    const useExistingClonedCourse = await askValidated(
      rl,
      '3.b) ¿Usar curso ya clonado por tag? (s/n)',
      (v) => parseYesNoBoolean(v),
      defaults.useExistingClonedCourse
    );

    let existingTag = undefined;
    if (useExistingClonedCourse) {
      existingTag = await askValidated(
        rl,
        '3.c) Ingresá el Tag del curso clonado (ej. AM1026)',
        (v) => validateTag(v),
        defaults.existingTag
      );
    }

    const tipoReunionChoice = await askValidated(
      rl,
      '4) Tipo de reunión (1: individual, 2: recurrente)',
      (v) => parseChoice12(v),
      defaults.tipoReunion === 'recurrente' ? 2 : 1
    );
    const tipoReunion = tipoReunionChoice === 1 ? 'individual' : 'recurrente';

    let tipoRecurrencia = undefined;
    if (tipoReunion === 'recurrente') {
      tipoRecurrencia = await askValidated(
        rl,
        '4.b) Tipo de recurrencia (1: diaria, 2: semanal, 3: mensual)',
        (v) => parseRecurrenceChoice(v),
        defaults.tipoRecurrencia ?? '2'
      );
    }
    let cantidadEncuentros = 1;
    if (tipoReunion === 'recurrente') {
      cantidadEncuentros = await askValidated(
        rl,
        '5) Cantidad de encuentros (entero >= 1)',
        (v) => parseIntegerMin1(v),
        defaults.cantidadEncuentros ?? 2
      );
    } else {
      logger.info('[INPUT] Tipo "individual" → cantidadEncuentros = 1');
    }

    const precio = await askValidated(
      rl,
      '6) Precio en USD (ej: 47.50)',
      (v) => parsePriceUSD(v),
      defaults.precio
    );

    const cursoExistente = await askValidated(
      rl,
      '7) ¿Curso existente? (s/n)',
      (v) => parseYesNoBoolean(v),
      defaults.cursoExistente
    );

    const incluirForo = await askValidated(
      rl,
      '8) ¿Incluir foro? (s/n)',
      (v) => parseYesNoBoolean(v),
      defaults.incluirForo
    );

    const incluirFormulario = await askValidated(
      rl,
      '9) ¿Incluir formulario? (s/n)',
      (v) => parseYesNoBoolean(v),
      defaults.incluirFormulario
    );

    const rutaImagen = await askValidated(
      rl,
      '10) Ruta imagen (opcional, dejar vacío si no aplica)',
      (v) => parseOptionalPath(v),
      defaults.rutaImagen ?? ''
    );

    const collected = {
      nombreBase,
      nombreProducto,
      fechaInicio, // DD/MM/YYYY
      horaInicio, // HH:mm
      duracionMinutos, // entero
      tagCurso: tagCurso,
      useExistingClonedCourse: !!useExistingClonedCourse,
      existingTag: useExistingClonedCourse ? String(existingTag).trim() : undefined,
      tipoReunion,
      tipoRecurrencia: tipoReunion === 'recurrente' ? tipoRecurrencia : undefined,
      cantidadEncuentros: tipoReunion === 'individual' ? 1 : cantidadEncuentros,
      precio, // número con 2 decimales
      cursoExistente,
      incluirForo,
      incluirFormulario,
      rutaImagen, // string (posiblemente vacío)
    };

    logger.info('[INPUT] Resumen de datos:');
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(collected, null, 2));

    const confirmar = await askValidated(
      rl,
      '¿Confirmar y continuar? (s/n)',
      (v) => parseYesNoBoolean(v),
      's'
    );

    if (!confirmar) {
      logger.warn('[INPUT] Operación cancelada por el usuario.');
      return null;
    }

    logger.info('[INPUT] Datos confirmados.');
    return collected;
  } finally {
    rl.close();
  }
}

function sanitizeNonInteractive(defaults = {}) {
  // Valida/sanitiza defaults y devuelve objeto en el formato requerido.
  const out = {};

  if (!isNonEmptyString(defaults.nombreBase)) {
    throw new Error('nombreBase es requerido y no puede estar vacío.');
  }
  out.nombreBase = String(defaults.nombreBase).trim();

  if (!isNonEmptyString(defaults.nombreProducto)) {
    throw new Error('nombreProducto es requerido y no puede estar vacío.');
  }
  out.nombreProducto = String(defaults.nombreProducto).trim();

  const d = validateDateDDMMYYYY(defaults.fechaInicio);
  if (!d.ok) throw new Error(`fechaInicio inválida: ${d.error}`);
  out.fechaInicio = d.value;

  const h = validateTimeHHmm(defaults.horaInicio);
  if (!h.ok) throw new Error(`horaInicio inválida: ${h.error}`);
  out.horaInicio = h.value;

  const dur = parseIntegerMin1(defaults.duracionMinutos);
  if (!dur.ok) throw new Error(`duracionMinutos inválida: ${dur.error}`);
  out.duracionMinutos = dur.value;

  const t = validateTag(defaults.tagCurso);
  if (!t.ok) throw new Error(`tagCurso inválido: ${t.error}`);
  out.tagCurso = t.value;

  const tr = parseTipoReunion(defaults.tipoReunion);
  if (!tr.ok) throw new Error(`tipoReunion inválido: ${tr.error}`);
  out.tipoReunion = tr.value;

  if (out.tipoReunion === 'recurrente') {
    const rec = parseRecurrenceChoice(defaults.tipoRecurrencia ?? 'semanal');
    if (!rec.ok) throw new Error(`tipoRecurrencia inválida: ${rec.error}`);
    out.tipoRecurrencia = rec.value;

    const ce = parseIntegerMin1(defaults.cantidadEncuentros);
    if (!ce.ok) throw new Error(`cantidadEncuentros inválida: ${ce.error}`);
    out.cantidadEncuentros = ce.value;
  } else {
    out.cantidadEncuentros = 1;
  }

  const p = parsePriceUSD(defaults.precio);
  if (!p.ok) throw new Error(`precio inválido: ${p.error}`);
  out.precio = p.value;

  const ceBool = parseYesNoBoolean(defaults.cursoExistente);
  if (!ceBool.ok) throw new Error(`cursoExistente inválido: ${ceBool.error}`);
  out.cursoExistente = ceBool.value;

  const ifo = parseYesNoBoolean(defaults.incluirForo);
  if (!ifo.ok) throw new Error(`incluirForo inválido: ${ifo.error}`);
  out.incluirForo = ifo.value;

  const ifm = parseYesNoBoolean(defaults.incluirFormulario);
  if (!ifm.ok) throw new Error(`incluirFormulario inválido: ${ifm.error}`);
  out.incluirFormulario = ifm.value;

  const ri = parseOptionalPath(defaults.rutaImagen ?? '');
  if (!ri.ok) throw new Error(`rutaImagen inválida: ${ri.error}`);
  out.rutaImagen = ri.value;

  // Flags para curso clonado existente (opcionales)
  out.useExistingClonedCourse = Boolean(defaults.useExistingClonedCourse);
  if (out.useExistingClonedCourse) {
    const et = validateTag(defaults.existingTag);
    if (!et.ok) throw new Error(`existingTag inválido: ${et.error}`);
    out.existingTag = et.value;
  }

  return out;
}

/**
 * Obtiene los datos del curso.
 * @param {Object} options
 * @param {boolean} [options.interactive=true] - Si true, abre CLI; si false, valida defaults.
 * @param {Object} [options.defaults] - Valores por defecto para prellenar/resolver sin CLI.
 * @returns {Promise<Object|null>} Objeto con los campos del curso o null si cancelado por el usuario en modo interactivo.
 */
async function getInputData(options = {}) {
  const { interactive = true, defaults = {} } = options;
  if (interactive) {
    return await getInputInteractive(defaults);
  }
  return sanitizeNonInteractive(defaults);
}

module.exports = {
  getInputData,
};

// Permitir ejecución directa: `node modulos/input.js`
if (require.main === module) {
  (async () => {
    try {
      const data = await getInputData({ interactive: true });
      if (data) {
        logger.info('[INPUT] Resultado final (JSON abajo).');
        // eslint-disable-next-line no-console
        console.log(JSON.stringify(data, null, 2));
      }
      process.exit(0);
    } catch (err) {
      logger.error('[INPUT] Error:', err.message || err);
      process.exit(1);
    }
  })();
}
