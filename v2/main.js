// v2/main.js
// CLI Runner (Mesero) que interactúa con la terminal 

'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const ora = require('ora');
const chalk = require('chalk');
const logger = require('../utils/logger');
const { getInputData } = require('../modulos/input');
const CourseAutomator = require('./automator');

async function main() {
    try {
        const nonInteractiveJson = process.env.NON_INTERACTIVE_JSON;
        const input = await getInputData(
            nonInteractiveJson
                ? { interactive: false, defaults: JSON.parse(nonInteractiveJson) }
                : { interactive: true }
        );

        if (!input) return;

        console.log('');
        const mainSpinner = ora({ text: 'Iniciando...', color: 'cyan' }).start();

        // Seleccionar credenciales de Zoom según el input (Cuenta 1 o 2)
        const isZoom2 = input.zoomAccountIndex === '2';
        const zoomConfig = {
            credentials: {
                accountId: isZoom2 ? process.env.ZOOM2_ACCOUNT_ID : process.env.ZOOM_ACCOUNT_ID,
                clientId: isZoom2 ? process.env.ZOOM2_CLIENT_ID : process.env.ZOOM_CLIENT_ID,
                clientSecret: isZoom2 ? process.env.ZOOM2_CLIENT_SECRET : process.env.ZOOM_CLIENT_SECRET
            },
            hostEmail: isZoom2 ? process.env.ZOOM2_HOST_EMAIL : process.env.ZOOM_HOST_EMAIL,
            settings: { timezone: 'America/Argentina/Buenos_Aires' }
        };

        const globalConfig = {
            zoom: zoomConfig,
            wp: {
                baseUrl: process.env.WP_BASE_URL,
                username: process.env.WP_USER,
                appPassword: process.env.WP_APP_PASSWORD,
            },
            fluentcrm: {
                credentials: {
                    baseUrl: process.env.WP_BASE_URL,
                    user: process.env.FLUENTCRM_API_USERNAME,
                    pass: process.env.FLUENTCRM_API_PASSWORD
                },
                basePTagId: 181
            },
            woo: {
                baseUrl: process.env.WP_BASE_URL,
                consumerKey: process.env.WC_CONSUMER_KEY,
                consumerSecret: process.env.WC_CONSUMER_SECRET
            }
        };

        const automator = new CourseAutomator(globalConfig);

        // Conectar los eventos del Orquestador al CLI (Spiners)
        automator.on('step:progress', msg => { mainSpinner.text = msg; });
        automator.on('step:success', msg => { mainSpinner.succeed(chalk.green(msg)); mainSpinner.start(); });
        automator.on('step:warn', msg => { mainSpinner.warn(chalk.yellow(msg)); mainSpinner.start(); });
        automator.on('step:skip', msg => { mainSpinner.info(chalk.dim(msg)); mainSpinner.start(); });
        automator.on('step:done', msg => { mainSpinner.stop(); console.log(chalk.green(`✅ ${msg}`)); });

        // Ejecutar Pipeline
        const result = await automator.run(input);

        // Resumen CLI
        console.log('');
        console.log(chalk.bold.inverse(' RESUMEN V2 '));
        console.log(chalk.cyan('Curso: '.padEnd(20)) + `${input.nombreBase} (${input.tagCurso})`);
        console.log(chalk.cyan('Zoom ID: '.padEnd(20)) + (result.zoom?.meetingId || chalk.red('No creado')));
        console.log(chalk.cyan('WC Product ID: '.padEnd(20)) + (result.woocommerce?.productId || '-'));

    } catch (err) {
        logger.error('Error fatal en v2 main:', err);
        process.exit(1);
    }
}

if (require.main === module) {
    main().then(() => process.exit(0));
}

module.exports = { main };
