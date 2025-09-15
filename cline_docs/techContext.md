# Tech Context

Tecnologías, setup de desarrollo y restricciones técnicas del proyecto.

## Tecnologías usadas
- Node.js (CommonJS: require/module.exports)
- CLI: readline (para el Módulo INPUT)
- HTTP: axios
- Configuración: dotenv (.env)
- Fechas/Zonas horarias: luxon
- WordPress/LearnDash REST v2 + fallback plugin propio (ld-automation)
- Sin framework adicional por ahora

## Versiones recomendadas
- Node.js: 18.x o 20.x
- npm: 9+ (compatible con la versión de Node)

## Estructura del proyecto (actual)
```
/Users/apple/automatizacion_cursos
├── main.js
├── modulos/
│   └── input.js
├── services/
│   ├── config.js          # lee .env y defaults (Zoom, timezone, WP)
│   ├── http.js            # Zoom token S2S + axios autenticado
│   ├── zoom.js            # creación de reuniones individuales y recurrentes
│   ├── timeanddate.js     # URLs de conversión y tabla HTML por ciudades (DST)
│   └── learndash.js       # ensureCourse, ensureLesson1, ensureLessonAssignedToCourse (+ plugin fallback)
├── utils/
│   ├── logger.js
│   └── validator.js
├── templates/
│   └── course-template.js
├── wp-plugin/
│   └── ld-automation/
│       └── ld-automation.php   # endpoint REST para asignar steps en el Course Builder
├── cline_docs/
│   ├── productContext.md
│   ├── activeContext.md
│   ├── systemPatterns.md
│   └── techContext.md
├── .env.example
├── .gitignore
├── package.json
└── test-*.js (scripts de prueba de APIs existentes)
```

## Prompts y validaciones del INPUT
- Campos clave:
  - nombreBase (string)
  - nombreProducto (string) — título público en WooCommerce; no se toca slug ni descripción
  - fechaInicio (DD/MM/YYYY)
  - horaInicio (HH:mm, BA por defecto)
  - duracionMinutos (entero ≥ 1)
  - tagCurso (alfanumérico + `-`/`_`)
  - tipoReunion (numérico): 1 → individual | 2 → recurrente
  - tipoRecurrencia (numérico si recurrente): 1 → diaria | 2 → semanal | 3 → mensual
  - cantidadEncuentros (entero ≥ 1 si recurrente; si individual = 1)
  - precio (USD; admite $ y coma decimal)
  - cursoExistente (s/n)
  - incluirForo (s/n)
  - incluirFormulario (s/n)
  - rutaImagen (opcional)
- Validaciones (utils/validator.js):
  - Fecha: validateDateDDMMYYYY
  - Hora: validateTimeHHmm
  - Precio: parsePriceUSD
  - Booleanos: parseYesNoBoolean
  - Tipo reunión: parseChoice12 → 'individual'|'recurrente'
  - Recurrencia: parseRecurrenceChoice → 'diaria'|'semanal'|'mensual'
  - Entero ≥ 1: parseIntegerMin1
  - Tag: validateTag

## Modelado del curso (templates/course-template.js)
- schedule:
  - startDate (DD/MM/YYYY), time (HH:mm), durationMin (minutos)
  - type ('individual' | 'recurrente'), count (cantidadEncuentros)
  - recurrence: { kind: 'diaria'|'semanal'|'mensual', repeatInterval: 1 } si aplica
- integrations:
  - zoom: meetingId, joinUrl, startUrl, password y occurrences (si recurrente).
  - timeanddate: converterUrls (por encuentro) y tableHtml.
  - learndash: courseId y lessonIds (Lección 1).

## Zoom: autenticación y payloads
- Autenticación: Server-to-Server OAuth (grant_type=account_credentials)
  - services/http.js obtiene y cachea el access_token; refresca ante 401.
- Creación de reuniones: POST /users/{ZOOM_HOST_EMAIL}/meetings
- Tipos soportados:
  - Individual: type=2
  - Recurrente: type=8 + recurrence:
    - Diaria: { type: 1, repeat_interval: 1, end_times }
    - Semanal: { type: 2, repeat_interval: 1, weekly_days: <día de la semana de fechaInicio>, end_times }
    - Mensual: { type: 3, repeat_interval: 1, monthly_day: <día(fechaInicio)>, end_times }
- start_time:
  - Construido desde (fechaInicio + horaInicio) en timezone BA (o BASE_TIMEZONE en .env)
  - Enviado como "YYYY-MM-DDTHH:mm:ss" (hora local) con 'timezone' explícito en el payload.

## TimeAndDate (sin API)
- buildIsoUTCFromBA: genera ISO en UTC desde fecha/hora en BA (o tz definida).
- buildConverterUrl: `https://www.timeanddate.com/worldclock/converter.html?iso=YYYYMMDDTHHmmss` (UTC).
- buildOccurrencesBA / buildOccurrencesFromZoom: series de DateTime (Luxon) para encuentros.
- convertToCities: convierte cada encuentro a las ciudades definidas (UTC, BA, Bogotá, Lima, Madrid, México CDMX, Miami, Santiago) aplicando DST por ciudad.
- buildScheduleTableHtml: tabla 24h (es), una fila por encuentro y columnas por ciudad.
- buildConverterUrlsPerOccurrence: lista de links “Ver en tu ciudad” por encuentro.

