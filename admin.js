// admin.js
// Script de administración post-curso: cierre, satisfacción, cambio de tags, borrar lista.

'use strict';

require('dotenv').config();

const ora = require('ora');
const chalk = require('chalk');
const prompts = require('prompts');
const axios = require('axios');
const logger = require('./utils/logger');
const {
  getFcrmClient,
  findTagByCode,
  findListByCode,
  getContactIdsByTag,
  swapTagOnContacts,
  deleteList,
  deleteTag,
  createCampaign,
  sendCampaign,
  ensureTagFromCode,
} = require('./services/fluentcrm');
const { computeSkuCandidates } = require('./services/woocommerce');

const TEMPLATE_CIERRE       = 97291;
const TEMPLATE_SATISFACCION = 97290;

// ─── Utilidades ───────────────────────────────

function extractAlumniTag(courseTag) {
  return courseTag.match(/^([A-Za-z]+)/)?.[1].toUpperCase() || null;
}

function replacePlaceholders(text, { nombreCurso, tagCurso, productoId }) {
  if (!text) return text;
  return text
    .replace(/\{[Nn]ombre del curso\s*\}/g, nombreCurso)
    .replace(/\{tag curso\}/gi, tagCurso.toLowerCase())
    .replace(/\{id producto\}/gi, String(productoId || ''));
}

async function fetchTemplate(client, templateId) {
  const resp = await client.get(`/wp-json/fluent-crm/v2/templates/${templateId}`);
  const t = resp.data?.template || resp.data;
  return {
    subject: t.email_subject || '',
    body: t.post_content || '',
  };
}

function buildWcClient() {
  const { WP_BASE_URL, WC_CONSUMER_KEY, WC_CONSUMER_SECRET } = process.env;
  if (!WP_BASE_URL || !WC_CONSUMER_KEY || !WC_CONSUMER_SECRET) return null;
  const auth = Buffer.from(`${WC_CONSUMER_KEY}:${WC_CONSUMER_SECRET}`).toString('base64');
  return axios.create({
    baseURL: WP_BASE_URL.replace(/\/+$/, '') + '/wp-json/wc/v3',
    timeout: 15000,
    headers: { Authorization: `Basic ${auth}` },
  });
}

// ─── Tareas ───────────────────────────────────

async function taskEnviarEmail({ client, templateId, tagId, tagCurso, nombreCurso, productoId, tipo }) {
  const spinner = ora(`Preparando correo de ${tipo}...`).start();
  let campaign;
  try {
    const tpl = await fetchTemplate(client, templateId);
    const subject = replacePlaceholders(tpl.subject, { nombreCurso, tagCurso, productoId });
    const body    = replacePlaceholders(tpl.body,    { nombreCurso, tagCurso, productoId });
    const title   = `${tipo === 'cierre' ? 'Cierre' : 'Satisfacción'} ${tagCurso} - ${nombreCurso}`;

    campaign = await createCampaign({
      payload: {
        title,
        email_subject: subject,
        email_body: body,
        template_id: String(templateId),
        design_template: 'simple',
        settings: {
          subscribers: [{ list: 'all', tag: String(tagId) }],
          sending_filter: 'list_tag',
          sending_type: 'instant',
          mailer_settings: { from_name: '', from_email: '', reply_to_name: '', reply_to_email: '', is_custom: 'no' },
        },
      },
    });
    spinner.succeed(chalk.green(`Campaña "${title}" creada como borrador (ID ${campaign.id})`));
  } catch (e) {
    spinner.fail(chalk.red(`Error preparando correo de ${tipo}: ${e.message}`));
    throw e;
  }

  // Confirmación antes de enviar
  const { confirmar } = await prompts({
    type: 'confirm',
    name: 'confirmar',
    message: `¿Enviar ahora a los alumnos con tag ${tagCurso}?`,
    initial: false,
  }, { onCancel: () => ({ confirmar: false }) });

  if (confirmar) {
    const s2 = ora('Enviando...').start();
    try {
      await sendCampaign({ campaignId: campaign.id });
      s2.succeed(chalk.green(`Correo de ${tipo} enviado.`));
      return { sent: true, campaignId: campaign.id };
    } catch (e) {
      s2.fail(chalk.red(`Error enviando: ${e.message}`));
      return { sent: false, campaignId: campaign.id, error: e.message };
    }
  }

  console.log(chalk.dim(`  → Quedó como borrador. Podés enviarlo desde FluentCRM > Campañas.`));
  return { sent: false, campaignId: campaign.id };
}

