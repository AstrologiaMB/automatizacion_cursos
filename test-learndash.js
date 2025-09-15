// test-learndash.js
const axios = require('axios');

// Credenciales WordPress/LearnDash
const LEARNDASH_CONFIG = {
  baseUrl: 'https://mariablaquier.com',
  username: 'cursos@mariablaquier.com',
  password: 'CiFLW3BJWkl5UePq8r3zHIZk', // Sin espacios
  wpApiEndpoint: '/wp-json/wp/v2',
  ldApiEndpoint: '/wp-json/ldlms/v2'
};

class LearnDashTester {
  constructor() {
    // Crear Basic Auth header
    const credentials = `${LEARNDASH_CONFIG.username}:${LEARNDASH_CONFIG.password}`;
    const encodedCredentials = Buffer.from(credentials).toString('base64');
    
    this.headers = {
      'Authorization': `Basic ${encodedCredentials}`,
      'Content-Type': 'application/json',
      'User-Agent': 'LearnDashAutomation/1.0'
    };
  }

  buildWpUrl(endpoint) {
    return `${LEARNDASH_CONFIG.baseUrl}${LEARNDASH_CONFIG.wpApiEndpoint}${endpoint}`;
  }

  buildLdUrl(endpoint) {
    return `${LEARNDASH_CONFIG.baseUrl}${LEARNDASH_CONFIG.ldApiEndpoint}${endpoint}`;
  }

  // Paso 1: Verificar conectividad WordPress
  async testWordPressConnection() {
    try {
      console.log('🔐 Verificando conectividad WordPress API...');
      
      const response = await axios.get(this.buildWpUrl('/'), {
        headers: this.headers,
        timeout: 10000
      });

      console.log('✅ WordPress REST API funcionando');
      console.log(`Namespace: ${response.data.name || 'WordPress'}`);
      console.log(`Rutas disponibles: ${Object.keys(response.data.routes || {}).length}`);
      
      return true;
    } catch (error) {
      console.log('❌ Error conectando a WordPress:');
      console.log(`Status: ${error.response?.status || 'No response'}`);
      console.log(`Message: ${error.response?.data?.message || error.message}`);
      return false;
    }
  }

  // Paso 2: Verificar conectividad LearnDash
  async testLearnDashConnection() {
    try {
      console.log('\n🎓 Verificando conectividad LearnDash API...');
      
      const response = await axios.get(this.buildLdUrl('/'), {
        headers: this.headers,
        timeout: 10000
      });

      console.log('✅ LearnDash REST API funcionando');
      console.log(`Rutas LearnDash: ${Object.keys(response.data.routes || {}).length}`);
      
      return true;
    } catch (error) {
      console.log('❌ Error conectando a LearnDash:');
      console.log(`Status: ${error.response?.status || 'No response'}`);
      console.log(`Message: ${error.response?.data?.message || error.message}`);
      
      if (error.response?.status === 401) {
        console.log('🔑 Problema de autenticación - verifica permisos de admin');
      } else if (error.response?.status === 404) {
        console.log('📦 LearnDash no instalado o API v2 no disponible');
      }
      
      return false;
    }
  }

  // Paso 3: Listar cursos existentes
  async listExistingCourses() {
    try {
      console.log('\n📚 Obteniendo cursos existentes...');
      
      const response = await axios.get(this.buildLdUrl('/sfwd-courses'), {
        headers: this.headers,
        params: {
          per_page: 10,
          status: 'publish'
        }
      });

      const courses = response.data || [];
      console.log(`✅ Se encontraron ${courses.length} cursos:`);
      
      courses.slice(0, 5).forEach(course => {
        console.log(`- ${course.title?.rendered || course.post_title} (ID: ${course.id})`);
      });
      
      if (courses.length > 5) {
        console.log(`... y ${courses.length - 5} cursos más`);
      }
      
      return courses;
    } catch (error) {
      console.log('❌ Error obteniendo cursos:');
      console.log(`Status: ${error.response?.status}`);
      console.log(`Data: ${JSON.stringify(error.response?.data, null, 2)}`);
      return [];
    }
  }