## LearnDash (REST v2 + fallback plugin)
- Endpoints v2 usados:
  - Cursos: /wp-json/ldlms/v2/sfwd-courses (GET/POST/PUT)
  - Lecciones: /wp-json/ldlms/v2/sfwd-lessons (GET/POST/PUT)
- Asignación de la lección al Course Builder (orden de estrategias en services/learndash.js):
  1) POST /wp-json/ldlms/v2/course-steps (genérico)
  2) POST /wp-json/ldlms/v2/course-steps/{courseId}/sfwd-lessons/{lessonId}
  3) POST /wp-json/ldlms/v2/course-steps/{courseId} con `{ steps: [...] }`
  4) PUT /wp-json/ldlms/v2/sfwd-lessons/{lessonId} con `course` + meta y reintento de (3)
  5) Fallback plugin: POST /wp-json/ld-automation/v1/assign-step (usa funciones internas del Builder)
- Contenido de Lección 1:
  - Datos Zoom (joinUrl, meetingId, password)
  - Detalle de horario (fecha/hora BA, duración, tipo y cantidad)
  - Tabla HTML de horarios por ciudad (timeanddate.tableHtml)
  - Enlaces “Ver en tu ciudad” por encuentro (converterUrls)
  - Notas condicionales (foro/formulario)
  - Marcador HTML para idempotencia: `<!-- AUTOGEN:LEARNDASH:course-slug=...;tag=... -->`

## Plugin ld-automation (WordPress)
- Ubicación: `wp-plugin/ld-automation/ld-automation.php`
- Endpoints:
  - POST `/wp-json/ld-automation/v1/assign-step` (asignar lección al Course Builder)
  - POST `/wp-json/ld-automation/v1/set-course-setting` (fijar settings nativos de LearnDash, ej. course_price_type)
- Autenticación: Basic Auth (Application Password del usuario admin)
- Permisos: requiere `manage_options` (solo administradores)
- Acciones:
  - `assign-step`: usa funciones internas del Builder (`learndash_course_add_step(...)`); si no existen, asegura relación course/meta.
  - `set-course-setting`: usa `learndash_update_setting($course_id, $key, $value)` y sincroniza metakeys de compatibilidad cuando aplica.
- Uso:
  - `assign-step`: el servicio lo intenta cuando la API oficial de `course-steps` no está expuesta o si `USE_LD_PLUGIN=true`.
  - `set-course-setting`: el servicio lo invoca tras crear/actualizar el curso para forzar `course_price_type = 'closed'` de manera compatible con cualquier instalación.

## Variables de entorno (.env)
- Copiar `.env.example` a `.env` y completar:
  - Zoom:
    - ZOOM_ACCOUNT_ID
    - ZOOM_CLIENT_ID
    - ZOOM_CLIENT_SECRET
    - ZOOM_HOST_EMAIL
  - WordPress/LearnDash:
    - WP_BASE_URL (sin slash final)
    - WP_USER (con permisos admin)
    - WP_APP_PASSWORD (Application Password; el sistema normaliza espacios)
  - FluentCRM:
    - FLUENTCRM_USER/FLUENTCRM_PASS o FLUENTCRM_API_USERNAME/FLUENTCRM_API_PASSWORD
    - La password puede incluir espacios (Application Password); el sistema los remueve automáticamente
  - Timezone:
    - BASE_TIMEZONE (opcional; default America/Argentina/Buenos_Aires)
  - Estrategia LearnDash:
    - USE_LD_PLUGIN (true|false). Si `true`, preferir el plugin ld-automation para asignar la lección al Course Builder.
- Sin `.env` válido de Zoom, el flujo corre y omite la creación de reuniones (warning).
- Sin `.env` válido de WP/LD, el flujo corre y omite LearnDash (warning).

## Ejecución
- Interactivo (por defecto):
  - `npm run dev` (o `npm start`)
- No interactivo (para CI/pruebas): usar `NON_INTERACTIVE_JSON` con un JSON de defaults (ver ejemplo en activeContext.md).

## Scripts npm
- dev: `node main.js` (orquestador interactivo)
- start: `node main.js`
- input: `node modulos/input.js` (solo INPUT)
- test: `node test-zoom.js` (smoke de Zoom)
- start:zoom: `node test-zoom.js` (alias)

## Dependencias actuales
- axios
- dotenv
- luxon

## Plataforma
- OS objetivo: macOS (/bin/zsh), compatible con Linux/Windows (ajustar comandos si es necesario).

## Próximo trabajo técnico
- Integración FluentCRM (reusar automatizaciones; ensureTag/ensureList).
- WooCommerce (actualizar producto existente: título público, precio, imagen, contenido/shortcode).
- Opcional: tests de integración por módulo y reintentos con backoff.
