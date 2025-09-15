// test-zoom.js
const axios = require('axios');

// Tus credenciales Zoom
const ZOOM_CONFIG = {
  accountId: '7afxAw6VQ72uo9P1QCT9NQ',
  clientId: 'nkyBp9yiTwigyadMyvuaCg',
  clientSecret: '4EtnPd9pXC3blAs4Zj1e79ENoW9Q2bHZ',
  baseUrl: 'https://api.zoom.us/v2'
};

class ZoomTester {
  constructor() {
    this.accessToken = null;
  }

  // Paso 1: Obtener Access Token
  async getAccessToken() {
    try {
      console.log('🔐 Obteniendo access token...');
      
      const auth = Buffer.from(`${ZOOM_CONFIG.clientId}:${ZOOM_CONFIG.clientSecret}`).toString('base64');
      
      const response = await axios.post('https://zoom.us/oauth/token', 
        `grant_type=account_credentials&account_id=${ZOOM_CONFIG.accountId}`,
        {
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      this.accessToken = response.data.access_token;
      console.log('✅ Access token obtenido correctamente');
      console.log(`Token type: ${response.data.token_type}`);
      console.log(`Expires in: ${response.data.expires_in} seconds`);
      
      return true;
    } catch (error) {
      console.log('❌ Error obteniendo access token:');
      console.log('Status:', error.response?.status);
      console.log('Data:', error.response?.data);
      return false;
    }
  }

  // Paso 2: Obtener información del usuario actual
  async getUserInfo() {
    try {
      console.log('\n👤 Obteniendo información del usuario...');
      
      const response = await axios.get(`${ZOOM_CONFIG.baseUrl}/users/me`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      const user = response.data;
      console.log('✅ Usuario obtenido correctamente:');
      console.log(`- Nombre: ${user.first_name} ${user.last_name}`);
      console.log(`- Email: ${user.email}`);
      console.log(`- Account ID: ${user.account_id}`);
      console.log(`- Type: ${user.type} (${this.getUserType(user.type)})`);
      
      return user;
    } catch (error) {
      console.log('❌ Error obteniendo usuario:');
      console.log('Status:', error.response?.status);
      console.log('Data:', error.response?.data);
      return null;
    }
  }

  // Paso 3: Crear reunión individual de prueba
  async createTestMeeting() {
    try {
      console.log('\n📅 Creando reunión individual de prueba...');
      
      const meetingData = {
        topic: 'Prueba API - Reunión Individual',
        type: 1, // Reunión instantánea
        duration: 60,
        timezone: 'America/Argentina/Buenos_Aires',
        password: '123456',
        settings: {
          host_video: true,
          participant_video: true,
          join_before_host: false,
          mute_upon_entry: true,
          waiting_room: true,
          audio: 'both'
        }
      };

      const response = await axios.post(`${ZOOM_CONFIG.baseUrl}/users/me/meetings`, meetingData, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      const meeting = response.data;
      console.log('✅ Reunión individual creada correctamente:');
      console.log(`- ID: ${meeting.id}`);
      console.log(`- Tema: ${meeting.topic}`);
      console.log(`- URL de unión: ${meeting.join_url}`);
      console.log(`- URL de inicio: ${meeting.start_url}`);
      console.log(`- Password: ${meeting.password}`);
      
      return meeting;
    } catch (error) {
      console.log('❌ Error creando reunión individual:');
      console.log('Status:', error.response?.status);
      console.log('Data:', error.response?.data);
      return null;
    }
  }

  // Paso 4: Crear reunión recurrente de prueba
  async createRecurringMeeting() {
    try {
      console.log('\n🔄 Creando reunión recurrente de prueba...');
      
      const recurringData = {
        topic: 'Prueba API - Reunión Recurrente Semanal',
        type: 8, // Reunión recurrente con fecha fija
        start_time: '2024-12-15T17:30:00Z', // Ejemplo: 15 de diciembre a las 14:30 ARG
        duration: 120,
        timezone: 'America/Argentina/Buenos_Aires',
        password: 'curso123',
        recurrence: {
          type: 2, // Semanal
          repeat_interval: 1, // Cada semana
          weekly_days: '3', // Martes (1=Domingo, 2=Lunes, 3=Martes...)
          end_times: 4 // 4 encuentros
        },
        settings: {
          host_video: true,
          participant_video: true,
          join_before_host: false,
          mute_upon_entry: true,
          waiting_room: true,
          audio: 'both',
          auto_recording: 'cloud' // Grabación automática en la nube
        }
      };

      const response = await axios.post(`${ZOOM_CONFIG.baseUrl}/users/me/meetings`, recurringData, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      const meeting = response.data;
      console.log('✅ Reunión recurrente creada correctamente:');
      console.log(`- ID: ${meeting.id}`);
      console.log(`- Tema: ${meeting.topic}`);
      console.log(`- URL de unión: ${meeting.join_url}`);
      console.log(`- Password: ${meeting.password}`);
      console.log(`- Tipo recurrencia: ${meeting.recurrence?.type}`);
      console.log(`- Días semanales: ${meeting.recurrence?.weekly_days}`);
      
      return meeting;
    } catch (error) {
      console.log('❌ Error creando reunión recurrente:');
      console.log('Status:', error.response?.status);
      console.log('Data:', error.response?.data);
      return null;
    }
  }

  // Paso 5: Listar reuniones del usuario
  async listMeetings() {
    try {
      console.log('\n📋 Listando reuniones existentes...');
      
      const response = await axios.get(`${ZOOM_CONFIG.baseUrl}/users/me/meetings`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        params: {
          type: 'scheduled',
          page_size: 10
        }
      });

      const meetings = response.data.meetings || [];
      console.log(`✅ Se encontraron ${meetings.length} reuniones:`);
      
      meetings.forEach((meeting, index) => {
        console.log(`${index + 1}. ${meeting.topic} (ID: ${meeting.id})`);
        console.log(`   Tipo: ${this.getMeetingType(meeting.type)} | Creada: ${meeting.created_at}`);
      });
      
      return meetings;
    } catch (error) {
      console.log('❌ Error listando reuniones:');
      console.log('Status:', error.response?.status);
      console.log('Data:', error.response?.data);
      return [];
    }
  }

  // Utilidades
  getUserType(type) {
    const types = {
      1: 'Básico',
      2: 'Licenciado',
      3: 'On-prem'
    };
    return types[type] || 'Desconocido';
  }

  getMeetingType(type) {
    const types = {
      1: 'Instantánea',
      2: 'Programada',
      3: 'Recurrente sin fecha fija',
      8: 'Recurrente con fecha fija'
    };
    return types[type] || 'Desconocido';
  }

  // Ejecutar todas las pruebas
  async runAllTests() {
    console.log('🚀 INICIANDO PRUEBAS DE ZOOM API\n');
    console.log('=======================================');
    
    // Paso 1: Autenticación
    const tokenSuccess = await this.getAccessToken();
    if (!tokenSuccess) {
      console.log('\n💥 FALLO CRÍTICO: No se pudo obtener el access token');
      return false;
    }

    // Paso 2: Info del usuario
    const user = await this.getUserInfo();
    if (!user) {
      console.log('\n⚠️ ADVERTENCIA: No se pudo obtener info del usuario');
    }

    // Paso 3: Crear reunión individual
    const individualMeeting = await this.createTestMeeting();
    
    // Paso 4: Crear reunión recurrente  
    const recurringMeeting = await this.createRecurringMeeting();
    
    // Paso 5: Listar reuniones
    await this.listMeetings();
    
    console.log('\n=======================================');
    console.log('🎯 RESUMEN DE PRUEBAS:');
    console.log(`✅ Autenticación: ${tokenSuccess ? 'OK' : 'FALLO'}`);
    console.log(`✅ Info usuario: ${user ? 'OK' : 'FALLO'}`);
    console.log(`✅ Reunión individual: ${individualMeeting ? 'OK' : 'FALLO'}`);
    console.log(`✅ Reunión recurrente: ${recurringMeeting ? 'OK' : 'FALLO'}`);
    
    if (tokenSuccess && individualMeeting) {
      console.log('\n🎉 ZOOM API FUNCIONANDO CORRECTAMENTE');
      console.log('✅ Puedes proceder con el desarrollo del proyecto');
      return true;
    } else {
      console.log('\n🚨 HAY PROBLEMAS CON LA API');
      console.log('❌ Revisa los errores antes de continuar');
      return false;
    }
  }
}

// Ejecutar las pruebas
async function main() {
  const tester = new ZoomTester();
  await tester.runAllTests();
}

// Solo ejecutar si se llama directamente
if (require.main === module) {
  main().catch(console.error);
}

module.exports = ZoomTester;