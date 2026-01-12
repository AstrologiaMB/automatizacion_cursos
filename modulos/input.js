// modulos/input.js
// CLI interactivo para recopilar y validar datos del curso usando 'prompts'
// Reemplaza la versión anterior basada en readline

'use strict';

const prompts = require('prompts');
const chalk = require('chalk');
const logger = require('../utils/logger');
const {
  isNonEmptyString,
  validateTag,
  validateDateDDMMYYYY,
  validateTimeHHmm,
  parsePriceUSD,
  parseIntegerMin1,
  parseOptionalPath,
} = require('../utils/validator');

/**
 * Adaptadores de validación para prompts
 */
const val = {
  text: (v) => isNonEmptyString(v) ? true : 'El valor no puede estar vacío.',
  date: (v) => {
    const r = validateDateDDMMYYYY(v);
    return r.ok ? true : r.error;
  },
  time: (v) => {
    const r = validateTimeHHmm(v);
    return r.ok ? true : r.error;
  },
  int: (v) => {
    const r = parseIntegerMin1(v);
    return r.ok ? true : r.error;
  },
  tag: (v) => {
    const r = validateTag(v);
    return r.ok ? true : r.error;
  },
  price: (v) => {
    const r = parsePriceUSD(v);
    return r.ok ? true : r.error;
  },
  path: (v) => {
    const r = parseOptionalPath(v || '');
    return r.ok ? true : r.error;
  }
};

function printWelcomeMessage() {
  console.log(chalk.cyan('╔════════════════════════════════════════════════════════════════════╗'));
  console.log(chalk.cyan('║         🤖 AUTOMATIZACIÓN DE CURSOS - MARÍA BLAQUIER 🤖          ║'));
  console.log(chalk.cyan('╚════════════════════════════════════════════════════════════════════╝'));
  console.log('');
  console.log(chalk.bold('📌  ANTES DE COMENZAR, ASEGÚRATE DE TENER:'));
  console.log('');
  console.log(`  1. ${chalk.yellow('Imagen del Producto')} generada (Canva) y descargada en tu PC.`);
  console.log(`  2. ${chalk.yellow('Tag del Curso MOLDE')} (si vas a clonar). Ej: "TPL01".`);
  console.log(`  3. ${chalk.yellow('Código TAG Nuevo')} definido para el nuevo curso. Ej: "ASTRO2026".`);
  console.log(`  4. ${chalk.yellow('Fechas y Horarios')} definidos.`);
  console.log('');
  console.log(chalk.gray('ℹ️  Este script creará/actualizará:'));
  console.log(chalk.gray('    - Reunión Zoom'));
  console.log(chalk.gray('    - Tags/Listas en FluentCRM'));
  console.log(chalk.gray('    - Curso y Lección en LearnDash (Clonado o Nuevo)'));
  console.log(chalk.gray('    - Vinculación con Producto WooCommerce'));
  console.log('');
}

