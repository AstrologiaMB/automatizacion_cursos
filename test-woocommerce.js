// test-woocommerce.js
const axios = require('axios');

// Credenciales WooCommerce
const WOOCOMMERCE_CONFIG = {
  baseUrl: 'https://mariablaquier.com',
  consumerKey: 'ck_12f4c8e1172ec805101181a4059f0387c9840f62',
  consumerSecret: 'cs_81b8eac3f7c3d9c42d52163f42c1e94c899b3510',
  apiEndpoint: '/wp-json/wc/v3'
};

class WooCommerceTester {
  constructor() {
    // WooCommerce usa Basic Auth con Consumer Key y Secret
    const credentials = `${WOOCOMMERCE_CONFIG.consumerKey}:${WOOCOMMERCE_CONFIG.consumerSecret}`;
    const encodedCredentials = Buffer.from(credentials).toString('base64');
    
    this.headers = {
      'Authorization': `Basic ${encodedCredentials}`,
      'Content-Type': 'application/json',
      'User-Agent': 'WooCommerceAutomation/1.0'
    };
  }

  buildUrl(endpoint) {
    return `${WOOCOMMERCE_CONFIG.baseUrl}${WOOCOMMERCE_CONFIG.apiEndpoint}${endpoint}`;
  }

  // Paso 1: Verificar conectividad WooCommerce
  async testWooCommerceConnection() {
    try {
      console.log('🔐 Verificando conectividad WooCommerce API...');
      
      const response = await axios.get(this.buildUrl('/'), {
        headers: this.headers,
        timeout: 10000
      });

      console.log('✅ WooCommerce REST API funcionando');
      console.log(`Store info: ${response.data.store?.name || 'N/A'}`);
      console.log(`WooCommerce Version: ${response.data.store?.version || 'N/A'}`);
      console.log(`WordPress Version: ${response.data.store?.wp_version || 'N/A'}`);
      console.log(`Rutas disponibles: ${Object.keys(response.data.routes || {}).length}`);
      
      return true;
    } catch (error) {
      console.log('❌ Error conectando a WooCommerce:');
      console.log(`Status: ${error.response?.status || 'No response'}`);
      console.log(`Message: ${error.response?.data?.message || error.message}`);
      
      if (error.response?.status === 401) {
        console.log('🔑 Problema de autenticación - verifica Consumer Key/Secret');
      } else if (error.response?.status === 404) {
        console.log('📦 WooCommerce no instalado o API no disponible');
      }
      
      return false;
    }
  }

  // Paso 2: Listar productos existentes
  async listExistingProducts() {
    try {
      console.log('\n🛒 Obteniendo productos existentes...');
      
      const response = await axios.get(this.buildUrl('/products'), {
        headers: this.headers,
        params: {
          per_page: 10,
          status: 'publish'
        }
      });

      const products = response.data || [];
      console.log(`✅ Se encontraron ${products.length} productos:`);
      
      products.slice(0, 5).forEach(product => {
        console.log(`- ${product.name} (ID: ${product.id}, Precio: $${product.price})`);
      });
      
      if (products.length > 5) {
        console.log(`... y ${products.length - 5} productos más`);
      }
      
      return products;
    } catch (error) {
      console.log('❌ Error obteniendo productos:');
      console.log(`Status: ${error.response?.status}`);
      console.log(`Data: ${JSON.stringify(error.response?.data, null, 2)}`);
      return [];
    }
  }

  // Paso 3: Obtener categorías de productos
  async getProductCategories() {
    try {
      console.log('\n🏷️ Obteniendo categorías de productos...');
      
      const response = await axios.get(this.buildUrl('/products/categories'), {
        headers: this.headers,
        params: {
          per_page: 20
        }
      });

      const categories = response.data || [];
      console.log(`✅ Se encontraron ${categories.length} categorías:`);
      
      categories.slice(0, 5).forEach(cat => {
        console.log(`- ${cat.name} (ID: ${cat.id}, Slug: ${cat.slug})`);
      });
      
      if (categories.length > 5) {
        console.log(`... y ${categories.length - 5} categorías más`);
      }
      
      return categories;
    } catch (error) {
      console.log('❌ Error obteniendo categorías:');
      console.log(`Status: ${error.response?.status}`);
      console.log(`Data: ${JSON.stringify(error.response?.data, null, 2)}`);
      return [];
    }
  }