async function taskCambiarTags({ tagCurso, tagId, alumniTag }) {
  const spinner = ora(`Obteniendo contactos con tag ${tagCurso}...`).start();
  let contactIds, total;
  try {
    ({ ids: contactIds, total } = await getContactIdsByTag({ tagId }));
    spinner.stop();
  } catch (e) {
    spinner.fail(chalk.red(`Error obteniendo contactos: ${e.message}`));
    throw e;
  }

  if (!contactIds.length) {
    console.log(chalk.yellow(`No se encontraron contactos con tag ${tagCurso}.`));
    return { count: 0 };
  }

  // Confirmación de cantidad antes de operar
  const { confirmarCantidad } = await prompts({
    type: 'confirm',
    name: 'confirmarCantidad',
    message: `Se encontraron ${chalk.bold(total)} contactos con tag ${tagCurso}. ¿Es correcto?`,
    initial: true,
  }, { onCancel: () => ({ confirmarCantidad: false }) });

  if (!confirmarCantidad) {
    console.log(chalk.yellow('  → Operación cancelada. No se modificó ningún contacto.'));
    return { count: 0 };
  }

  const spinnerSwap = ora(`Asegurando tag alumni "${alumniTag}"...`).start();
  try {
    // Crea el tag alumni si no existe
    const alumniRes = await ensureTagFromCode({ code: alumniTag });
    const alumniTagId = alumniRes.id;

    spinnerSwap.text = `Cambiando tags en ${contactIds.length} contactos (${tagCurso} → ${alumniTag})...`;
    const { updated, failed } = await swapTagOnContacts({
      contactIds,
      removeTagId: tagId,
      addTagId: alumniTagId,
    });

    if (failed > 0) {
      spinnerSwap.fail(chalk.red(`Swap incompleto: ${updated} actualizados, ${failed} fallidos. El tag "${tagCurso}" NO fue eliminado para evitar pérdida de datos.`));
      return { count: updated };
    }

    // Solo borrar el tag si el swap fue 100% exitoso
    spinnerSwap.stop();
    const { confirmarDeleteTag } = await prompts({
      type: 'confirm',
      name: 'confirmarDeleteTag',
      message: chalk.red(`¿Borrar permanentemente el tag "${tagCurso}" de FluentCRM? Esta acción no se puede deshacer.`),
      initial: false,
    }, { onCancel: () => ({ confirmarDeleteTag: false }) });

    if (!confirmarDeleteTag) {
      console.log(chalk.yellow(`  → Tag "${tagCurso}" conservado. Los contactos ya fueron migrados a "${alumniTag}".`));
      return { count: updated };
    }

    const spinnerDel = ora(`Eliminando tag "${tagCurso}"...`).start();
    await deleteTag({ tagId });
    spinnerDel.succeed(chalk.green(`Tags actualizados en ${updated} contactos: ${tagCurso} → ${alumniTag}. Tag "${tagCurso}" eliminado.`));
    return { count: updated };
  } catch (e) {
    spinnerSwap.fail(chalk.red(`Error cambiando tags: ${e.message}`));
    throw e;
  }
}

async function taskBorrarLista({ listRes }) {
  const { confirmarDeleteLista } = await prompts({
    type: 'confirm',
    name: 'confirmarDeleteLista',
    message: chalk.red(`¿Borrar permanentemente la lista "${listRes.title}" (ID ${listRes.id}) de FluentCRM? Esta acción no se puede deshacer.`),
    initial: false,
  }, { onCancel: () => ({ confirmarDeleteLista: false }) });

  if (!confirmarDeleteLista) {
    console.log(chalk.yellow(`  → Lista "${listRes.title}" conservada.`));
    return;
  }

  const spinner = ora(`Eliminando lista "${listRes.title}"...`).start();
  try {
    await deleteList({ listId: listRes.id });
    spinner.succeed(chalk.green(`Lista "${listRes.title}" eliminada.`));
  } catch (e) {
    spinner.fail(chalk.red(`Error borrando lista: ${e.message}`));
    throw e;
  }
}

// ─── Orquestador ──────────────────────────────

