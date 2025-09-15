# Progress

Estado de avance, qué funciona y qué falta.

Última actualización: 2025-08-11

## Qué funciona (completo)
- INPUT (CLI) con validaciones:
  - Campos: nombreBase, nombreProducto, fechaInicio (DD/MM/YYYY), horaInicio (HH:mm), duracionMinutos, tagCurso, precio, cursoExistente, incluirForo, incluirFormulario, rutaImagen.
  - Selecciones numéricas:
    - 4) Tipo de reunión: 1 (individual) | 2 (recurrente)
    - 4.b) Tipo de recurrencia (si recurrente): 1 (diaria) | 2 (semanal) | 3 (mensual)
  - Validadores: fecha, hora, precio, booleanos, enteros, tag, parseChoice12, parseRecurrenceChoice.
- Zoom (Server-to-Server OAuth):
  - Creación de reuniones:
    - Individual (type=2)
    - Recurrente diaria (type=8, recurrence.type=1)
    - Recurrente semanal (type=8, recurrence.type=2 + weekly_days)
    - Recurrente mensual (type=8, recurrence.type=3 + monthly_day)
  - Token S2S cacheado y refresh ante 401; creación exitosa validada (meetingId, joinUrl, startUrl, occurrences).
- TimeAndDate (sin API):
  - Links por encuentro (converterUrls) y tabla HTML de horarios por ciudad (DST automático).
  - Integrado en main.js; courseConfig.integrations.timeanddate = { converterUrls, tableHtml }.
- LearnDash:
  - ensureCourse (sfwd-courses) y ensureLesson1 (sfwd-lessons) con contenido HTML (Zoom + TimeAndDate) y meta (course + associated_course).
  - Asignación de la lección al Course Builder:
    - Prioriza API oficial “course-steps” si está disponible.
    - Fallback plugin ld-automation (WordPress) cuando la API oficial no está expuesta.
  - Variable de entorno `USE_LD_PLUGIN` para preferir plugin primero según entorno.
- FluentCRM:
  - Etiqueta y lista idempotentes basadas en tagCurso; credenciales .env flexibles (FLUENTCRM_USER/FLUENTCRM_PASS o FLUENTCRM_API_USERNAME/FLUENTCRM_API_PASSWORD; las contraseñas con espacios se normalizan).
- LearnDash — Course Price Type:
  - price_type forzado a 'closed' con doble estrategia: (1) meta por REST v2 (refuerzo), (2) endpoint del plugin ld-automation `set-course-setting` que usa la API nativa de LearnDash.
- Orquestador (main.js):
  - Flujo: INPUT → courseConfig → Zoom (si .env válido) → TimeAndDate → LearnDash (curso + Lección 1 + asignación).
  - Manejo de ausencia de credenciales: warning y continúa.
- Templates:
  - course-template.js: schedule con startDate, time, durationMin, type, count, recurrence { kind, repeatInterval: 1 }.
- Configuración:
  - .env.example (incluye USE_LD_PLUGIN), .gitignore
  - services/: config.js, http.js, zoom.js, timeanddate.js, learndash.js
  - Dependencias: axios, dotenv, luxon
- Documentación puesta al día:
  - cline_docs/activeContext.md, techContext.md, systemPatterns.md, productContext.md
  - proyecto_estado.md actualizado

## Qué falta (próximos módulos)
- WooCommerce:
  - Actualizar producto existente (sin crear): título público (nombreProducto), precio, imagen, contenido/shortcode; mantener slug/descripcion.
- TablePress:
  - Mantener shortcode manual por ahora; opción HTML ya disponible (tabla generada).
- Utilitarios/robustez:
  - Reintentos con backoff por módulo, logs adicionales cuando aplique.
  - Tests automatizados por integración (opcional).

## Bloqueadores actuales
- Ninguno crítico. La asignación de steps en LearnDash está resuelta con fallback plugin en sitios sin “course-steps” expuesto.

## Siguientes pasos
1) Integración WooCommerce (actualizar producto existente).
2) TablePress/HTML (opcional).
3) Opcional: robustez (reintentos con backoff y tests por módulo).

## Estado global
- Progreso estimado: 80%
- Flujo INPUT → Zoom → TimeAndDate → LearnDash operativo y documentado; siguientes módulos en agenda.