async function getInputInteractive(defaults = {}) {
  printWelcomeMessage();

  // Pause/Confirm to ensure user reads it
  const ready = await prompts({
    type: 'confirm',
    name: 'value',
    message: '¿Estás listo para comenzar?',
    initial: true
  });

  if (!ready.value) {
    console.log(chalk.yellow('👋 Operación cancelada. ¡Vuelve cuando tengas todo listo!'));
    process.exit(0);
  }

  logger.info('[INPUT] Iniciando captura de datos...');

  let currentDefaults = { ...defaults };
  let confirmed = false;
  let response;

  while (!confirmed) {
    // Cancelar con Ctrl+C lanza error, lo atrapamos
    try {
      response = await prompts([
        {
          type: 'text',
          name: 'sourceTag',
          message: '🏷️  ¿Tag del curso MOLDE a clonar? (Dejar vacío para crear desde cero)',
          initial: currentDefaults.sourceTag || '',
        },
        {
          type: 'text',
          name: 'nombreBase',
          message: '📝 Nombre INTERNO del curso (LearnDash):',
          initial: currentDefaults.nombreBase || '',
          validate: value => value.length < 5 ? 'El nombre debe tener al menos 5 caracteres' : true
        },
        {
          type: 'text',
          name: 'nombreProducto',
          message: '🛒 Nombre PÚBLICO del producto (WooCommerce):',
          initial: (prev, values) => currentDefaults.nombreProducto || values.nombreBase, // Sugerir el mismo
          validate: value => value.length < 5 ? 'El nombre debe tener al menos 5 caracteres' : true
        },
        {
          type: 'text',
          name: 'fechaInicio',
          message: '📅 Fecha de inicio (DD/MM/YYYY):',
          initial: currentDefaults.fechaInicio || '',
          validate: value => /^\d{2}\/\d{2}\/\d{4}$/.test(value) ? true : 'Formato inválido. Use DD/MM/YYYY'
        },
        {
          type: 'text',
          name: 'horaInicio',
          message: 'clock Hora de inicio (HH:mm):',
          initial: currentDefaults.horaInicio || '19:00',
          validate: value => /^\d{2}:\d{2}$/.test(value) ? true : 'Formato inválido. Use HH:mm'
        },
        {
          type: 'number',
          name: 'duracionMinutos',
          message: '⏳ Duración del encuentro (minutos):',
          initial: currentDefaults.duracionMinutos || 90,
          min: 15
        },
        {
          type: 'text',
          name: 'tagCurso',
          message: '🏷️  TAG del NUEVO curso (Identificador único, ej: AD0825):',
          initial: currentDefaults.tagCurso || '',
          validate: value => value.length < 3 ? 'El tag debe tener al menos 3 caracteres' : true
        },
        {
          type: 'select',
          name: 'tipoReunion',
          message: '🎥 ¿Tipo de reunión Zoom?',
          choices: [
            { title: 'Recurrente (Mismo Link)', value: 'recurrente' },
            { title: 'Individual (Una vez)', value: 'individual' }
          ],
          initial: currentDefaults.tipoReunion === 'individual' ? 1 : 0
        },
        {
          type: (prev, values) => values.tipoReunion === 'recurrente' ? 'select' : null,
          name: 'tipoRecurrencia',
          message: '🔄 Frecuencia de repetición:',
          choices: [
            { title: 'Semanal', value: 1 }, // Type 1: Daily, 2: Weekly, 3: Monthly
            { title: 'Mensual', value: 2 }, // Zoom mapping might vary, assuming simple logic
            { title: 'Diaria', value: 0 }
          ],
          initial: 0
        },
        {
          type: (prev, values) => values.tipoReunion === 'recurrente' ? 'number' : null,
          name: 'cantidadEncuentros',
          message: '🔢 Cantidad de encuentros:',
          initial: currentDefaults.cantidadEncuentros || 4,
          min: 2,
          max: 50
        },
        {
          type: 'select',
          name: 'modoUpdate',
          message: '⚙️  ¿Modo Actualización? (Si el curso Tag destino ya existe)',
          choices: [
            { title: 'No (Crear o Fallar si existe)', value: false },
            { title: 'Sí (Actualizar existente)', value: true }
          ],
          initial: 0
        },
        {
          type: 'text',
          name: 'rutaImagen',
          message: '🖼️  Ruta absoluta de imagen destacada (Opcional):',
          initial: currentDefaults.rutaImagen || '',
          validate: val.path
        },
        {
          type: 'confirm',
          name: 'confirmar',
          message: '¿Confirmar estos datos y comenzar automatización?',
          initial: true
        }
      ], {
        onCancel: () => {
          logger.warn('[INPUT] Operación cancelada por el usuario (Ctrl+C).');
          process.exit(0);
        }
      });
    } catch (e) {
      logger.error('Error en prompts:', e);
      return null;
    }

    if (response.confirmar) {
      confirmed = true;
    } else {
      // Si dice NO, actualizamos defaults con lo que ingresó y volvemos a iterar
      logger.info('\n↺ Mantenemos los datos ingresados. Puedes editar lo que necesites.\n');
      currentDefaults = { ...currentDefaults, ...response };
      // Ajuste específico: si eligió individual, forzamos null en recurrencia para el default
      if (response.tipoReunion === 'individual') {
        currentDefaults.tipoRecurrencia = undefined;
        currentDefaults.cantidadEncuentros = 1;
      }
    }
  }

  const finalData = {
    ...response,
    cantidadEncuentros: response.tipoReunion === 'individual' ? 1 : response.cantidadEncuentros,
    tipoRecurrencia: response.tipoReunion === 'individual' ? undefined : response.tipoRecurrencia,
    existingTag: response.useExistingClonedCourse ? response.existingTag : undefined,
    // Defaults para campos eliminados
    precio: 0,
    incluirForo: false,
    incluirFormulario: false
  };

  logger.info('[INPUT] Datos recolectados y confirmados.');
  return finalData;
}

