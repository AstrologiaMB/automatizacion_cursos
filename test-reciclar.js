require('dotenv').config();
const { ensureAutomation } = require('./services/automations');
const logger = require('./utils/logger');

// Force DRY RUN
process.env.DRY_RUN = 'true';

async function test() {
    console.log('--- TEST: Automation Recycling (DRY RUN) ---');

    // Mock Input
    const params = {
        sourceTag: 'PAM0425', // Old Tag (Must exist in FCRM title for test to find it)
        newTag: 'PAM9999_TEST',
        triggerProductId: 12345,
        startDateTime: 'lunes 99 de diciembre las 23:59',
        zoomJoinUrl: 'https://TEST-ZOOM-URL.com/j/123',
        includeBirthData: false // Test REMOVAL of birth data
    };

    console.log('Params:', params);

    try {
        const res = await ensureAutomation(params);
        console.log('Result:', res);
    } catch (e) {
        console.error('Error:', e);
    }
}

test();