async function main() {
  console.log('');
  console.log(chalk.bold.inverse(' ADMINISTRACIÓN POST-CURSO '));
  console.log('');

  // 1. Input básico
  const input = await prompts([
    {
      type: 'text',
      name: 'tagCurso',
      message: '🏷️  Tag del curso (ej: AD0626):',
      validate: v => v.trim().length >= 3 ? true : 'Mínimo 3 caracteres',
    },
    {
      type: 'text',
      name: 'nombreCurso',
      message: '📝 Nombre del curso (ej: Astrología Dinámica):',
      validate: v => v.trim().length >= 3 ? true : 'Mínimo 3 caracteres',
    },
  ], { onCancel: () => process.exit(0) });

  if (!input.tagCurso) return;

  const tagCurso   = input.tagCurso.trim().toUpperCase();
  const nombreCurso = input.nombreCurso.trim();
  const alumniTag  = extractAlumniTag(tagCurso);

  // 2. Resolver IDs en FluentCRM
  let spinner = ora('Buscando en FluentCRM...').start();
  let tagRes, listRes;
  try {
    [tagRes, listRes] = await Promise.all([
      findTagByCode({ code: tagCurso }),
      findListByCode({ code: tagCurso }),
    ]);
    if (!tagRes) {
      spinner.fail(chalk.red(`No se encontró el tag "${tagCurso}" en FluentCRM. Verificá el código.`));
      return;
    }
    spinner.succeed(chalk.green(`Tag encontrado: "${tagRes.title}" (ID ${tagRes.id})`));
    if (listRes) logger.info(`[ADMIN] Lista: "${listRes.title}" (ID ${listRes.id})`);
    else         logger.warn(`[ADMIN] No se encontró lista para "${tagCurso}".`);
  } catch (e) {
    spinner.fail(chalk.red(`Error consultando FluentCRM: ${e.message}`));
    return;
  }

  // 3. Resolver producto WooCommerce (para link de reseña en email satisfacción)
  let productoId = '';
  spinner = ora('Buscando producto WooCommerce...').start();
  try {
    const wcClient = buildWcClient();
    if (wcClient) {
      const skus = computeSkuCandidates(tagCurso);
      for (const sku of skus) {
        const r = await wcClient.get('/products', { params: { sku, per_page: 5 } });
        if (Array.isArray(r.data) && r.data.length) { productoId = r.data[0].id; break; }
      }
      spinner.succeed(chalk.green(productoId
        ? `Producto WooCommerce: ID ${productoId}`
        : 'Producto no encontrado (link de reseña quedará vacío)'));
    } else {
      spinner.info(chalk.dim('WooCommerce no configurado.'));
    }
  } catch (e) {
    spinner.warn(chalk.yellow('No se pudo buscar el producto WooCommerce.'));
  }

  // 4. Selección de tareas
  console.log('');
  const { tareas } = await prompts({
    type: 'multiselect',
    name: 'tareas',
    message: '☑️  ¿Qué tareas ejecutar? (Espacio = seleccionar, Enter = confirmar)',
    choices: [
      { title: 'Enviar correo de cierre',           value: 'cierre' },
      { title: 'Enviar correo de satisfacción',     value: 'satisfaccion' },
      { title: `Cambiar tags: ${tagCurso} → ${alumniTag || '?'}`, value: 'tags', disabled: !alumniTag },
      { title: 'Borrar lista del curso',            value: 'lista', disabled: !listRes },
    ],
  }, { onCancel: () => process.exit(0) });

  if (!tareas || !tareas.length) {
    console.log(chalk.yellow('No se seleccionó ninguna tarea.'));
    return;
  }

  console.log('');
  const client    = getFcrmClient();
  const resultados = [];

  // 5. Ejecutar tareas seleccionadas
  if (tareas.includes('cierre')) {
    try {
      const r = await taskEnviarEmail({
        client, templateId: TEMPLATE_CIERRE,
        tagId: tagRes.id, tagCurso, nombreCurso, productoId, tipo: 'cierre',
      });
      resultados.push({ tarea: 'Correo cierre', estado: r.sent ? 'Enviado' : 'Borrador', id: r.campaignId });
    } catch { resultados.push({ tarea: 'Correo cierre', estado: 'ERROR' }); }
  }

  if (tareas.includes('satisfaccion')) {
    try {
      const r = await taskEnviarEmail({
        client, templateId: TEMPLATE_SATISFACCION,
        tagId: tagRes.id, tagCurso, nombreCurso, productoId, tipo: 'satisfacción',
      });
      resultados.push({ tarea: 'Correo satisfacción', estado: r.sent ? 'Enviado' : 'Borrador', id: r.campaignId });
    } catch { resultados.push({ tarea: 'Correo satisfacción', estado: 'ERROR' }); }
  }

  if (tareas.includes('tags') && alumniTag) {
    try {
      const r = await taskCambiarTags({ tagCurso, tagId: tagRes.id, alumniTag });
      resultados.push({ tarea: `Tags ${tagCurso}→${alumniTag}`, estado: `${r.count} contactos` });
    } catch { resultados.push({ tarea: 'Cambio de tags', estado: 'ERROR' }); }
  }

  if (tareas.includes('lista') && listRes) {
    try {
      await taskBorrarLista({ listRes });
      resultados.push({ tarea: 'Borrar lista', estado: 'Eliminada' });
    } catch { resultados.push({ tarea: 'Borrar lista', estado: 'ERROR' }); }
  }

  // 6. Resumen final
  console.log('');
  console.log(chalk.bold.inverse(' RESUMEN '));
  console.log('');
  for (const r of resultados) {
    const estado = r.estado === 'ERROR' ? chalk.red(r.estado) : chalk.green(r.estado);
    console.log(chalk.cyan(r.tarea.padEnd(28)) + ': ' + estado + (r.id ? chalk.dim(` (campaña ${r.id})`) : ''));
  }
  console.log('');
  console.log(chalk.green('✅ Proceso finalizado.'));
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch(err => {
    logger.error('Error fatal:', err);
    process.exit(1);
  });
}

module.exports = { main };