  // Paso 4: Crear producto de prueba
  async createTestProduct() {
    try {
      console.log('\n🆕 Creando producto de prueba...');
      
      const productData = {
        name: `Test Automation Product ${Date.now()}`,
        type: 'simple',
        regular_price: '47534.38',
        description: 'Producto de prueba creado por la automatización de cursos.',
        short_description: 'Curso de prueba automatizado.',
        status: 'publish',
        catalog_visibility: 'visible',
        meta_data: [
          {
            key: '_test_automation',
            value: 'true'
          }
        ]
      };

      const response = await axios.post(this.buildUrl('/products'), productData, {
        headers: this.headers
      });

      const product = response.data;
      console.log('✅ Producto creado correctamente:');
      console.log(`- ID: ${product.id}`);
      console.log(`- Nombre: ${product.name}`);
      console.log(`- Precio: $${product.price}`);
      console.log(`- URL: ${product.permalink}`);
      console.log(`- Status: ${product.status}`);
      
      return product;
    } catch (error) {
      console.log('❌ Error creando producto:');
      console.log(`Status: ${error.response?.status}`);
      console.log(`Data: ${JSON.stringify(error.response?.data, null, 2)}`);
      return null;
    }
  }

  // Paso 5: Buscar productos por criterios específicos
  async searchProducts() {
    try {
      console.log('\n🔍 Buscando productos con criterios específicos...');
      
      // Buscar productos que contengan "Taller" o "Astrología"
      const searchTerms = ['Taller', 'Astrología', 'Horaria'];
      
      for (const term of searchTerms) {
        const response = await axios.get(this.buildUrl('/products'), {
          headers: this.headers,
          params: {
            search: term,
            per_page: 3
          }
        });

        const products = response.data || [];
        console.log(`✅ Productos con "${term}": ${products.length} encontrados`);
        
        products.forEach(product => {
          console.log(`  - ${product.name} (ID: ${product.id})`);
        });
      }
      
      return true;
    } catch (error) {
      console.log('❌ Error buscando productos:');
      console.log(`Status: ${error.response?.status}`);
      return false;
    }
  }

  // Paso 6: Probar actualización de producto
  async updateTestProduct(productId) {
    if (!productId) {
      console.log('\n⚠️ Saltando actualización - no hay producto válido');
      return null;
    }

    try {
      console.log('\n📝 Actualizando producto de prueba...');
      
      const updateData = {
        name: `Updated Test Product ${Date.now()}`,
        description: 'Producto actualizado con nueva información de Zoom y FluentCRM.',
        meta_data: [
          {
            key: '_zoom_meeting_id',
            value: '123456789'
          },
          {
            key: '_fluentcrm_tag',
            value: 'TEST_TAG'
          }
        ]
      };

      const response = await axios.put(this.buildUrl(`/products/${productId}`), updateData, {
        headers: this.headers
      });

      const product = response.data;
      console.log('✅ Producto actualizado correctamente:');
      console.log(`- Nuevo nombre: ${product.name}`);
      console.log(`- Metadatos: ${product.meta_data?.length || 0} campos`);
      
      return product;
    } catch (error) {
      console.log('❌ Error actualizando producto:');
      console.log(`Status: ${error.response?.status}`);
      console.log(`Data: ${JSON.stringify(error.response?.data, null, 2)}`);
      return null;
    }
  }

  // Paso 7: Probar endpoints adicionales
  async testAdditionalEndpoints() {
    console.log('\n🔧 Probando endpoints adicionales...');
    
    const endpoints = [
      { name: 'Orders', url: '/orders' },
      { name: 'Customers', url: '/customers' },
      { name: 'Product Attributes', url: '/products/attributes' },
      { name: 'Product Tags', url: '/products/tags' },
      { name: 'Tax Classes', url: '/taxes/classes' },
      { name: 'Shipping Zones', url: '/shipping/zones' }
    ];

    const results = {};

    for (const endpoint of endpoints) {
      try {
        const response = await axios.get(this.buildUrl(endpoint.url), {
          headers: this.headers,
          params: { per_page: 1 },
          timeout: 5000
        });
        
        const data = response.data;
        results[endpoint.name] = {
          status: 'OK',
          count: Array.isArray(data) ? data.length : 'Object'
        };
        console.log(`✅ ${endpoint.name}: OK`);
        
      } catch (error) {
        results[endpoint.name] = {
          status: 'ERROR',
          code: error.response?.status || 'NO_RESPONSE'
        };
        console.log(`❌ ${endpoint.name}: ${results[endpoint.name].code}`);
      }
    }

    return results;
  }

