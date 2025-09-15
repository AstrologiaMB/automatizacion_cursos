// timezone-generator.js
const axios = require('axios');

class TimezoneGenerator {
  constructor() {
    // Mapeo de ciudades a IDs de TimeAndDate.com
    this.timeAndDateCities = {
      'buenosAires': 136,
      'madrid': 141,
      'london': 51,
      'newYork': 232,
      'mexicoCity': 163,
      'santiago': 156,
      'lima': 155,
      'miami': 41,
      'barcelona': 131
    };

    // Mapeo a timezones para APIs gratuitas
    this.timezones = {
      'buenosAires': 'America/Argentina/Buenos_Aires',
      'madrid': 'Europe/Madrid',
      'london': 'Europe/London',
      'newYork': 'America/New_York',
      'mexicoCity': 'America/Mexico_City',
      'santiago': 'America/Santiago',
      'lima': 'America/Lima',
      'miami': 'America/New_York',
      'barcelona': 'Europe/Barcelona'
    };
  }

  // Método 1: Generar URL de TimeAndDate.com (tu método actual mejorado)
  generateTimeAndDateUrl(courseDate, courseTime, cities = ['madrid', 'london', 'newYork', 'mexicoCity']) {
    // Convertir fecha y hora a formato ISO
    const [day, month] = courseDate.split('/');
    const year = new Date().getFullYear();
    const [hour, minute] = courseTime.split(':');
    
    const isoDateTime = `${year}${month.padStart(2, '0')}${day.padStart(2, '0')}T${hour.padStart(2, '0')}${minute.padStart(2, '0')}00`;
    
    // Construir parámetros de ciudades
    const cityParams = cities.map((city, index) => {
      const cityId = this.timeAndDateCities[city];
      return `p${index + 1}=${cityId}`;
    }).join('&');
    
    // Buenos Aires siempre es p1=136
    const buenosAiresParam = `p1=${this.timeAndDateCities.buenosAires}`;
    
    return `https://www.timeanddate.com/worldclock/converter.html?iso=${isoDateTime}&${buenosAiresParam}&${cityParams}`;
  }

  // Método 2: Usar WorldTimeAPI.org (GRATIS) para generar tabla con horarios reales
  async generateTimezoneTable(courseDate, courseTime, cities = ['madrid', 'london', 'newYork', 'mexicoCity']) {
    try {
      console.log('🌍 Generando tabla de horarios con API gratuita...');
      
      // Crear fecha completa
      const [day, month] = courseDate.split('/');
      const year = new Date().getFullYear();
      const courseDateTime = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${courseTime}:00`);
      
      const timezoneData = [];
      
      // Obtener horario para Buenos Aires (base)
      const buenosAiresTime = await this.getTimeForTimezone('America/Argentina/Buenos_Aires', courseDateTime);
      timezoneData.push({
        city: 'Buenos Aires',
        time: this.formatTime(buenosAiresTime),
        timezone: 'ART'
      });
      
      // Obtener horarios para otras ciudades
      for (const city of cities) {
        const timezone = this.timezones[city];
        if (timezone) {
          const cityTime = await this.getTimeForTimezone(timezone, courseDateTime);
          timezoneData.push({
            city: this.formatCityName(city),
            time: this.formatTime(cityTime),
            timezone: cityTime.timezone_abbreviation || 'N/A'
          });
        }
      }
      
      return this.createTimezoneTableHTML(timezoneData, courseDate, courseTime);
      
    } catch (error) {
      console.log('❌ Error generando tabla con API:', error.message);
      // Fallback a método manual
      return this.generateSimpleTable(courseDate, courseTime, cities);
    }
  }

  // Obtener tiempo para timezone específico usando WorldTimeAPI
  async getTimeForTimezone(timezone, baseDateTime) {
    try {
      const response = await axios.get(`http://worldtimeapi.org/api/timezone/${timezone}`, {
        timeout: 5000
      });
      
      const timezoneInfo = response.data;
      
      // Calcular la hora en esa timezone para la fecha del curso
      const utcOffset = timezoneInfo.utc_offset;
      const offsetHours = parseInt(utcOffset.split(':')[0]);
      const offsetMinutes = parseInt(utcOffset.split(':')[1]);
      
      // Ajustar hora base a UTC y luego a timezone objetivo
      const utcTime = new Date(baseDateTime.getTime() + (3 * 60 * 60 * 1000)); // Buenos Aires es UTC-3
      const targetTime = new Date(utcTime.getTime() + (offsetHours * 60 * 60 * 1000) + (offsetMinutes * 60 * 1000));
      