  // Paso 4: Obtener categorías de cursos
  async getCourseCategories() {
    try {
      console.log('\n🏷️ Obteniendo categorías de cursos...');
      
      const response = await axios.get(this.buildWpUrl('/ld_course_category'), {
        headers: this.headers
      });

      const categories = response.data || [];
      console.log(`✅ Se encontraron ${categories.length} categorías:`);
      
      categories.slice(0, 5).forEach(cat => {
        console.log(`- ${cat.name} (ID: ${cat.id}, Slug: ${cat.slug})`);
      });
      
      return categories;
    } catch (error) {
      console.log('❌ Error obteniendo categorías:');
      console.log(`Status: ${error.response?.status}`);
      console.log(`Data: ${JSON.stringify(error.response?.data, null, 2)}`);
      return [];
    }
  }

  // Paso 5: Crear curso de prueba
  async createTestCourse() {
    try {
      console.log('\n🆕 Creando curso de prueba...');
      
      const courseData = {
        title: `Test Automation Course ${Date.now()}`,
        content: 'Este es un curso de prueba creado por la automatización.',
        status: 'publish',
        meta: {
          '_ld_course_settings': {
            course_materials: 'Material de prueba',
            course_price_type: 'paynow',
            course_price: '100'
          }
        }
      };

      const response = await axios.post(this.buildLdUrl('/sfwd-courses'), courseData, {
        headers: this.headers
      });

      const course = response.data;
      console.log('✅ Curso creado correctamente:');
      console.log(`- ID: ${course.id}`);
      console.log(`- Título: ${course.title?.rendered || course.post_title}`);
      console.log(`- URL: ${course.link || 'N/A'}`);
      
      return course;
    } catch (error) {
      console.log('❌ Error creando curso:');
      console.log(`Status: ${error.response?.status}`);
      console.log(`Data: ${JSON.stringify(error.response?.data, null, 2)}`);
      return null;
    }
  }

  // Paso 6: Crear lección de prueba
  async createTestLesson(courseId) {
    if (!courseId) {
      console.log('\n⚠️ Saltando creación de lección - no hay curso válido');
      return null;
    }

    try {
      console.log('\n📖 Creando lección de prueba...');
      
      const lessonData = {
        title: 'Información del Encuentro - Prueba',
        content: `
          <h3>Detalles del Encuentro Online</h3>
          <p><strong>Fecha:</strong> Fecha de prueba</p>
          <p><strong>Plataforma:</strong> Zoom</p>
          <p><strong>Duración:</strong> 2 horas</p>
          
          <div style="background: #f8f8f8; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <h4>Datos de Conexión:</h4>
            <p><strong>URL:</strong> https://zoom.us/test</p>
            <p><strong>ID de Reunión:</strong> 123456789</p>
            <p><strong>Contraseña:</strong> test123</p>
          </div>
        `,
        status: 'publish',
        meta: {
          course_id: courseId,
          _ld_lesson_settings: {
            associated_course: courseId
          }
        }
      };

      const response = await axios.post(this.buildLdUrl('/sfwd-lessons'), lessonData, {
        headers: this.headers
      });

      const lesson = response.data;
      console.log('✅ Lección creada correctamente:');
      console.log(`- ID: ${lesson.id}`);
      console.log(`- Título: ${lesson.title?.rendered || lesson.post_title}`);
      
      return lesson;
    } catch (error) {
      console.log('❌ Error creando lección:');
      console.log(`Status: ${error.response?.status}`);
      console.log(`Data: ${JSON.stringify(error.response?.data, null, 2)}`);
      return null;
    }
  }

