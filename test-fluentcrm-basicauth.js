// test-fluentcrm-basicauth.js
const axios = require('axios');

// Credenciales FluentCRM Basic Auth
const FLUENTCRM_CONFIG = {
  baseUrl: 'https://mariablaquier.com',
  username: 'lsmnvll',
  password: 'MceLFSnIzRNpZmhGNbgaDWFG', // Sin espacios
  apiEndpoint: '/wp-json/fluent-crm/v2'
};

class FluentCRMBasicAuthTester {
  constructor() {
    // Crear Basic Auth header
    const credentials = `${FLUENTCRM_CONFIG.username}:${FLUENTCRM_CONFIG.password}`;
    const encodedCredentials = Buffer.from(credentials).toString('base64');
    
    this.headers = {
      'Authorization': `Basic ${encodedCredentials}`,
      'Content-Type': 'application/json',
      'User-Agent': 'CursoAutomation/1.0'
    };
  }

  buildUrl(endpoint) {
    return `${FLUENTCRM_CONFIG.baseUrl}${FLUENTCRM_CONFIG.apiEndpoint}${endpoint}`;
  }

  // Paso 1: Test de conectividad básica
  async testConnection() {
    try {
      console.log('🔐 Verificando Basic Auth con FluentCRM...');
      
      const response = await axios.get(this.buildUrl('/'), {
        headers: this.headers,
        timeout: 10000
      });

      console.log('✅ Autenticación Basic Auth EXITOSA');
      console.log(`Endpoints disponibles: ${Object.keys(response.data.routes || {}).length}`);
      
      return true;
    } catch (error) {
      console.log('❌ Error de autenticación:');
      console.log(`Status: ${error.response?.status || 'No response'}`);
      console.log(`Message: ${error.response?.data?.message || error.message}`);
      return false;
    }
  }

  // Paso 2: Listar tags
  async listTags() {
    try {
      console.log('\n🏷️ Obteniendo tags existentes...');
      
      const response = await axios.get(this.buildUrl('/tags'), {
        headers: this.headers
      });

      const tags = response.data.data || response.data.tags || [];
      console.log(`✅ Se encontraron ${tags.length} tags:`);
      
      tags.slice(0, 5).forEach(tag => {
        console.log(`- ${tag.title} (ID: ${tag.id})`);
      });
      
      if (tags.length > 5) {
        console.log(`... y ${tags.length - 5} tags más`);
      }
      
      return tags;
    } catch (error) {
      console.log('❌ Error obteniendo tags:');
      console.log(`Status: ${error.response?.status}`);
      console.log(`Data: ${JSON.stringify(error.response?.data, null, 2)}`);
      return [];
    }
  }

  // Paso 3: Crear tag de prueba
  async createTestTag() {
    try {
      console.log('\n🆕 Creando tag de prueba...');
      
      const tagData = {
        title: `AUTOMATION_TEST_${Date.now()}`,
        description: 'Tag de prueba para automatización de cursos'
      };

      const response = await axios.post(this.buildUrl('/tags'), tagData, {
        headers: this.headers
      });

      const tag = response.data.data || response.data.tag || response.data;
      console.log('✅ Tag creado correctamente:');
      console.log(`- ID: ${tag.id}`);
      console.log(`- Título: ${tag.title}`);
      console.log(`- Slug: ${tag.slug || 'N/A'}`);
      
      return tag;
    } catch (error) {
      console.log('❌ Error creando tag:');
      console.log(`Status: ${error.response?.status}`);
      console.log(`Data: ${JSON.stringify(error.response?.data, null, 2)}`);
      return null;
    }
  }

  // Paso 4: Listar listas
  async listLists() {
    try {
      console.log('\n📋 Obteniendo listas existentes...');
      
      const response = await axios.get(this.buildUrl('/lists'), {
        headers: this.headers
      });

      const lists = response.data.data || response.data.lists || [];
      console.log(`✅ Se encontraron ${lists.length} listas:`);
      
      lists.slice(0, 5).forEach(list => {
        console.log(`- ${list.title} (ID: ${list.id})`);
      });
      
      return lists;
    } catch (error) {
      console.log('❌ Error obteniendo listas:');
      console.log(`Status: ${error.response?.status}`);
      console.log(`Data: ${JSON.stringify(error.response?.data, null, 2)}`);
      return [];
    }
  }

