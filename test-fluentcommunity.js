// test-fluentcommunity.js
const axios = require('axios');

// Credenciales WordPress (mismas que anteriores)
const FLUENTCOMMUNITY_CONFIG = {
  baseUrl: 'https://mariablaquier.com',
  username: 'cursos@mariablaquier.com',
  password: 'CiFLW3BJWkl5UePq8r3zHIZk',
  wpApiEndpoint: '/wp-json/wp/v2',
  fcApiEndpoint: '/wp-json/fluent-community/v1' // Endpoint probable
};

class FluentCommunityTester {
  constructor() {
    // Usar misma autenticación que otros scripts
    const credentials = `${FLUENTCOMMUNITY_CONFIG.username}:${FLUENTCOMMUNITY_CONFIG.password}`;
    const encodedCredentials = Buffer.from(credentials).toString('base64');
    
    this.headers = {
      'Authorization': `Basic ${encodedCredentials}`,
      'Content-Type': 'application/json',
      'User-Agent': 'FluentCommunityAutomation/1.0'
    };
  }

  buildWpUrl(endpoint) {
    return `${FLUENTCOMMUNITY_CONFIG.baseUrl}${FLUENTCOMMUNITY_CONFIG.wpApiEndpoint}${endpoint}`;
  }

  buildFcUrl(endpoint) {
    return `${FLUENTCOMMUNITY_CONFIG.baseUrl}${FLUENTCOMMUNITY_CONFIG.fcApiEndpoint}${endpoint}`;
  }

  // Paso 1: Verificar si FluentCommunity está instalado
  async checkFluentCommunityInstallation() {
    try {
      console.log('🔍 Verificando instalación de FluentCommunity...');
      
      // Buscar rutas relacionadas con FluentCommunity
      const response = await axios.get(`${FLUENTCOMMUNITY_CONFIG.baseUrl}/wp-json/`, {
        headers: this.headers,
        timeout: 10000
      });

      const routes = response.data.routes || {};
      const fluentCommunityRoutes = Object.keys(routes).filter(route => 
        route.includes('fluent-community') || route.includes('fluentcommunity')
      );

      console.log('✅ Rutas relacionadas con FluentCommunity:');
      if (fluentCommunityRoutes.length > 0) {
        fluentCommunityRoutes.forEach(route => {
          console.log(`- ${route}`);
        });
      } else {
        console.log('⚠️ No se encontraron rutas específicas de FluentCommunity en REST API');
      }

      return fluentCommunityRoutes;
    } catch (error) {
      console.log('❌ Error verificando FluentCommunity:');
      console.log(`Status: ${error.response?.status || 'No response'}`);
      return [];
    }
  }

  // Paso 2: Verificar plugins activos
  async checkActivePlugins() {
    try {
      console.log('\n🔌 Verificando plugins activos...');
      
      const response = await axios.get(this.buildWpUrl('/plugins'), {
        headers: this.headers
      });

      const plugins = response.data || [];
      const fluentCommunityPlugins = plugins.filter(plugin => 
        plugin.name?.toLowerCase().includes('fluent') && 
        plugin.name?.toLowerCase().includes('community')
      );

      if (fluentCommunityPlugins.length > 0) {
        console.log('✅ FluentCommunity encontrado en plugins activos:');
        fluentCommunityPlugins.forEach(plugin => {
          console.log(`- ${plugin.name} (${plugin.status})`);
        });
      } else {
        console.log('❌ FluentCommunity no encontrado en plugins activos');
      }

      return fluentCommunityPlugins;
    } catch (error) {
      console.log('❌ Error verificando plugins:');
      console.log(`Status: ${error.response?.status}`);
      return [];
    }
  }

