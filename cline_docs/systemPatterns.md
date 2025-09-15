# System Patterns

Arquitectura y decisiones técnicas clave para mantener consistencia.

## Arquitectura general
- Estilo: Node.js (CommonJS).
- Capas:
  - modulos/: interacción con usuario (INPUT) u orquestación específica.
  - services/: integraciones externas (Zoom, LearnDash, TimeAndDate; futuras Woo/FluentCRM).
  - utils/: utilitarios compartidos (logger, validator).
  - templates/: generadores/plantillas de dominio (course template).
  - main.js: orquestador del flujo principal (INPUT → integraciones).
  - cline_docs/: Memory Bank (contexto persistente del proyecto).
  - wp-plugin/: plugin WordPress mínimo para compatibilidad con LearnDash (fallback).

## Patrón de flujo (pipeline)
1) Input (CLI) valida y normaliza datos → objeto canonizado.
2) Orquestador (main) consume ese objeto:
   - Construye un courseConfig base (template).
   - Crea reunión Zoom (individual o recurrente) si hay .env válido.
   - Genera URLs TimeAndDate y tabla HTML de horarios por ciudad (DST correcto).
   - Crea/actualiza curso y Lección 1 en LearnDash y la asigna al Course Builder (ver estrategia abajo).
3) Salida JSON consolidada para auditoría y siguientes pasos.

## Módulo INPUT (CLI)
- Interfaz: readline (sin dependencias externas).
- Prompts y selección numérica:
  - 1) nombreBase
  - 1.b) nombreProducto
  - 2) fechaInicio (DD/MM/YYYY)
  - 2.b) horaInicio (HH:mm, BA)
  - 2.c) duracionMinutos (entero ≥ 1)
  - 3) tagCurso
  - 4) tipoReunion (1: individual | 2: recurrente)
  - 4.b) tipoRecurrencia (1: diaria | 2: semanal | 3: mensual) [si 4=2]
  - 5) cantidadEncuentros [si 4=2]
  - 6) precio
  - 7) cursoExistente
  - 8) incluirForo
  - 9) incluirFormulario
  - 10) rutaImagen (opcional)
- Validaciones (utils/validator.js):
  - Fecha, hora, precio, booleanos, enteros, tag
  - parseChoice12 y parseRecurrenceChoice
- Modo no interactivo vía env NON_INTERACTIVE_JSON.

## Zoom (services)
- Autenticación: Server-to-Server OAuth (grant_type=account_credentials), token cacheado y refresh ante 401.
- Endpoint: POST /users/{ZOOM_HOST_EMAIL}/meetings
- Tipos de reunión:
  - Individual: type=2
  - Recurrente: type=8 con recurrence:
    - Diaria: { type: 1, repeat_interval: 1, end_times }
    - Semanal: { type: 2, repeat_interval: 1, weekly_days, end_times }
    - Mensual: { type: 3, repeat_interval: 1, monthly_day, end_times }
- start_time:
  - Se construye desde (fechaInicio + horaInicio) en timezone BA (o BASE_TIMEZONE).
  - Enviado con timezone explícito.

## TimeAndDate (services)
- Sin API; todo por construcción de URLs y cálculo de horarios con Luxon.
- buildIsoUTCFromBA(fecha, hora, tz) → ISO UTC (YYYYMMDDTHHmmss).
- buildConverterUrl → `https://www.timeanddate.com/worldclock/converter.html?iso=...`
- buildOccurrencesBA / buildOccurrencesFromZoom → DateTime[] base BA.
- convertToCities → lista por ciudades (UTC, BA, Bogotá, Lima, Madrid, México CDMX, Miami, Santiago).
- buildScheduleTableHtml → tabla 24h (es), una fila por encuentro y columnas por ciudad.
- buildConverterUrlsPerOccurrence → lista de links por encuentro.

## LearnDash (services)
- Objetivo: curso + Lección 1 con contenido (Zoom + TimeAndDate) y la lección asignada al Course Builder.
- Endpoints v2 usados:
  - Cursos: /wp-json/ldlms/v2/sfwd-courses (GET/POST/PUT)
  - Lecciones: /wp-json/ldlms/v2/sfwd-lessons (GET/POST/PUT)
- Patrón:
  1) ensureCourse({ title, slug, existingCourseFlag, description })
     - Busca por slug (wp/v2) o título (ldlms/v2).
     - Crea/actualiza con idempotencia, setea slug en create.
  2) ensureLesson1({ courseId, title, contentHtml, courseSlug })
     - Crea/actualiza con meta:
       - course: courseId
       - _ld_lesson_settings.associated_course: courseId
     - Contenido incluye: joinUrl/meetingId/password, horario, tabla HTML, links por encuentro, notas foro/formulario.
     - Marcador HTML para futuras actualizaciones: `<!-- AUTOGEN:LEARNDASH:course-slug=...;tag=... -->`
  3) ensureLessonAssignedToCourse({ courseId, lessonId })
     - Orden de estrategias:
       a) POST /wp-json/ldlms/v2/course-steps (genérico)
       b) POST /wp-json/ldlms/v2/course-steps/{courseId}/sfwd-lessons/{lessonId}
       c) POST /wp-json/ldlms/v2/course-steps/{courseId} con `{ steps: [...] }`
       d) PUT /wp-json/ldlms/v2/sfwd-lessons/{lessonId} con `course` + meta y reintento de (c)
       e) Fallback plugin: POST /wp-json/ld-automation/v1/assign-step (usa funciones internas del Builder)
     - Idempotencia: 409 = ya está asignado → OK.

