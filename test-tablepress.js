// test-tablepress.js
const axios = require('axios');

// Credenciales WordPress (mismas que LearnDash)
const TABLEPRESS_CONFIG = {
  baseUrl: 'https://mariablaquier.com',
  username: 'cursos@mariablaquier.com',
  password: 'CiFLW3BJWkl5UePq8r3zHIZk',
  wpApiEndpoint: '/wp-json/wp/v2'
};

class TablePressTester {
  constructor() {
    // Usar misma autenticación que LearnDash
    const credentials = `${TABLEPRESS_CONFIG.username}:${TABLEPRESS_CONFIG.password}`;
    const encodedCredentials = Buffer.from(credentials).toString('base64');
    
    this.headers = {
      'Authorization': `Basic ${encodedCredentials}`,
      'Content-Type': 'application/json',
      'User-Agent': 'TablePressAutomation/1.0'
    };
  }

  buildWpUrl(endpoint) {
    return `${TABLEPRESS_CONFIG.baseUrl}${TABLEPRESS_CONFIG.wpApiEndpoint}${endpoint}`;
  }

  // Paso 1: Verificar si TablePress está instalado
  async checkTablePressInstallation() {
    try {
      console.log('🔍 Verificando instalación de TablePress...');
      
      // Buscar endpoints de TablePress
      const response = await axios.get(`${TABLEPRESS_CONFIG.baseUrl}/wp-json/`, {
        headers: this.headers,
        timeout: 10000
      });

      const routes = response.data.routes || {};
      const tablePressRoutes = Object.keys(routes).filter(route => 
        route.includes('tablepress') || route.includes('table')
      );

      console.log('✅ Rutas relacionadas con TablePress encontradas:');
      tablePressRoutes.forEach(route => {
        console.log(`- ${route}`);
      });

      if (tablePressRoutes.length === 0) {
        console.log('⚠️ No se encontraron rutas específicas de TablePress');
        console.log('🔍 Verificando custom post types...');
      }

      return tablePressRoutes;
    } catch (error) {
      console.log('❌ Error verificando TablePress:');
      console.log(`Status: ${error.response?.status || 'No response'}`);
      console.log(`Message: ${error.response?.data?.message || error.message}`);
      return [];
    }
  }

  // Paso 2: Buscar custom post types de TablePress
  async checkCustomPostTypes() {
    try {
      console.log('\n📋 Buscando custom post types...');
      
      const response = await axios.get(this.buildWpUrl('/types'), {
        headers: this.headers
      });

      const types = response.data || {};
      const tableTypes = Object.keys(types).filter(type => 
        type.includes('table') || types[type].name?.toLowerCase().includes('table')
      );

      console.log('✅ Post types relacionados con tablas:');
      tableTypes.forEach(type => {
        const typeInfo = types[type];
        console.log(`- ${type}: ${typeInfo.name} (REST: ${typeInfo.rest_base || 'N/A'})`);
      });

      return tableTypes;
    } catch (error) {
      console.log('❌ Error obteniendo custom post types:');
      console.log(`Status: ${error.response?.status}`);
      return [];
    }
  }

