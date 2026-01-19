require('dotenv').config();
const axios = require('axios');
const { getFcrmConfig } = require('./services/config');

const fcrm = getFcrmConfig();
if (!fcrm.baseUrl || !fcrm.user) process.exit(1);

const auth = Buffer.from(`${fcrm.user}:${fcrm.pass}`).toString('base64');
const API_ROOT = `${fcrm.baseUrl}${fcrm.apiBase}`;

async function probeFunnels() {
    const url = `${API_ROOT}/funnels`;
    const targetId = 135;
    console.log(`\n--- Inspecting Target Funnel ID ${targetId} ---`);
    try {
        const detailRes = await axios.get(`${url}/${targetId}`, {
            headers: { Authorization: `Basic ${auth}` },
            params: { with: ['funnel_steps', 'triggers'] } // Try requesting explicit includes
        });
        const d = detailRes.data;
        const funnel = d.funnel || d.data || d;
        console.log('Top Keys:', Object.keys(funnel));

        if (funnel.settings) console.log('Settings:', JSON.stringify(funnel.settings, null, 2));
        if (funnel.conditions) console.log('Conditions:', JSON.stringify(funnel.conditions, null, 2));
        if (funnel.trigger) console.log('Trigger Obj:', JSON.stringify(funnel.trigger, null, 2));
        if (funnel.funnel_steps) console.log('Steps:', JSON.stringify(funnel.funnel_steps, null, 2).slice(0, 500));

    } catch (e) { console.log('Error 135:', e.message); }
}

probeFunnels();
