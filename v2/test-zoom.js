// v2/test-zoom.js
const { createMeetingFromInput } = require('./services/zoom');

async function run() {
    const input = {
        nombreBase: 'Test Curso Automator Multi-Account',
        duracionMinutos: 60,
        fechaInicio: '10/12/2026',
        horaInicio: '15:00',
        tipoReunion: 'individual'
    };

    // En producción, esto vendrá desde el input o BD
    const zoomConfig = {
        credentials: {
            accountId: process.env.ZOOM_ACCOUNT_ID_TEST, // Poner en .env.test si hace falta
            clientId: process.env.ZOOM_CLIENT_ID_TEST,
            clientSecret: process.env.ZOOM_CLIENT_SECRET_TEST
        },
        hostEmail: 'ejemplo@ejemplo.com',
        settings: { timezone: 'America/Argentina/Buenos_Aires' }
    };

    try {
        console.log('Creando reunión con cuenta inyectada...');
        const result = await createMeetingFromInput(input, zoomConfig);
        console.log('Resultado Exitoso:', result.joinUrl);
    } catch (e) {
        console.error('Error testeando Zoom:', e.message);
    }
}

if (require.main === module) {
    run();
}