function sanitizeNonInteractive(defaults = {}) {
  // Misma lógica de sanitización para modo no interactivo
  // Reutilizamos la lógica del archivo original, adaptada mínimamente
  const out = {};
  if (!isNonEmptyString(defaults.nombreBase)) throw new Error('nombreBase requerido');
  out.nombreBase = String(defaults.nombreBase).trim();

  if (!isNonEmptyString(defaults.nombreProducto)) throw new Error('nombreProducto requerido');
  out.nombreProducto = String(defaults.nombreProducto).trim();

  const d = validateDateDDMMYYYY(defaults.fechaInicio);
  if (!d.ok) throw new Error(`fechaInicio: ${d.error}`);
  out.fechaInicio = d.value;

  const h = validateTimeHHmm(defaults.horaInicio);
  if (!h.ok) throw new Error(`horaInicio: ${h.error}`);
  out.horaInicio = h.value;

  const dur = parseIntegerMin1(defaults.duracionMinutos);
  if (!dur.ok) throw new Error(`duracionMinutos: ${dur.error}`);
  out.duracionMinutos = dur.value;

  const t = validateTag(defaults.tagCurso);
  if (!t.ok) throw new Error(`tagCurso: ${t.error}`);
  out.tagCurso = t.value;

  out.tipoReunion = defaults.tipoReunion === 'recurrente' ? 'recurrente' : 'individual';

  if (out.tipoReunion === 'recurrente') {
    out.tipoRecurrencia = ['diaria', 'semanal', 'mensual'].includes(defaults.tipoRecurrencia)
      ? defaults.tipoRecurrencia
      : 'semanal';
    const ce = parseIntegerMin1(defaults.cantidadEncuentros);
    out.cantidadEncuentros = ce.ok ? ce.value : 1;
  } else {
    out.cantidadEncuentros = 1;
  }

  /* 
  const p = parsePriceUSD(defaults.precio);
  if (!p.ok) throw new Error(`precio: ${p.error}`);
  out.precio = p.value;
  */
  out.precio = 0; // Default

  out.cursoExistente = Boolean(defaults.cursoExistente);
  // out.incluirForo = Boolean(defaults.incluirForo);
  // out.incluirFormulario = Boolean(defaults.incluirFormulario);
  out.incluirForo = false;
  out.incluirFormulario = false;

  const rimg = parseOptionalPath(defaults.rutaImagen);
  out.rutaImagen = rimg.ok ? rimg.value : '';

  out.useExistingClonedCourse = Boolean(defaults.useExistingClonedCourse);
  if (out.useExistingClonedCourse) {
    const et = validateTag(defaults.existingTag);
    if (!et.ok) throw new Error(`existingTag: ${et.error}`);
    out.existingTag = et.value;
  }

  // NEW: sourceTag for auto-cloning (optional)
  if (defaults.sourceTag && typeof defaults.sourceTag === 'string') {
    out.sourceTag = defaults.sourceTag.trim();
  } else {
    out.sourceTag = '';
  }

  return out;
}

/**
 * Obtiene los datos del curso.
 * @param {Object} options
 * @param {boolean} [options.interactive=true]
 * @param {Object} [options.defaults]
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

// Test directo
if (require.main === module) {
  (async () => {
    try {
      const data = await getInputData({ interactive: true });
      if (data) {
        // eslint-disable-next-line no-console
        console.log('\nResultado final:', JSON.stringify(data, null, 2));
      }
    } catch (err) {
      logger.error('Error:', err);
    }
  })();
}