      return {
        datetime: targetTime,
        timezone_abbreviation: timezoneInfo.abbreviation,
        utc_offset: timezoneInfo.utc_offset
      };
      
    } catch (error) {
      console.log(`⚠️ Error obteniendo timezone para ${timezone}`);
      return null;
    }
  }

  // Crear tabla HTML con horarios
  createTimezoneTableHTML(timezoneData, courseDate, courseTime) {
    const timeAndDateUrl = this.generateTimeAndDateUrl(courseDate, courseTime);
    
    let tableHTML = `
    <div style="background: #f8f8f8; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <h4 style="margin-top: 0;">🌍 Horarios del Encuentro por Ciudad</h4>
      <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
        <thead>
          <tr style="background: #e0e0e0;">
            <th style="padding: 10px; text-align: left; border: 1px solid #ccc;">Ciudad</th>
            <th style="padding: 10px; text-align: left; border: 1px solid #ccc;">Hora Local</th>
            <th style="padding: 10px; text-align: left; border: 1px solid #ccc;">Zona</th>
          </tr>
        </thead>
        <tbody>
    `;
    
    timezoneData.forEach((data, index) => {
      const rowStyle = index % 2 === 0 ? 'background: #f9f9f9;' : 'background: white;';
      tableHTML += `
        <tr style="${rowStyle}">
          <td style="padding: 10px; border: 1px solid #ccc;"><strong>${data.city}</strong></td>
          <td style="padding: 10px; border: 1px solid #ccc;">${data.time}</td>
          <td style="padding: 10px; border: 1px solid #ccc;">${data.timezone}</td>
        </tr>
      `;
    });
    
    tableHTML += `
        </tbody>
      </table>
      <p style="margin-bottom: 0;">
        <a href="${timeAndDateUrl}" target="_blank" style="color: #0073aa; text-decoration: none;">
          🔗 Ver horario en tu ciudad específica →
        </a>
      </p>
    </div>
    `;
    
    return tableHTML;
  }

  // Generar tabla simple (fallback)
  generateSimpleTable(courseDate, courseTime, cities) {
    const timeAndDateUrl = this.generateTimeAndDateUrl(courseDate, courseTime, cities);
    
    return `
    <div style="background: #f8f8f8; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <h4 style="margin-top: 0;">🌍 Horario del Encuentro</h4>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 10px; border: 1px solid #ccc; background: #e0e0e0;"><strong>Cuando</strong></td>
          <td style="padding: 10px; border: 1px solid #ccc;">${this.formatCourseDate(courseDate)} ${courseTime} (Argentina)</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #ccc; background: #e0e0e0;"><strong>Horario en tu ciudad</strong></td>
          <td style="padding: 10px; border: 1px solid #ccc;">
            <a href="${timeAndDateUrl}" target="_blank" style="color: #0073aa; text-decoration: none;">
              🔗 Ver equivalencia en tu zona horaria →
            </a>
          </td>
        </tr>
      </table>
    </div>
    `;
  }

  // Utilidades de formato
  formatTime(timeData) {
    if (!timeData || !timeData.datetime) return 'N/A';
    
    const date = new Date(timeData.datetime);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    
    return `${hours}:${minutes}`;
  }

  formatCityName(cityKey) {
    const cityNames = {
      'buenosAires': 'Buenos Aires',
      'madrid': 'Madrid',
      'london': 'Londres',
      'newYork': 'Nueva York',
      'mexicoCity': 'Ciudad de México',
      'santiago': 'Santiago',
      'lima': 'Lima',
      'miami': 'Miami',
      'barcelona': 'Barcelona'
    };
    
    return cityNames[cityKey] || cityKey;
  }

  formatCourseDate(courseDate) {
    const [day, month] = courseDate.split('/');
    const months = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    
    return `${parseInt(day)} de ${months[parseInt(month) - 1]}`;
  }

  // Método principal para usar en tu automatización
  async generateTimezoneContent(courseDate, courseTime, method = 'api') {
    if (method === 'api') {
      // Intentar con API gratuita primero
      const apiTable = await this.generateTimezoneTable(courseDate, courseTime);
      if (apiTable) return apiTable;
    }
    
    // Fallback a método manual (siempre funciona)
    return this.generateSimpleTable(courseDate, courseTime);
  }
}

// Ejemplo de uso
async function testTimezoneGenerator() {
  const generator = new TimezoneGenerator();
  
  console.log('🧪 Probando generador de timezone...\n');
  
  // Test 1: URL de TimeAndDate.com
  const url = generator.generateTimeAndDateUrl('11/12', '17:30');
  console.log('✅ URL generada:', url);
  
  // Test 2: Tabla con API gratuita
  const table = await generator.generateTimezoneContent('11/12', '17:30', 'api');
  console.log('\n✅ Tabla HTML generada:');
  console.log(table);
}

// Ejecutar test si se llama directamente
if (require.main === module) {
  testTimezoneGenerator().catch(console.error);
}

module.exports = TimezoneGenerator;