### Plugin fallback (wp-plugin/ld-automation)
- Endpoint: POST `/wp-json/ld-automation/v1/assign-step`
- Autenticación: Basic Auth (Application Password)
- Permisos: requiere `manage_options` (solo admin)
- Acción: `learndash_course_add_step(courseId, stepId, 'sfwd-lessons', 0)`. Si no existe la función, asegura relación course/meta.
- Uso:
  - Estrategia controlada por `USE_LD_PLUGIN`:
    - Si `USE_LD_PLUGIN=true`, probar plugin primero y cortar en éxito (evita 404).
    - Si `false`, intentar API oficial y caer al plugin solo si todo falla.
  - En main.js se evita un segundo intento redundante cuando `USE_LD_PLUGIN=true`.

## Manejo de errores y logging
- utils/logger.js: niveles (error, warn, info) + timestamp ISO + prefijos [MAIN], [INPUT], [ZOOM], [LD], [TAD].
- Orquestador captura y registra stack; continúa sin Zoom/LD si faltan credenciales (warning).
- Logs describen el método de asignación usado (genérico/path/course/plugin).

## Configuración y secretos
- .env en la raíz (dotenv):
  - ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET, ZOOM_HOST_EMAIL
  - WP_BASE_URL, WP_USER, WP_APP_PASSWORD
  - BASE_TIMEZONE (default America/Argentina/Buenos_Aires)
  - USE_LD_PLUGIN (true|false) → preferencia de estrategia para LearnDash
- .env está en .gitignore; no exponer secretos.

## Estándares de código
- CommonJS (require/module.exports).
- Idioma de código y prompts: Español.
- Estructura clara por responsabilidad (modulos, services, utils, templates, docs).
- Idempotencia: no duplicar recursos; actualizar si ya existen.

## Integraciones futuras
- WooCommerce: actualizar producto existente (título público, precio, imagen, contenido/shortcode).
- FluentCRM: ensureTag/ensureList y reusar automatizaciones.
- TablePress: mantener shortcode; alternativa HTML disponible.
- FluentCommunity: configuración del espacio.

## Idempotencia y consistencia (principios)
- Reusar recursos existentes y mantener relaciones (course/meta).
- Guardar IDs/URLs generados para reuso.
- Evitar duplicados y usar 409 como “ya existe/asignado”.

## LearnDash: enforcement de settings de curso
- Objetivo: asegurar `course_price_type = 'closed'` de forma consistente en distintas instalaciones/variantes de LearnDash.
- Estrategia doble:
  1) REST v2 (refuerzo): enviar meta en create/update y, si es necesario, un segundo PUT sólo con `meta`:
     - `_ld_course_settings.course_price_type = 'closed'`
     - `_ld_course_price_type = 'closed'`
     - `_ld_price_type = 'closed'`
     - `course_price_type = 'closed'`
  2) Endpoint plugin (API nativa LD): `POST /wp-json/ld-automation/v1/set-course-setting` con
     - `course_id`, `key = 'course_price_type'`, `value = 'closed'`
     - Internamente llama a `learndash_update_setting($course_id, $key, $value)` y sincroniza metakeys de compatibilidad.
- Orden de aplicación en services/learndash.js:
  - POST/PUT del curso con meta → PUT de refuerzo meta → llamada al endpoint del plugin.
- Permisos: requiere usuario admin (manage_options) vía Application Password (Basic Auth).
- Idempotencia: múltiples ejecuciones mantienen el estado closed.

## FluentCRM: patrón de credenciales robusto
- Variables aceptadas (cualquiera de las dos parejas):
  - `FLUENTCRM_USER` / `FLUENTCRM_PASS`
  - `FLUENTCRM_API_USERNAME` / `FLUENTCRM_API_PASSWORD`
- Normalización de password:
  - Si la Application Password tiene espacios, el sistema los elimina automáticamente para Basic Auth.
- Cliente:
  - Base: `${WP_BASE_URL}/wp-json/fluent-crm/v2`
  - Autenticación: Basic <base64(user:pass)>
- Operaciones idempotentes:
  - `ensureTagFromCode(code)` y `ensureListFromCode(code)` creando/asegurando etiqueta y lista con `title = code` y `slug` normalizado.
