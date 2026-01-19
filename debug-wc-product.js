require('dotenv').config();
const axios = require('axios');

const { WP_BASE_URL, WC_CONSUMER_KEY, WC_CONSUMER_SECRET } = process.env;

if (!WP_BASE_URL || !WC_CONSUMER_KEY) {
    console.error('Missing .env credentials');
    process.exit(1);
}

const auth = Buffer.from(`${WC_CONSUMER_KEY}:${WC_CONSUMER_SECRET}`).toString('base64');
const productId = 38978;

async function checkProduct() {
    try {
        console.log(`Fetching Product ID ${productId}...`);
        const res = await axios.get(`${WP_BASE_URL}/wp-json/wc/v3/products/${productId}`, {
            headers: { Authorization: `Basic ${auth}` }
        });

        const p = res.data;
        console.log(`Product: ${p.id} - ${p.name}`);
        console.log('--- Checking _related_course ---');
        const related = p.meta_data.find(m => m.key === '_related_course');
        if (related) {
            console.log('FOUND _related_course:', JSON.stringify(related.value, null, 2));
        } else {
            console.log('NOT FOUND: _related_course meta key is missing.');
        }

    } catch (e) {
        console.error('Error:', e.message);
    }
}

checkProduct();
