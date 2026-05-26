// v2/test-woo.js
const { updateWooProductByInput } = require('./services/woocommerce');

async function testWoo() {
    const woocommerceConfig = {
        baseUrl: process.env.WP_BASE_URL,
        consumerKey: process.env.WC_CONSUMER_KEY,
        consumerSecret: process.env.WC_CONSUMER_SECRET
    };

    // We mock wpCredentials only for testing media uploads, normally passed by orchestrator
    const wpConfig = {
        baseUrl: process.env.WP_BASE_URL,
        username: process.env.WP_USER,
        appPassword: process.env.WP_APP_PASSWORD
    };

    const dummyInput = {
        tagCurso: 'XX0126', // Reemplaza por un tag que exista o que empiece con letras para buscar sku (ej: XXzoom)
        nombreProducto: 'Test Producto Unitario (Woo)',
        startDateTime: 'lunes 22 de enero las 15:00',
        timezoneLink: 'https://timeanddate.com/test'
    };

    try {
        console.log('--- Iniciando Prueba Modular de WooCommerce ---');

        const result = await updateWooProductByInput({
            input: dummyInput,
            courseId: null, // Sin LearnDash
            wcCredentials: woocommerceConfig,
            wpCredentials: wpConfig, // necesario si pasáramos img local
            fcrmTags: {
                pId: 10,       // Mock de FluentCRM
                newTagId: 99   // Mock de FluentCRM
            }
        });

        console.log('Resultado Woo:', result);
    } catch (e) {
        console.error('Error testeando Woo:', e.message);
    }
}

if (require.main === module) {
    testWoo();
}