  // Paso 3: Probar endpoints potenciales de TablePress
  async testTablePressEndpoints() {
    console.log('\n🧪 Probando endpoints potenciales de TablePress...');
    
    const potentialEndpoints = [
      '/tablepress_table',
      '/tablepress-table', 
      '/tables',
      '/tp_table',
      '/tablepress'
    ];

    const results = {};

    for (const endpoint of potentialEndpoints) {
      try {
        console.log(`🔍 Probando: ${endpoint}...`);
        
        const response = await axios.get(this.buildWpUrl(endpoint), {
          headers: this.headers,
          timeout: 5000
        });
        
        results[endpoint] = {
          status: 'OK',
          data: response.data,
          count: Array.isArray(response.data) ? response.data.length : 'Object'
        };
        
        console.log(`✅ ${endpoint}: FUNCIONA (${results[endpoint].count} items)`);
        
        // Si encontramos tablas, mostrar información
        if (Array.isArray(response.data) && response.data.length > 0) {
          const firstTable = response.data[0];
          console.log(`  Ejemplo: ${firstTable.title?.rendered || firstTable.post_title || 'Sin título'}`);
        }
        
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

  // Paso 4: Intentar crear tabla usando WordPress posts
  async createTableAsPost() {
    try {
      console.log('\n🆕 Intentando crear tabla como custom post...');
      
      const tableData = {
        title: `Test Table ${Date.now()}`,
        content: this.generateTableHTML(),
        status: 'publish',
        type: 'tablepress_table', // Asumir que este es el post type
        meta: {
          '_tablepress_table_data': this.generateTableData()
        }
      };

      const response = await axios.post(this.buildWpUrl('/posts'), tableData, {
        headers: this.headers
      });

      const table = response.data;
      console.log('✅ Tabla creada como post:');
      console.log(`- ID: ${table.id}`);
      console.log(`- Título: ${table.title?.rendered}`);
      console.log(`- URL: ${table.link}`);
      
      return table;
    } catch (error) {
      console.log('❌ Error creando tabla como post:');
      console.log(`Status: ${error.response?.status}`);
      console.log(`Data: ${JSON.stringify(error.response?.data, null, 2)}`);
      return null;
    }
  }

  // Paso 5: Probar creación con diferentes métodos
  async testDirectTableCreation() {
    console.log('\n🔧 Probando métodos directos de creación...');
    
    const methods = [
      {
        name: 'TablePress Custom Endpoint',
        endpoint: '/tablepress',
        data: this.generateTablePressData()
      },
      {
        name: 'WordPress Custom Post',
        endpoint: '/tablepress_table',
        data: this.generatePostData()
      }
    ];

    for (const method of methods) {
      try {
        console.log(`🔍 Probando: ${method.name}...`);
        
        const response = await axios.post(this.buildWpUrl(method.endpoint), method.data, {
          headers: this.headers,
          timeout: 10000
        });
        
        console.log(`✅ ${method.name}: FUNCIONA`);
        console.log(`- ID: ${response.data.id || 'N/A'}`);
        console.log(`- Resultado: ${JSON.stringify(response.data).substring(0, 100)}...`);
        
        return { method: method.name, data: response.data };
        
      } catch (error) {
        console.log(`❌ ${method.name}: ${error.response?.status || 'ERROR'}`);
      }
    }

    return null;
  }

  // Generar datos de tabla para curso
  generateTableData() {
    return {
      data: [
        ['Cuando', 'Martes 11 de Diciembre 14:30 Argentina'],
        ['Horario de tu ciudad', 'https://www.timeanddate.com/worldclock/converter.html?iso=20241211T173000&p1=136']
      ]
    };
  }

  // Generar HTML de tabla
  generateTableHTML() {
    return `
      <table class="tablepress">
        <tbody>
          <tr>
            <td><strong>Cuando</strong></td>
            <td>Martes 11 de Diciembre 14:30 Argentina</td>
          </tr>
          <tr>
            <td><strong>Horario de tu ciudad</strong></td>
            <td><a href="https://www.timeanddate.com/worldclock/converter.html?iso=20241211T173000&p1=136" target="_blank">Ver en tu zona horaria</a></td>
          </tr>
        </tbody>
      </table>
    `;
  }

  // Generar datos para TablePress API
  generateTablePressData() {
    return {
      name: `Curso Test ${Date.now()}`,
      description: 'Tabla de horarios para curso automatizado',
      data: this.generateTableData().data
    };
  }

  // Generar datos para WordPress Post
  generatePostData() {
    return {
      title: `Tabla Curso ${Date.now()}`,
      content: this.generateTableHTML(),
      status: 'publish'
    };
  }

  // Buscar plugin de TablePress en plugins activos
  async checkActivePlugins() {
    try {
      console.log('\n🔌 Verificando plugins activos...');
      
      const response = await axios.get(this.buildWpUrl('/plugins'), {
        headers: this.headers
      });

      const plugins = response.data || [];
      const tablePressPlugins = plugins.filter(plugin => 
        plugin.name?.toLowerCase().includes('tablepress') ||
        plugin.plugin?.toLowerCase().includes('tablepress')
      );

      if (tablePressPlugins.length > 0) {
        console.log('✅ TablePress encontrado en plugins activos:');
        tablePressPlugins.forEach(plugin => {
          console.log(`- ${plugin.name} (${plugin.status})`);
        });
      } else {
        console.log('❌ TablePress no encontrado en plugins activos');
      }

      return tablePressPlugins;
    } catch (error) {
      console.log('❌ Error verificando plugins:');
      console.log(`Status: ${error.response?.status}`);
      return [];
    }
  }

  // Ejecutar todas las pruebas
  async runAllTests() {
    console.log('🚀 INICIANDO PRUEBAS TABLEPRESS\n');
    console.log('=============================================');
    
    const results = {
      installation: false,
      endpoints: false,
      creation: false,
      plugins: false
    };

    // Paso 1: Verificar instalación
    const routes = await this.checkTablePressInstallation();
    results.installation = routes.length > 0;

    // Paso 2: Verificar plugins activos
    const plugins = await this.checkActivePlugins();
    results.plugins = plugins.length > 0;

    // Paso 3: Buscar custom post types
    const postTypes = await this.checkCustomPostTypes();

    // Paso 4: Probar endpoints potenciales
    const endpointResults = await this.testTablePressEndpoints();
    results.endpoints = Object.values(endpointResults).some(r => r.status === 'OK');

    // Paso 5: Intentar crear tabla
    const creationResult = await this.testDirectTableCreation();
    results.creation = !!creationResult;

    // Si no funciona, intentar como post normal
    if (!results.creation) {
      const postTable = await this.createTableAsPost();
      results.creation = !!postTable;
    }

    // Resumen final
    console.log('\n=============================================');
    console.log('🎯 RESUMEN DE PRUEBAS TABLEPRESS:');
    console.log(`✅ Instalación: ${results.installation ? 'OK' : 'NO DETECTADA'}`);
    console.log(`✅ Plugins Activos: ${results.plugins ? 'OK' : 'NO ENCONTRADO'}`);
    console.log(`✅ Endpoints API: ${results.endpoints ? 'OK' : 'NO DISPONIBLES'}`);
    console.log(`✅ Crear Tablas: ${results.creation ? 'OK' : 'FALLO'}`);

    if (results.plugins && (results.endpoints || results.creation)) {
      console.log('\n🎉 TABLEPRESS DISPONIBLE PARA AUTOMATIZACIÓN');
      console.log('✅ Se puede integrar en el flujo automatizado');
    } else if (results.plugins && !results.endpoints) {
      console.log('\n⚠️ TABLEPRESS INSTALADO PERO API LIMITADA');
      console.log('✅ Posible automatización con método alternativo');
    } else {
      console.log('\n❌ TABLEPRESS NO DISPONIBLE PARA AUTOMATIZACIÓN');
      console.log('💡 Recomendación: Crear tablas manualmente o usar HTML directo');
    }

    return results;
  }
}

// Ejecutar las pruebas
async function main() {
  const tester = new TablePressTester();
  await tester.runAllTests();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = TablePressTester;