  // Paso 7: Probar endpoints alternativos
  async testAlternativeEndpoints() {
    console.log('\n🔍 Probando endpoints alternativos...');
    
    const endpoints = [
      { name: 'Lessons', url: '/sfwd-lessons' },
      { name: 'Topics', url: '/sfwd-topic' },
      { name: 'Quizzes', url: '/sfwd-quiz' },
      { name: 'Course Steps', url: '/course-steps' },
      { name: 'User Courses', url: '/user-courses' }
    ];

    const results = {};

    for (const endpoint of endpoints) {
      try {
        const response = await axios.get(this.buildLdUrl(endpoint.url), {
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

  // Paso 8: Verificar usuario actual
  async getCurrentUser() {
    try {
      console.log('\n👤 Verificando usuario actual...');
      
      const response = await axios.get(this.buildWpUrl('/users/me'), {
        headers: this.headers
      });

      const user = response.data;
      console.log('✅ Usuario autenticado:');
      console.log(`- ID: ${user.id}`);
      console.log(`- Email: ${user.email}`);
      console.log(`- Roles: ${user.roles?.join(', ') || 'N/A'}`);
      console.log(`- Capabilities: Admin = ${user.capabilities?.administrator || false}`);
      
      return user;
    } catch (error) {
      console.log('❌ Error obteniendo usuario:');
      console.log(`Status: ${error.response?.status}`);
      return null;
    }
  }

  // Limpiar datos de prueba
  async cleanupTestData(testCourse, testLesson) {
    console.log('\n🧹 Limpiando datos de prueba...');
    
    try {
      if (testLesson?.id) {
        await axios.delete(this.buildLdUrl(`/sfwd-lessons/${testLesson.id}`), {
          headers: this.headers
        });
        console.log('✅ Lección de prueba eliminada');
      }
    } catch (e) {
      console.log('⚠️ No se pudo eliminar lección de prueba');
    }

    try {
      if (testCourse?.id) {
        await axios.delete(this.buildLdUrl(`/sfwd-courses/${testCourse.id}`), {
          headers: this.headers
        });
        console.log('✅ Curso de prueba eliminado');
      }
    } catch (e) {
      console.log('⚠️ No se pudo eliminar curso de prueba');
    }
  }

  // Ejecutar todas las pruebas
  async runAllTests() {
    console.log('🚀 INICIANDO PRUEBAS LEARNDASH API\n');
    console.log('=================================================');
    
    const results = {
      wordpress: false,
      learndash: false,
      courses: false,
      lessons: false,
      user: false
    };

    // Paso 1: Verificar WordPress
    results.wordpress = await this.testWordPressConnection();
    if (!results.wordpress) {
      console.log('\n💥 FALLO CRÍTICO: WordPress API no funciona');
      return false;
    }

    // Paso 2: Verificar LearnDash
    results.learndash = await this.testLearnDashConnection();
    if (!results.learndash) {
      console.log('\n💥 FALLO CRÍTICO: LearnDash API no funciona');
      return false;
    }

    // Paso 3: Verificar usuario y permisos
    const user = await this.getCurrentUser();
    results.user = !!user;

    // Paso 4: Probar funcionalidades
    const existingCourses = await this.listExistingCourses();
    const categories = await this.getCourseCategories();
    
    const testCourse = await this.createTestCourse();
    results.courses = !!testCourse;

    const testLesson = await this.createTestLesson(testCourse?.id);
    results.lessons = !!testLesson;

    // Paso 5: Probar endpoints adicionales
    await this.testAlternativeEndpoints();

    // Paso 6: Limpiar datos de prueba
    await this.cleanupTestData(testCourse, testLesson);

    // Resumen final
    console.log('\n=================================================');
    console.log('🎯 RESUMEN DE PRUEBAS LEARNDASH:');
    console.log(`✅ WordPress API: ${results.wordpress ? 'OK' : 'FALLO'}`);
    console.log(`✅ LearnDash API: ${results.learndash ? 'OK' : 'FALLO'}`);
    console.log(`✅ Usuario/Permisos: ${results.user ? 'OK' : 'FALLO'}`);
    console.log(`✅ Crear Cursos: ${results.courses ? 'OK' : 'FALLO'}`);
    console.log(`✅ Crear Lecciones: ${results.lessons ? 'OK' : 'FALLO'}`);

    const allPassed = Object.values(results).every(r => r === true);
    
    if (allPassed) {
      console.log('\n🎉 LEARNDASH API FUNCIONANDO PERFECTAMENTE');
      console.log('✅ Todas las funcionalidades necesarias están disponibles');
    } else {
      console.log('\n⚠️ ALGUNOS COMPONENTES NO FUNCIONAN CORRECTAMENTE');
      console.log('❌ Revisa los errores antes de continuar con el desarrollo');
    }

    return allPassed;
  }
}

// Ejecutar las pruebas
async function main() {
  const tester = new LearnDashTester();
  await tester.runAllTests();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = LearnDashTester;