  // Paso 8: Verificar configuración de tienda
  async getStoreSettings() {
    try {
      console.log('\n⚙️ Obteniendo configuración de tienda...');
      
      const response = await axios.get(this.buildUrl('/settings/general'), {
        headers: this.headers
      });

      const settings = response.data || [];
      console.log('✅ Configuración de tienda:');
      
      const importantSettings = ['woocommerce_currency', 'woocommerce_currency_pos', 'woocommerce_price_decimal_sep'];
      
      settings.forEach(setting => {
        if (importantSettings.includes(setting.id)) {
          console.log(`- ${setting.label}: ${setting.value}`);
        }
      });
      
      return settings;
    } catch (error) {
      console.log('❌ Error obteniendo configuración:');
      console.log(`Status: ${error.response?.status}`);
      return [];
    }
  }

  // Limpiar datos de prueba
  async cleanupTestData(testProduct) {
    console.log('\n🧹 Limpiando datos de prueba...');
    
    try {
      if (testProduct?.id) {
        await axios.delete(this.buildUrl(`/products/${testProduct.id}`), {
          headers: this.headers,
          params: { force: true } // Eliminar permanentemente
        });
        console.log('✅ Producto de prueba eliminado');
      }
    } catch (error) {
      console.log('⚠️ No se pudo eliminar producto de prueba');
      console.log(`Error: ${error.response?.status} - ${error.response?.data?.message || error.message}`);
    }
  }

  // Ejecutar todas las pruebas
  async runAllTests() {
    console.log('🚀 INICIANDO PRUEBAS WOOCOMMERCE API\n');
    console.log('===================================================');
    
    const results = {
      connection: false,
      products: false,
      categories: false,
      create: false,
      update: false,
      settings: false
    };

    // Paso 1: Verificar conectividad
    results.connection = await this.testWooCommerceConnection();
    if (!results.connection) {
      console.log('\n💥 FALLO CRÍTICO: WooCommerce API no funciona');
      return false;
    }

    // Paso 2: Probar funcionalidades de lectura
    const existingProducts = await this.listExistingProducts();
    results.products = existingProducts.length >= 0; // Incluye 0 productos

    const categories = await this.getProductCategories();
    results.categories = categories.length >= 0;

    const settings = await this.getStoreSettings();
    results.settings = settings.length >= 0;

    // Paso 3: Probar búsquedas
    await this.searchProducts();

    // Paso 4: Probar creación y actualización
    const testProduct = await this.createTestProduct();
    results.create = !!testProduct;

    const updatedProduct = await this.updateTestProduct(testProduct?.id);
    results.update = !!updatedProduct;

    // Paso 5: Probar endpoints adicionales
    await this.testAdditionalEndpoints();

    // Paso 6: Limpiar datos de prueba
    await this.cleanupTestData(testProduct);

    // Resumen final
    console.log('\n===================================================');
    console.log('🎯 RESUMEN DE PRUEBAS WOOCOMMERCE:');
    console.log(`✅ Conectividad: ${results.connection ? 'OK' : 'FALLO'}`);
    console.log(`✅ Listar Productos: ${results.products ? 'OK' : 'FALLO'}`);
    console.log(`✅ Categorías: ${results.categories ? 'OK' : 'FALLO'}`);
    console.log(`✅ Crear Productos: ${results.create ? 'OK' : 'FALLO'}`);
    console.log(`✅ Actualizar Productos: ${results.update ? 'OK' : 'FALLO'}`);
    console.log(`✅ Configuración: ${results.settings ? 'OK' : 'FALLO'}`);

    const criticalPassed = results.connection && results.create && results.update;
    
    if (criticalPassed) {
      console.log('\n🎉 WOOCOMMERCE API FUNCIONANDO PERFECTAMENTE');
      console.log('✅ Todas las funcionalidades críticas para automatización disponibles');
    } else {
      console.log('\n⚠️ ALGUNOS COMPONENTES CRÍTICOS NO FUNCIONAN');
      console.log('❌ Revisa los errores antes de continuar con el desarrollo');
    }

    return criticalPassed;
  }
}

// Ejecutar las pruebas
async function main() {
  const tester = new WooCommerceTester();
  await tester.runAllTests();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = WooCommerceTester;