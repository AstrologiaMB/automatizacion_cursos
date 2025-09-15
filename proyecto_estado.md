# PROYECTO AUTOMATIZACIÓN CURSOS - ESTADO ACTUAL

## 🎯 OBJETIVO
Sistema automatizado que reduce creación de cursos de **45-60min → 2-5min**

## 📊 ESTADO GENERAL: 70% COMPLETADO

### ✅ COMPLETADO
- [x] **APIs Validadas**: Todas funcionando perfectamente
- [x] **Credenciales**: Confirmadas y documentadas
- [x] **Endpoints**: Probados y operativos
- [x] **Flujo**: Definido y validado
- [x] **Plan**: Documentado completamente
- [x] **Módulo INPUT**: CLI interactivo con validaciones y selección numérica
- [x] **Módulo Zoom**: Creación de reuniones individual y recurrente (diaria/semanal/mensual)
- [x] **Módulo TimeAndDate**: Generación de URLs por encuentro y tabla HTML de horarios (DST automático por ciudad)
- [x] **Infra base**: `.env.example`, `.gitignore`, `services/` (config, http, zoom), dependencias (dotenv, luxon)

### 🔄 EN DESARROLLO
- [ ] **Módulo FluentCRM**: ⏳ PENDIENTE (reutiliza automatizaciones existentes)
- [x] **Módulo LearnDash**: ✅ COMPLETADO
- [ ] **Módulo TablePress / HTML**: ⏳ PENDIENTE (por ahora manual con shortcode)
- [ ] **Módulo WooCommerce**: ⏳ PENDIENTE (producto existente, no crear)
- [ ] **Script Principal**: ⏳ En progreso (ya integra INPUT → Zoom; falta encadenar el resto)

---

## 🔐 CREDENCIALES VALIDADAS

### Zoom Server-to-Server OAuth ✅
```
Account ID: 7afxAw6VQ72uo9P1QCT9NQ
Client ID: nkyBp9yiTwigyadMyvuaCg
Client Secret: 4EtnPd9pXC3blAs4Zj1e79ENoW9Q2bHZ
Secret Token: CW9KoLmnRXSEd4HuE34b6Q
Verification Token: 1E0CVRJ5TO-eZO4YdH6Eew
```

### FluentCRM Basic Auth ✅
```
URL: mariablaquier.com
API Username: lsmnvll
API Password: MceL FSnI zRNp ZmhG Nbga DWFG
```

### WordPress/LearnDash ✅
```
Admin User: cursos@mariablaquier.com
Application Password: CiFL W3BJ Wkl5 UePq 8r3z HIZk
```

### WooCommerce ✅
```
Consumer Key: ck_12f4c8e1172ec805101181a4059f0387c9840f62
Consumer Secret: cs_81b8eac3f7c3d9c42d52163f42c1e94c899b3510
```

---

## 🛠️ APIS VALIDADAS Y FUNCIONALES

| Sistema | Estado | Método | Funcionalidad | Endpoint |
|---------|--------|--------|---------------|----------|
| ✅ Zoom | FUNCIONANDO | Server-to-Server OAuth | Reuniones individuales/recurrentes (diaria/semanal/mensual) | `/meetings` |
| ✅ FluentCRM | FUNCIONANDO | Basic Auth | Tags, listas, automatizaciones | `/wp-json/fluent-crm/v2/` |
| ✅ LearnDash | FUNCIONANDO | WordPress REST | Cursos y lecciones completos | `/wp-json/ldlms/v2/` |
| ✅ WooCommerce | FUNCIONANDO | Consumer Key/Secret | Productos y metadatos | `/wp-json/wc/v3/` |
| ✅ TablePress | FUNCIONANDO | WordPress Posts | Tablas de horarios | `/wp-json/wp/v2/` |
| ✅ TimeZone | FUNCIONANDO | WorldTimeAPI + fallback | Conversión horaria automática | `worldtimeapi.org` |
| ✅ FluentCommunity | FUNCIONANDO | PHP Hooks + integración | Espacios automáticos vía FluentCRM | Integración directa |

---

## 📋 FLUJO DE AUTOMATIZACIÓN CONFIRMADO

### Input Ejemplo (actualizado):
```json
{
  "nombreBase": "Taller Práctica Astrología Horaria",
  "nombreProducto": "Taller Práctica Astrología Horaria 11/12",
  "fechaInicio": "11/12/2026",
  "horaInicio": "19:30",
  "duracionMinutos": 90,
  "tagCurso": "AH1224",
  "tipoReunion": "recurrente",
  "tipoRecurrencia": "semanal",
  "cantidadEncuentros": 4,
  "precio": 47.50,
  "cursoExistente": true,
  "incluirForo": false,
  "incluirFormulario": false,
  "rutaImagen": "/path/to/image.jpg"
}
```

