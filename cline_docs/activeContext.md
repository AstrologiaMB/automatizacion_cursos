# Active Context

Estado operativo actualizado y próximos pasos. Fuente de verdad del trabajo en curso.

## Qué estoy trabajando ahora
- Documentación y alineación tras integrar LearnDash (curso + Lección 1 asignada al curso) con fallback vía plugin cuando la API oficial de Course Steps no está disponible.
- Mantener consistencia de configuraciones (.env), incluyendo la estrategia de asignación `USE_LD_PLUGIN`.
- Preparación de siguientes módulos: WooCommerce (producto existente), FluentCRM y, opcionalmente, TablePress.

## Cambios recientes (implementados en código)
- INPUT (modulos/input.js):
  - Nuevos campos: nombreProducto, horaInicio (HH:mm), duracionMinutos (entero ≥ 1).
  - Selecciones numéricas:
    - 4) Tipo de reunión: 1 (individual) | 2 (recurrente)
    - 4.b) Tipo de recurrencia: 1 (diaria) | 2 (semanal) | 3 (mensual) [si recurrente]
  - Validadores nuevos: parseChoice12, parseRecurrenceChoice (utils/validator.js).
- Zoom (services/zoom.js):
  - Reunión individual (type=2).
  - Recurrencias:
    - Diaria: type=8, recurrence.type=1, repeat_interval=1.
    - Semanal: type=8, recurrence.type=2, weekly_days desde fechaInicio, repeat_interval=1.
    - Mensual: type=8, recurrence.type=3, monthly_day desde fechaInicio, repeat_interval=1.
  - Integrado en main.js: crea la reunión si .env tiene credenciales válidas y anexa meetingId/joinUrl/startUrl/password/occurrences.
- TimeAndDate (services/timeanddate.js) [SIN API]:
  - buildConverterUrl: genera URL universal con iso=YYYYMMDDTHHmmss en UTC (derivado de BA).
  - buildOccurrencesBA / buildOccurrencesFromZoom: obtiene ocurrencias del curso (desde BA o desde Zoom).
  - convertToCities: convierte cada encuentro a UTC, Buenos Aires, Bogotá, Lima, Madrid, México (CDMX), Miami, Santiago con luxon (DST automático).
  - buildScheduleTableHtml: arma tabla HTML (24h, es) con una fila por encuentro y una columna por ciudad + nota de DST.
  - buildConverterUrlsPerOccurrence: lista de links “Ver en tu ciudad” por encuentro.
  - Integrado en main.js → courseConfig.integrations.timeanddate = { converterUrls, tableHtml }.
- Template (templates/course-template.js):
  - schedule incluye time, durationMin y recurrence { kind, repeatInterval: 1 }.
  - integrations ya contempla bloque timeanddate.
- LearnDash (services/learndash.js + main.js):
  - ensureCourse: crea/actualiza curso (sfwd-courses).
  - ensureLesson1: crea/actualiza Lección 1 con contenido HTML (Zoom + TimeAndDate) y meta (course + _ld_lesson_settings.associated_course).
  - ensureLessonAssignedToCourse: agrega la lección al “Course Builder” con una estrategia por orden:
    1) POST ldlms/v2/course-steps (genérico)
    2) POST ldlms/v2/course-steps/{courseId}/sfwd-lessons/{lessonId}
    3) POST ldlms/v2/course-steps/{courseId} con steps[]
    4) PUT sfwd-lessons/{lessonId} (course/meta) y reintento (3)
    5) Fallback plugin: POST /wp-json/ld-automation/v1/assign-step (usa funciones internas del Builder)
  - Variable de entorno `USE_LD_PLUGIN` para preferir plugin primero (plugin-first) y evitar 404 si la API oficial de course-steps no existe en el sitio.
  - main.js evita el reintento redundante cuando `USE_LD_PLUGIN=true`.

## Estructura actual
- main.js (orquestador con Zoom + TimeAndDate + LearnDash)
- modulos/input.js (CLI interactivo con selección numérica y recurrencias)
- services/
  - config.js (carga .env y defaults; provee getZoomConfig, getWpConfig)
  - http.js (token S2S + axios Zoom)
  - zoom.js (crear reuniones individuales y recurrentes diaria/semanal/mensual)
  - timeanddate.js (links del conversor y tabla HTML por ciudades)
  - learndash.js (ensureCourse, ensureLesson1, ensureLessonAssignedToCourse con fallback plugin)
- utils/
  - logger.js
  - validator.js (incluye parseChoice12 y parseRecurrenceChoice)
- templates/course-template.js
- wp-plugin/ld-automation/ld-automation.php (plugin mínimo para asignar steps cuando no hay endpoint oficial)
- .env.example, .gitignore
- package.json
- cline_docs/* (este archivo, productContext, systemPatterns, techContext, progress)

## Próximos pasos inmediatos
1) WooCommerce (producto existente):
   - Actualizar título público (nombreProducto), precio, imagen y contenido/shortcode según corresponda.
   - No crear producto nuevo; respetar slug/SEO existentes.
2) TablePress/HTML (opcional):
   - Mantener shortcode manual actual; si se elige HTML, ya tenemos la tabla lista para embebido.
3) Robustez y QA (opcional):
   - Reintentos con backoff y tests de integración por módulo.
4) Documentación:
   - Mantener actualizados estos documentos tras cambios en WooCommerce.

## Decisiones técnicas vigentes
- Node.js CommonJS.
- dotenv para configuración, luxon para fechas/zonas.
- Zoom: Server-to-Server OAuth; POST /users/{ZOOM_HOST_EMAIL}/meetings.
- TimeAndDate: sin API; URLs construidas y tabla generada con luxon/DST correcto.
- LearnDash:
  - API v2 para cursos/lecciones.
  - Asignación al curriculum del curso por API oficial “course-steps” si existe; si no, fallback plugin.
  - Estrategia controlada por `USE_LD_PLUGIN`.
- WooCommerce: se asume producto existente (no creación).
- TablePress: actualización manual por ahora; alternativa HTML disponible.

## Riesgos y mitigaciones
- Token Zoom: cache + refresh ante 401.
- Recurrencias: repeat_interval=1 en los tres modos; parametrizable después.
- DST: luxon aplica automáticamente ajustes por ciudad y fecha. Hora base siempre BA (sin DST).
- LearnDash course-steps 404: resuelto con plugin ld-automation (admin-only, Basic Auth, endpoint único y reversible).
- Warnings redundantes: minimizados usando `USE_LD_PLUGIN` y short-circuit en main.js.

## Checklist de esta iteración
- [x] INPUT extendido (nombreProducto, horaInicio, duracionMinutos)
- [x] Selección numérica tipoReunion y tipoRecurrencia
- [x] Zoom: individual/diaria/semanal/mensual
- [x] TimeAndDate: converterUrls y tabla HTML integrados en main y courseConfig
- [x] course-template schedule con time/durationMin/recurrence + bloque timeanddate
- [x] LearnDash: curso + Lección 1 y asignación al curso (con fallback plugin)
- [x] Variable `USE_LD_PLUGIN` y limpieza de reintentos redundantes
- [x] Documentación actualizada (este archivo; techContext, systemPatterns, productContext, progress, proyecto_estado)
- [x] Integración FluentCRM (etiqueta y lista por tagCurso; credenciales .env flexibles)
- [ ] Integración WooCommerce