  // Paso 5: Crear lista de prueba
  async createTestList() {
    try {
      console.log('\n📝 Creando lista de prueba...');
      
      const listData = {
        title: `Lista Automation ${Date.now()}`,
        description: 'Lista de prueba para automatización de cursos'
      };

      const response = await axios.post(this.buildUrl('/lists'), listData, {
        headers: this.headers
      });

      const list = response.data.data || response.data.list || response.data;
      console.log('✅ Lista creada correctamente:');
      console.log(`- ID: ${list.id}`);
      console.log(`- Título: ${list.title}`);
      
      return list;
    } catch (error) {
      console.log('❌ Error creando lista:');
      console.log(`Status: ${error.response?.status}`);
      console.log(`Data: ${JSON.stringify(error.response?.data, null, 2)}`);
      return null;
    }
  }

  // Paso 6: Test endpoints alternativos para contactos
  async testContactEndpoints() {
    console.log('\n👤 Probando endpoints de contactos...');
    
    const contactEndpoints = [
      '/subscribers',     // Endpoint principal documentado
      '/contacts',        // Endpoint alternativo
      '/subscribers?per_page=1' // Con parámetros
    ];

    let workingEndpoint = null;

    for (const endpoint of contactEndpoints) {
      try {
        const response = await axios.get(this.buildUrl(endpoint), {
          headers: this.headers,
          timeout: 5000
        });
        
        console.log(`✅ ${endpoint}: OK`);
        workingEndpoint = endpoint;
        
        // Mostrar estructura de datos
        const data = response.data.data || response.data;
        if (Array.isArray(data) && data.length > 0) {
          console.log(`  Sample contact fields: ${Object.keys(data[0]).join(', ')}`);
        }
        break;
        
      } catch (error) {
        console.log(`❌ ${endpoint}: ${error.response?.status || 'ERROR'}`);
      }
    }

    return workingEndpoint;
  }

  // Paso 7: Crear contacto de prueba
  async createTestContact(workingEndpoint) {
    if (!workingEndpoint) {
      console.log('\n⚠️ Saltando creación de contacto - no hay endpoint válido');
      return null;
    }

    try {
      console.log('\n👤 Creando contacto de prueba...');
      
      const contactData = {
        email: `automation.test.${Date.now()}@test.com`,
        first_name: 'Automation',
        last_name: 'Test',
        status: 'subscribed'
      };

      const response = await axios.post(this.buildUrl(workingEndpoint), contactData, {
        headers: this.headers
      });

      const contact = response.data.data || response.data.subscriber || response.data;
      console.log('✅ Contacto creado correctamente:');
      console.log(`- ID: ${contact.id}`);
      console.log(`- Email: ${contact.email}`);
      console.log(`- Nombre: ${contact.first_name} ${contact.last_name}`);
      
      return contact;
    } catch (error) {
      console.log('❌ Error creando contacto:');
      console.log(`Status: ${error.response?.status}`);
      console.log(`Data: ${JSON.stringify(error.response?.data, null, 2)}`);
      return null;
    }
  }

  // Paso 8: Test automatizaciones
  async testAutomations() {
    console.log('\n⚙️ Probando endpoints de automatizaciones...');
    
    const automationEndpoints = [
      '/funnels',
      '/campaigns',
      '/sequences',
      '/automations',
      '/email-sequences'
    ];

    const results = {};

    for (const endpoint of automationEndpoints) {
      try {
        const response = await axios.get(this.buildUrl(endpoint), {
          headers: this.headers,
          timeout: 5000
        });
        
        const data = response.data.data || response.data;
        results[endpoint] = {
          status: 'OK',
          count: Array.isArray(data) ? data.length : 'Object'
        };
        console.log(`✅ ${endpoint}: OK (${results[endpoint].count} items)`);
        
      } catch (error) {
        results[endpoint] = {
          status: 'ERROR',
          code: error.response?.status || 'NO_RESPONSE'
        };
        console.log(`❌ ${endpoint}: ${results[endpoint].code}`);
      }
    }

    return results;
  }

