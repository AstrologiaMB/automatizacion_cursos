# CREDENCIALES Y CONFIGURACIONES - PROYECTO AUTOMATIZACIÓN

## 🔐 ZOOM API - Server-to-Server OAuth

### Credenciales Principales
```
Account ID: 7afxAw6VQ72uo9P1QCT9NQ
Client ID: nkyBp9yiTwigyadMyvuaCg
Client Secret: 4EtnPd9pXC3blAs4Zj1e79ENoW9Q2bHZ
Secret Token: CW9KoLmnRXSEd4HuE34b6Q
Verification Token: 1E0CVRJ5TO-eZO4YdH6Eew
```

### Endpoints
- **Base URL**: `https://api.zoom.us/v2`
- **Auth URL**: `https://zoom.us/oauth/token`
- **Meetings**: `/users/me/meetings`

### Configuración Estándar Reuniones
```json
{
  "type": 2,
  "timezone": "America/Argentina/Buenos_Aires",
  "duration": 120,
  "settings": {
    "host_video": true,
    "participant_video": true,
    "cn_meeting": false,
    "in_meeting": false,
    "join_before_host": false,
    "mute_upon_entry": true,
    "watermark": false,
    "use_pmi": false,
    "approval_type": 0,
    "audio": "both",
    "auto_recording": "none",
    "waiting_room": true,
    "registrants_confirmation_email": false
  }
}
```

---

## 🏷️ FLUENTCRM API - Basic Auth

### Credenciales
```
Base URL: https://mariablaquier.com
API Username: lsmnvll
API Password: MceL FSnI zRNp ZmhG Nbga DWFG
```

### Endpoints Principales
- **Base**: `/wp-json/fluent-crm/v2`
- **Tags**: `/tags`
- **Lists**: `/lists`
- **Contacts**: `/contacts`
- **Campaigns**: `/campaigns`

### Headers Requeridos
```json
{
  "Authorization": "Basic bHNtbnZsbDpNY2VMIEZTbkkgelJOcCBabWhHIE5iZ2EgRFdGRw==",
  "Content-Type": "application/json"
}
```

---

## 📚 WORDPRESS/LEARNDASH API

### Credenciales
```
URL: https://mariablaquier.com
Username: cursos@mariablaquier.com
Application Password: CiFL W3BJ Wkl5 UePq 8r3z HIZk
```

### Endpoints LearnDash
- **Base**: `/wp-json/ldlms/v2`
- **Courses**: `/sfwd-courses`
- **Lessons**: `/sfwd-lessons`
- **Topics**: `/sfwd-topic`

### Endpoints WordPress
- **Posts**: `/wp-json/wp/v2/posts`
- **Media**: `/wp-json/wp/v2/media`
- **Categories**: `/wp-json/wp/v2/categories`

### Headers de Autenticación
```json
{
  "Authorization": "Basic Y3Vyc29zQG1hcmlhYmxhcXVpZXIuY29tOkNpRkwgVzNCSiBXa2w1IFVlUHEgOHIzeiBISVpr",
  "Content-Type": "application/json"
}
```

---

## 🛒 WOOCOMMERCE API

### Credenciales
```
Consumer Key: ck_12f4c8e1172ec805101181a4059f0387c9840f62
Consumer Secret: cs_81b8eac3f7c3d9c42d52163f42c1e94c899b3510
```

### Endpoints
- **Base**: `/wp-json/wc/v3`
- **Products**: `/products`
- **Categories**: `/products/categories`
- **Orders**: `/orders`
- **Customers**: `/customers`

### Autenticación
```javascript
// En la URL como query params
consumer_key=ck_12f4c8e1172ec805101181a4059f0387c9840f62&consumer_secret=cs_81b8eac3f7c3d9c42d52163f42c1e94c899b3510
```

---

## 🌍 TIMEZONE/HORARIOS

### WorldTimeAPI
- **URL**: `http://worldtimeapi.org/api/timezone/America/Argentina/Buenos_Aires`
- **Fallback**: `https://timeapi.io/api/Time/current/zone?timeZone=America/Argentina/Buenos_Aires`

### TimeAndDate.com URLs
- **Base**: `https://www.timeanddate.com/worldclock/converter.html`
- **Formato**: `?iso=20241211T173000&p1=136&p2=141&p3=51&p4=232&p5=163&p6=156&p7=155&p8=41&p9=131`

### Ciudades Fijas (IDs)
```
Buenos Aires: 136
Mexico City: 141  
New York: 179
Madrid: 141
London: 136
Paris: 195
```

---

## 📋 TABLEPRESS

### Configuración
- **Plugin**: TablePress via WordPress API
- **Endpoint**: `/wp-json/wp/v2/tablepress_table`
- **Shortcode**: `[table id=X /]`

### Template Base Tabla
```
| Cuando | [FECHA_FORMATEADA] [HORA] Argentina |
| Horario de tu ciudad | [LINK_TIMEANDDATE] |
```

---

## 🗣️ FLUENTCOMMUNITY

### Configuración
- **Integración**: Via FluentCRM hooks PHP
- **Activación**: Automática al asignar tag
- **Espacios**: Creación automática por curso

---

## 🔧 CONFIGURACIONES ADICIONALES

### Categorías WooCommerce Fijas
```
- Cursos Online
- Astrología
- Talleres
```

### Configuración LearnDash Estándar
```json
{
  "course_price_type": "paynow",
  "course_price": "[PRECIO_VARIABLE]",
  "course_access_list": [],
  "course_lesson_orderby": "menu_order",
  "course_lesson_order": "ASC"
}
```

### Variables de Entorno (.env)
```bash
# Zoom
ZOOM_ACCOUNT_ID=7afxAw6VQ72uo9P1QCT9NQ
ZOOM_CLIENT_ID=nkyBp9yiTwigyadMyvuaCg
ZOOM_CLIENT_SECRET=4EtnPd9pXC3blAs4Zj1e79ENoW9Q2bHZ

# WordPress
WP_URL=https://mariablaquier.com
WP_USERNAME=cursos@mariablaquier.com
WP_APP_PASSWORD=CiFL W3BJ Wkl5 UePq 8r3z HIZk

# FluentCRM
FLUENTCRM_API_USERNAME=lsmnvll
FLUENTCRM_API_PASSWORD=MceL FSnI zRNp ZmhG Nbga DWFG



# WooCommerce
WC_CONSUMER_KEY=ck_12f4c8e1172ec805101181a4059f0387c9840f62
WC_CONSUMER_SECRET=cs_81b8eac3f7c3d9c42d52163f42c1e94c899b3510
```

---

## ✅ ESTADO DE VALIDACIÓN

- [x] **Zoom**: API validada ✅
- [x] **FluentCRM**: Conexión confirmada ✅  
- [x] **LearnDash**: Endpoints operativos ✅
- [x] **WooCommerce**: Productos creables ✅
- [x] **TablePress**: Plugin funcional ✅
- [x] **TimeZone**: APIs respondiendo ✅
- [x] **FluentCommunity**: Integración confirmada ✅

**TODAS LAS CREDENCIALES ESTÁN VALIDADAS Y FUNCIONANDO** 🚀