### Flujo Automático:
```
⚡ Input: Recopilar datos del curso (INPUT MODULE)
    ↓
🎥 Crear reunión Zoom (individual o recurrencia diaria/semanal/mensual)
    ↓
🏷️ Reusar tag/lista/automatización FluentCRM (existentes)
    ↓
📚 Crear/actualizar curso LearnDash (estructura base)
    ↓
🌍 Generar URL de TimeAndDate y tabla de horarios
    ↓
🛒 Actualizar producto WooCommerce (producto EXISTENTE)
    ↓
🗣️ Setup espacio FluentCommunity automático
    ↓
✅ Output: Curso 100% listo para vender
```

---

## 📁 ESTRUCTURA DE ARCHIVOS

```
proyecto-automatizacion/
├── PROYECTO_ESTADO.md         # ← ESTE ARCHIVO
├── CREDENCIALES.md            # Credenciales detalladas
├── .env.example               # Plantilla de variables de entorno
├── .env                       # Variables reales (ignorado por git)
├── .gitignore
├── package.json               # Dependencias Node.js
├── main.js                    # Orquestador (INPUT → Zoom listo)
├── modulos/
│   └── input.js               # CLI interactivo (selección numérica y recurrencias)
├── services/
│   ├── config.js              # Lee .env y defaults
│   ├── http.js                # Zoom token S2S + axios autenticado
│   └── zoom.js                # Creación de reuniones (type=2, type=8 diaria/semanal/mensual)
├── utils/
│   ├── logger.js              # Sistema de logs
│   └── validator.js           # Validación de inputs (incluye parseChoice12/parseRecurrenceChoice)
└── templates/
    └── course-template.js     # Template base (con schedule: time/duration/recurrence)
```

---

## 🎯 PRÓXIMO PASO INMEDIATO

### MÓDULO FLUENTCRM - ETIQUETA Y LISTA (tagCurso)
**Objetivo**: Crear etiqueta y lista en FluentCRM a partir de tagCurso (mismo código para ambas, ej. "AD0825")

**Funcionalidades a implementar**:
- ✅ ensureTag(code): crea/asegura tag con title = code y slug normalizado
- ✅ ensureList(code): crea/asegura lista con title = code y slug normalizado
- ✅ Integrar en main.js y registrar en courseConfig.integrations.fluentcrm = { code, tagId, listId }
- 🔁 Idempotencia: no duplicar si ya existen (búsqueda por slug/title)
- ⚠️ Manejo de errores: no interrumpir flujo si faltan credenciales

**Datos necesarios**:
- tagCurso del INPUT (ej. "AD0825")
- Credenciales: FLUENTCRM_USER / FLUENTCRM_PASS y WP_BASE_URL

**Output esperado**:
```
"fluentcrm": { "code": "AD0825", "tagId": 123, "listId": 456 }
```

---

## 📝 LOG DE DESARROLLO

### 2025-08-08
- ✅ Módulo INPUT extendido (nombreProducto, horaInicio, duracionMinutos)
- ✅ Selección numérica para tipoReunión y tipoRecurrencia (diaria/semanal/mensual)
- ✅ Módulo Zoom implementado (individual y recurrente diaria/semanal/mensual)
- ✅ Integración en main.js: crea reunión y anexa datos al resultado
- ✅ Documentación actualizada (activeContext, techContext, systemPatterns, productContext, este archivo)
- ⏳ Próximo: services/timeanddate.js

### 2024-08-08
- ✅ Documentación estructurada creada
- ✅ Estado del proyecto consolidado  
- ✅ Módulo Zoom completado (versión inicial)
- 🔄 **INICIANDO**: Desarrollo Módulo INPUT (histórico)
- 📝 Documentación actualizada con nuevo orden de módulos

---

## 🚨 INFORMACIÓN CRÍTICA PARA CONTINUIDAD

**Si se corta la conversación:**
1. Mostrar este archivo `PROYECTO_ESTADO.md`
2. Indicar último módulo en desarrollo: **TimeAndDate**
3. Continuar desde "PRÓXIMO PASO INMEDIATO"

**Todas las APIs están validadas y funcionando - falta encadenar módulos restantes.**
