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
  console.log(chalk.bold('📌  GUÍA RÁPIDA DE REQUISITOS:'));
  console.log('');
  console.log(`  1. ${chalk.yellow('CLONAR MANUALMENTE')} el curso en LearnDash.`);
  console.log(`  2. ${chalk.yellow('Tag del Curso CLONADO')} (Ej: "PP0526_S").`);
  console.log(`  3. ${chalk.yellow('Tag del Curso VIEJO')} (Ej: "PP0425_s") -> Para reciclar SmartLinks y Automatizaciones.`);
  console.log(`  4. ${chalk.yellow('Fechas y Zoom')} (Inicio y Duración) definidos.`);
  console.log('');
  console.log(chalk.gray('ℹ️  QUÉ HARÁ ESTE SCRIPT AUTOMÁTICAMENTE:'));
  console.log(chalk.gray('    ✅ LearnDash: Agrega lección Zoom y corrige URL.'));
  console.log(chalk.gray('    ✅ WooCommerce: Actualiza producto y lo vincula.'));
  console.log(chalk.gray('    ✅ SmartLinks: Recicla el link viejo o crea uno nuevo.'));
  console.log(chalk.gray('    ✅ Automatizaciones: Recicla correo, trigger y listas.'));
  console.log(chalk.gray('    ⚠️  FluentForms: Avisará para renombrar/borrar historial MANUALMENTE.'));
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

  logger.info('[INPUT] Iniciando captura de datos (Workflow Manual)...');

  let currentDefaults = { ...defaults };
  let confirmed = false;
  let response;

  while (!confirmed) {
    // Cancelar con Ctrl+C lanza error, lo atrapamos
    try {
      response = await prompts([
        // REMOVED sourceTag prompt
        {
          type: 'text',
          name: 'tagCursoClonado', // Renamed from tagCurso
          message: '🏷️  Tag del curso YA CLONADO (Identificador único, ej: PP0326_S):',
          initial: currentDefaults.tagCursoClonado || '',
          validate: value => value.length < 3 ? 'El tag debe tener al menos 3 caracteres' : true
        },
        {
          type: 'text',
          name: 'nombreBase',
          message: '📝 Nombre INTERNO del curso (LearnDash) [Para verificar]:',
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
          name: 'smartLinkSourceTag',
          message: '🔗 Tag del curso ANTERIOR (opcional, para reciclar SmartLink):',
          initial: currentDefaults.smartLinkSourceTag || '',
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
            { title: 'Semanal', value: 'semanal' }, // Type 1: Daily, 2: Weekly, 3: Monthly
            { title: 'Mensual', value: 'mensual' }, // Zoom mapping might vary, assuming simple logic
            { title: 'Diaria', value: 'diaria' }
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
          name: 'timezoneLink',
          message: '🔗 Link Horario (Conversor timeanddate, opcional, enter para omitir):',
          initial: ''
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
          name: 'incluirFormulario',
          message: '📋 ¿Incluir solicitud de Datos de Nacimiento en el mail? (Si NO, se borrará esa sección del correo)',
          initial: true
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
    tagCurso: response.tagCursoClonado, // Map for compatibility/common usage
    cantidadEncuentros: response.tipoReunion === 'individual' ? 1 : response.cantidadEncuentros,
    tipoRecurrencia: response.tipoReunion === 'individual' ? undefined : response.tipoRecurrencia,
    existingTag: undefined, // Removed old logic
    // Defaults for removed fields
    precio: 0,
    incluirForo: false,
    incluirFormulario: false
  };

  logger.info('[INPUT] Datos recolectados y confirmados.');
  return finalData;
}

function sanitizeNonInteractive(defaults = {}) {
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

  // Check tagCursoClonado (or fallback to tagCurso for legacy json)
  const tagRaw = defaults.tagCursoClonado || defaults.tagCurso;
  const t = validateTag(tagRaw);
  if (!t.ok) throw new Error(`tagCursoClonado: ${t.error}`);
  out.tagCursoClonado = t.value;
  out.tagCurso = t.value; // Map for consistency

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

  out.precio = 0;
  out.cursoExistente = false;
  out.incluirForo = false;

  // Re-enabled for Automation Logic
  out.incluirFormulario = defaults.incluirFormulario === true;

  const rimg = parseOptionalPath(defaults.rutaImagen);
  out.rutaImagen = rimg.ok ? rimg.value : '';

  // Removed useExistingClonedCourse logic
  out.useExistingClonedCourse = false;

  // sourceTag no longer needed/supported (for cloning course)
  out.sourceTag = '';

  // SmartLink Source Tag
  out.smartLinkSourceTag = defaults.smartLinkSourceTag ? String(defaults.smartLinkSourceTag).trim() : '';

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