  // Limpiar datos de prueba
  async cleanupTestData(testTag, testList, testContact) {
    console.log('\n🧹 Limpiando datos de prueba...');
    
    const cleanupTasks = [
      {
        name: 'tag',
        data: testTag,
        endpoint: '/tags'
      },
      {
        name: 'lista',
        data: testList,
        endpoint: '/lists'
      },
      {
        name: 'contacto',
        data: testContact,
        endpoint: '/subscribers'
      }
    ];

    for (const task of cleanupTasks) {
      try {
        if (task.data?.id) {
          await axios.delete(this.buildUrl(`${task.endpoint}/${task.data.id}`), {
            headers: this.headers,
            timeout: 5000
          });
          console.log(`✅ ${task.name} de prueba eliminado`);
        }
      } catch (error) {
        console.log(`⚠️ No se pudo eliminar ${task.name} de prueba (${error.response?.status || 'error'})`);
      }
    }
  }

  // Ejecutar todas las pruebas
  async runAllTests() {
    console.log('🚀 INICIANDO PRUEBAS FLUENTCRM CON BASIC AUTH\n');
    console.log('=======================================================');
    
    const results = {
      connection: false,
      tags: false,
      lists: false,
      contacts: false,
      automations: false
    };

    // Paso 1: Verificar autenticación
    results.connection = await this.testConnection();
    if (!results.connection) {
      console.log('\n💥 FALLO CRÍTICO: Autenticación Basic Auth no funciona');
      return false;
    }

    // Paso 2: Probar funcionalidades críticas
    const tags = await this.listTags();
    const testTag = await this.createTestTag();
    results.tags = !!testTag;

    const lists = await this.listLists();
    const testList = await this.createTestList();
    results.lists = !!testList;

    const contactEndpoint = await this.testContactEndpoints();
    const testContact = await this.createTestContact(contactEndpoint);
    results.contacts = !!testContact;

    const automationResults = await this.testAutomations();
    results.automations = Object.values(automationResults).some(r => r.status === 'OK');

    // Paso 3: Limpiar datos de prueba
    await this.cleanupTestData(testTag, testList, testContact);

    // Resumen final
    console.log('\n=======================================================');
    console.log('🎯 RESUMEN DE PRUEBAS FLUENTCRM (BASIC AUTH):');
    console.log(`✅ Autenticación: ${results.connection ? 'OK' : 'FALLO'}`);
    console.log(`✅ Tags: ${results.tags ? 'OK' : 'FALLO'}`);
    console.log(`✅ Listas: ${results.lists ? 'OK' : 'FALLO'}`);
    console.log(`✅ Contactos: ${results.contacts ? 'OK' : 'FALLO'}`);
    console.log(`✅ Automatizaciones: ${results.automations ? 'OK' : 'FALLO'}`);

    const criticalPassed = results.connection && results.tags && results.lists;
    
    if (criticalPassed) {
      console.log('\n🎉 FLUENTCRM API FUNCIONANDO CORRECTAMENTE');
      console.log('✅ Funcionalidades críticas para automatización disponibles');
      
      if (!results.contacts) {
        console.log('⚠️ Contactos: Funcionalidad limitada pero no crítica para el proyecto');
      }
      if (!results.automations) {
        console.log('⚠️ Automatizaciones: Pueden requerir configuración manual');
      }
    } else {
      console.log('\n🚨 PROBLEMAS CRÍTICOS CON FLUENTCRM');
      console.log('❌ Verifica la configuración antes de continuar');
    }

    return criticalPassed;
  }
}

// Ejecutar las pruebas
async function main() {
  const tester = new FluentCRMBasicAuthTester();
  await tester.runAllTests();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = FluentCRMBasicAuthTester;