  // Paso 3: Probar endpoints potenciales de FluentCommunity
  async testFluentCommunityEndpoints() {
    console.log('\n🧪 Probando endpoints potenciales de FluentCommunity...');
    
    const potentialEndpoints = [
      '/fluent-community/v1/spaces',
      '/fluent-community/v1/posts',
      '/fluent-community/v1/members',
      '/fluent-community/v1/courses',
      '/fluentcommunity/v1/spaces',
      '/fluentcommunity/v1/posts'
    ];

    const results = {};

    for (const endpoint of potentialEndpoints) {
      try {
        console.log(`🔍 Probando: ${endpoint}...`);
        
        const response = await axios.get(`${FLUENTCOMMUNITY_CONFIG.baseUrl}/wp-json${endpoint}`, {
          headers: this.headers,
          timeout: 5000
        });
        
        results[endpoint] = {
          status: 'OK',
          data: response.data,
          count: Array.isArray(response.data) ? response.data.length : 'Object'
        };
        
        console.log(`✅ ${endpoint}: FUNCIONA (${results[endpoint].count} items)`);
        
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

  // Paso 4: Buscar custom post types de FluentCommunity
  async checkCustomPostTypes() {
    try {
      console.log('\n📋 Buscando custom post types de FluentCommunity...');
      
      const response = await axios.get(this.buildWpUrl('/types'), {
        headers: this.headers
      });

      const types = response.data || {};
      const communityTypes = Object.keys(types).filter(type => 
        type.includes('community') || 
        type.includes('space') ||
        type.includes('fc_') ||
        types[type].name?.toLowerCase().includes('community')
      );

      console.log('✅ Post types relacionados con community:');
      communityTypes.forEach(type => {
        const typeInfo = types[type];
        console.log(`- ${type}: ${typeInfo.name} (REST: ${typeInfo.rest_base || 'N/A'})`);
      });

      return communityTypes;
    } catch (error) {
      console.log('❌ Error obteniendo custom post types:');
      console.log(`Status: ${error.response?.status}`);
      return [];
    }
  }

  // Paso 5: Verificar si existe portal FluentCommunity
  async checkFluentCommunityPortal() {
    try {
      console.log('\n🌐 Verificando portal FluentCommunity...');
      
      // Intentar acceder al portal directamente
      const portalUrls = [
        '/community',
        '/portal',
        '/fluent-community',
        '/fc'
      ];

      for (const portalUrl of portalUrls) {
        try {
          const response = await axios.get(`${FLUENTCOMMUNITY_CONFIG.baseUrl}${portalUrl}`, {
            timeout: 5000,
            maxRedirects: 0 // No seguir redirects
          });
          
          console.log(`✅ Portal encontrado en: ${portalUrl}`);
          return portalUrl;
          
        } catch (error) {
          if (error.response?.status === 200) {
            console.log(`✅ Portal encontrado en: ${portalUrl}`);
            return portalUrl;
          }
          // Continuar probando otras URLs
        }
      }
      
      console.log('⚠️ No se encontró portal FluentCommunity en ubicaciones comunes');
      return null;
      
    } catch (error) {
      console.log('❌ Error verificando portal:');
      return null;
    }
  }

  // Paso 6: Verificar webhook endpoints
  async testWebhookEndpoints() {
    console.log('\n🔗 Probando endpoints de webhook...');
    
    const webhookEndpoints = [
      '/fluent-community/v1/webhook',
      '/fluent-community/v1/incoming-webhook',
      '/fluentcommunity/webhook'
    ];

    const results = {};

    for (const endpoint of webhookEndpoints) {
      try {
        const response = await axios.get(`${FLUENTCOMMUNITY_CONFIG.baseUrl}/wp-json${endpoint}`, {
          headers: this.headers,
          timeout: 5000
        });
        
        results[endpoint] = { status: 'OK', data: response.data };
        console.log(`✅ ${endpoint}: DISPONIBLE`);
        
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

  // Paso 7: Método alternativo - Usar WordPress para crear "enlaces" a FluentCommunity
  async createFluentCommunityLink() {
    try {
      console.log('\n🔗 Creando enlace a FluentCommunity como alternativa...');
      
      const linkData = {
        title: `Foro del Curso - ${Date.now()}`,
        content: `
          <div style="background: #f0f8ff; padding: 20px; border-radius: 8px; border-left: 4px solid #0073aa;">
            <h4 style="margin-top: 0; color: #0073aa;">🗣️ Únete al Foro Exclusivo</h4>
            <p>Accede a nuestro foro de la comunidad donde podrás:</p>
            <ul>
              <li>✅ Hacer preguntas sobre el contenido del curso</li>
              <li>✅ Compartir tus experiencias y casos prácticos</li>
              <li>✅ Conectar con otros estudiantes</li>
              <li>✅ Acceder a recursos adicionales exclusivos</li>
              <li>✅ Participar en discusiones grupales</li>
            </ul>
            <p><strong>📧 El enlace de acceso al foro se enviará por email después de la compra.</strong></p>
            <p style="margin-bottom: 0;">
              <em>💡 El foro estará disponible durante todo el curso y 30 días adicionales.</em>
            </p>
          </div>
        `,
        status: 'publish',
        type: 'page'
      };

      const response = await axios.post(this.buildWpUrl('/pages'), linkData, {
        headers: this.headers
      });

      const page = response.data;
      console.log('✅ Página de enlace a FluentCommunity creada:');
      console.log(`- ID: ${page.id}`);
      console.log(`- Título: ${page.title?.rendered}`);
      console.log(`- URL: ${page.link}`);
      
      return page;
    } catch (error) {
      console.log('❌ Error creando enlace:');
      console.log(`Status: ${error.response?.status}`);
      return null;
    }
  }

  // Método para generar contenido de foro para lecciones
  generateFluentCommunityContent(courseData) {
    return `
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 25px; border-radius: 12px; margin: 20px 0;">
      <h4 style="margin-top: 0; color: white; font-size: 18px;">🌟 Foro Exclusivo de la Comunidad</h4>
      
      <div style="background: rgba(255,255,255,0.1); padding: 15px; border-radius: 8px; margin: 15px 0;">
        <p style="margin: 0; font-size: 16px;"><strong>¡Conecta con tu comunidad de aprendizaje!</strong></p>
      </div>
      
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 20px 0;">
        <div style="background: rgba(255,255,255,0.1); padding: 12px; border-radius: 6px;">
          <strong>💬 Discusiones</strong><br>
          <small>Debates y preguntas</small>
        </div>
        <div style="background: rgba(255,255,255,0.1); padding: 12px; border-radius: 6px;">
          <strong>📚 Recursos</strong><br>
          <small>Materiales exclusivos</small>
        </div>
        <div style="background: rgba(255,255,255,0.1); padding: 12px; border-radius: 6px;">
          <strong>🤝 Networking</strong><br>
          <small>Conecta con otros</small>
        </div>
        <div style="background: rgba(255,255,255,0.1); padding: 12px; border-radius: 6px;">
          <strong>🎯 Práctica</strong><br>
          <small>Casos reales</small>
        </div>
      </div>
      
      <p style="margin: 15px 0 5px 0; font-size: 14px; opacity: 0.9;">
        📧 <strong>El acceso al foro se envía automáticamente por email después de la compra</strong>
      </p>
      <p style="margin: 0; font-size: 12px; opacity: 0.8;">
        ⏰ Disponible durante todo el curso + 30 días adicionales
      </p>
    </div>
    `;
  }

  // Ejecutar todas las pruebas
  async runAllTests() {
    console.log('🚀 INICIANDO PRUEBAS FLUENTCOMMUNITY\n');
    console.log('===============================================');
    
    const results = {
      installation: false,
      plugins: false,
      endpoints: false,
      portal: false,
      webhook: false,
      alternative: false
    };

    // Paso 1: Verificar instalación
    const routes = await this.checkFluentCommunityInstallation();
    results.installation = routes.length > 0;

    // Paso 2: Verificar plugins activos
    const plugins = await this.checkActivePlugins();
    results.plugins = plugins.length > 0;

    // Paso 3: Buscar custom post types
    const postTypes = await this.checkCustomPostTypes();

    // Paso 4: Probar endpoints API
    const endpointResults = await this.testFluentCommunityEndpoints();
    results.endpoints = Object.values(endpointResults).some(r => r.status === 'OK');

    // Paso 5: Verificar portal
    const portal = await this.checkFluentCommunityPortal();
    results.portal = !!portal;

    // Paso 6: Probar webhooks
    const webhookResults = await this.testWebhookEndpoints();
    results.webhook = Object.values(webhookResults).some(r => r.status === 'OK');

    // Paso 7: Crear método alternativo
    const alternative = await this.createFluentCommunityLink();
    results.alternative = !!alternative;

    // Limpiar datos de prueba
    if (alternative?.id) {
      try {
        await axios.delete(this.buildWpUrl(`/pages/${alternative.id}`), {
          headers: this.headers,
          params: { force: true }
        });
        console.log('\n🧹 Página de prueba eliminada');
      } catch (e) {
        console.log('⚠️ No se pudo eliminar página de prueba');
      }
    }

    // Resumen final
    console.log('\n===============================================');
    console.log('🎯 RESUMEN DE PRUEBAS FLUENTCOMMUNITY:');
    console.log(`✅ Instalación: ${results.installation ? 'DETECTADA' : 'NO DETECTADA'}`);
    console.log(`✅ Plugins Activos: ${results.plugins ? 'OK' : 'NO ENCONTRADO'}`);
    console.log(`✅ Endpoints API: ${results.endpoints ? 'DISPONIBLES' : 'NO DISPONIBLES'}`);
    console.log(`✅ Portal: ${results.portal ? 'ENCONTRADO' : 'NO ENCONTRADO'}`);
    console.log(`✅ Webhooks: ${results.webhook ? 'DISPONIBLES' : 'NO DISPONIBLES'}`);
    console.log(`✅ Método Alternativo: ${results.alternative ? 'OK' : 'FALLO'}`);

    // Determinar estrategia
    if (results.plugins && results.endpoints) {
      console.log('\n🎉 FLUENTCOMMUNITY CON API DISPONIBLE');
      console.log('✅ Se puede integrar directamente en el flujo automatizado');
    } else if (results.plugins) {
      console.log('\n⚠️ FLUENTCOMMUNITY INSTALADO PERO API LIMITADA');
      console.log('✅ Usar método de contenido HTML + email manual');
      console.log('💡 Resultado: Mismo valor para usuarios, proceso semi-automático');
    } else {
      console.log('\n❌ FLUENTCOMMUNITY NO DISPONIBLE');
      console.log('💡 Recomendación: Usar contenido HTML en lecciones de LearnDash');
    }

    console.log('\n📋 ESTRATEGIA RECOMENDADA:');
    console.log('1. 📖 Crear lección "Foro de la Comunidad" en LearnDash');
    console.log('2. 🎨 Insertar HTML atractivo explicando el foro');
    console.log('3. 📧 FluentCRM envía email con enlace real después de compra');
    console.log('4. ✅ Usuario obtiene acceso completo al foro');

    return results;
  }
}

// Ejecutar las pruebas
async function main() {
  const tester = new FluentCommunityTester();
  const results = await tester.runAllTests();
  
  // Mostrar ejemplo de contenido generado
  console.log('\n🎨 EJEMPLO DE CONTENIDO GENERADO:');
  console.log(tester.generateFluentCommunityContent({ nombre: 'Test Course' }));
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = FluentCommunityTester;