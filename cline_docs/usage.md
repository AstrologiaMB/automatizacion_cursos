# Guía de uso — Automatización de Cursos
Zoom + LearnDash + WooCommerce + FluentCRM

Versionado junto al proyecto para consulta futura.

## 1) Resumen
Este programa automatiza:
- Creación de reunión Zoom (S2S OAuth).
- Actualización de curso y lección en LearnDash (con plugin ld-automation para asignar el step).
- Actualización de un producto existente en WooCommerce (solo título público e imagen).
- Preparación de tags/lista en FluentCRM (idempotente). Los tags de FluentCRM dentro del producto se dejan manual de momento.

Flujo típico:
1. Completar `.env` con credenciales.
2. Ejecutar `npm run dev`.
3. Responder el asistente (INPUT).
4. Revisar cambios en modo DRY-RUN (previa).
5. Cambiar a LIVE para aplicar.

## 2) Requisitos
- Node.js 18+.
- Accesos:
  - Zoom Server-to-Server OAuth (ACCOUNT_ID, CLIENT_ID, CLIENT_SECRET).
  - WordPress (WP_USER + Application Password) y LearnDash activo.
  - WooCommerce (Consumer Key/Secret).
  - FluentCRM (usuario/password con permisos y REST habilitado).
- Plugin ld-automation instalado (incluido en `wp-plugin/ld-automation/ld-automation.php`) si se usa `USE_LD_PLUGIN=true`.

## 3) Configuración `.env`
Variables clave (sin comentarios Markdown, solo CLAVE=valor):

Zoom:
```
ZOOM_ACCOUNT_ID=...
ZOOM_CLIENT_ID=...
ZOOM_CLIENT_SECRET=...
ZOOM_HOST_EMAIL=...
```

WordPress / LearnDash:
```
WP_BASE_URL=https://tu-sitio.com        # sin slash final
WP_USER=admin@tu-sitio.com
WP_APP_PASSWORD=xxxx xxxx xxxx xxxx     # los espacios se remueven automáticamente
USE_LD_PLUGIN=true
```

FluentCRM (cualquiera de los nombres; ambos soportados):
```
FLUENTCRM_USER=apiuser
FLUENTCRM_PASS=apipass
# o
FLUENTCRM_API_USERNAME=apiuser
FLUENTCRM_API_PASSWORD=apipass
```

WooCommerce:
```
WC_CONSUMER_KEY=ck_xxx
WC_CONSUMER_SECRET=cs_xxx
DRY_RUN_WC=true   # true=simulación (no aplica), false=aplicar cambios
```

Notas:
- No uses encabezados tipo “###” ni bloques ``` en `.env`.
- `WP_APP_PASSWORD` puede traer espacios; el sistema los normaliza.

## 4) Ejecución
Interactivo:
```
npm run dev
```
Preguntas principales del asistente:
- 1) Nombre del curso (base para LearnDash).
- 1.b) Nombre del producto (título público en tienda) → se usa tal cual en WooCommerce.
- 2) Fecha inicio (DD/MM/YYYY).
- 2.b) Hora inicio (HH:mm) zona Buenos Aires.
- 2.c) Duración en minutos.
- 3) Tag identificatorio (ej. SU0825).
- 3.b) ¿Usar curso clonado por tag? (s/n).
- 3.c) Tag del curso clonado (si 3.b = s) — el curso clonado siempre empieza con “Copy of ...”.
- 4) Tipo de reunión (individual o recurrente).
- 6) Precio en USD (informativo para el flujo, Woo no lo toca).
- 10) Ruta imagen (URL absoluta recomendada; si es local se sube a Media).

No interactivo (opcional):
- Usar `NON_INTERACTIVE_JSON` con el objeto defaults.
- Ejemplo:
```
NON_INTERACTIVE_JSON='{"nombreBase":"...","nombreProducto":"...","fechaInicio":"01/09/2025","horaInicio":"19:30","duracionMinutos":90,"tagCurso":"SU0925","tipoReunion":"individual","precio":66,"cursoExistente":true,"incluirForo":false,"incluirFormulario":false,"rutaImagen":"https://.../img.jpg","useExistingClonedCourse":true,"existingTag":"SU0825"}' npm run dev
```

## 5) ¿Qué hace cada integración?

Zoom:
- Crea reunión (S2S), guarda `meetingId`, `startUrl`, `joinUrl`, `password` y fechas cuando aplica.

LearnDash:
- Si “usar curso clonado por tag”:
  - Detecta el curso clonado (el usuario lo clonó manualmente).
  - Renombra título a `input.nombreBase`.
  - Normaliza slug al tag existente en minúsculas (ej. “su0825”).
  - Crea/actualiza lección “Datos del Encuentro (Zoom) — {título}” con slug determinístico y la asigna al Course Builder (vía plugin ld-automation si `USE_LD_PLUGIN=true`).
  - Fuerza `course_price_type=closed`.
- Si no:
  - Crea/actualiza curso y lección 1 de forma idempotente y asigna el step.

WooCommerce:
- Identifica producto SOLO por SKU = primeras 2 letras de `tagCurso` + `zoom`.
  - Ej.: `SU0825` → intenta `SUzoom` y `suzoom`.
- Actualiza únicamente:
  - `name` ← `input.nombreProducto` (exacto).
  - `image`:
    - Si `rutaImagen` es URL: se asigna directo.
    - Si es local: se sube a Media y se asigna el ID devuelto.
- Preserva: slug, precio, short_description, description, categorías y otros metadatos.
- DRY-RUN: con `DRY_RUN_WC=true` muestra diffs y no aplica.

FluentCRM:
- Asegura Tag y Lista con título = `tagCurso` (idempotente).
- Integración de tags dentro del Producto WooCommerce: actualmente se actualiza manualmente (ver §7).

## 6) Convenciones importantes
- SKU WooCommerce: “XXzoom” donde `XX` son las 2 primeras letras del tag. El buscador prueba prefijo mayúsculas/minúsculas; “zoom” siempre en minúsculas.
- Título WooCommerce: viene de 1.b y NO se recalcula el sufijo; se usa tal cual.
- Imagen WooCommerce: preferentemente URL absoluta para evitar problemas de permisos.

## 7) Ajuste manual de tags de FluentCRM en Producto
Por decisión actual, los tags del panel “FluentCRM” del producto se ajustan a mano:
- Compra / Añadir etiquetas: dejar “p$” y el nuevo `tagCurso` (ej. SU0925); remover solo el tagCurso viejo (ej. SU0825).
- Reembolso / Eliminar etiquetas: reemplazar el viejo por el nuevo.
- No modificar categorías, descripciones o slug.

## 8) DRY-RUN vs LIVE
- Previsualización (recomendada):
  - `DRY_RUN_WC=true` en `.env`.
  - Correr `npm run dev`.
  - Ver en logs: “[WC] DRY-RUN habilitado. Cambios planificados: ...”.
- Aplicar:
  - `DRY_RUN_WC=false` en `.env`.
  - Correr `npm run dev`.
  - Ver en logs: “[WC] Producto actualizado (PATCH) ID=...”.

## 9) Solución de problemas (FAQ)
- “Credenciales WooCommerce no configuradas (.env)”
  - Asegurate de tener:
    ```
    WC_CONSUMER_KEY=ck_xxx
    WC_CONSUMER_SECRET=cs_xxx
    ```
  - No usar bloques “```” en `.env`.
- “Producto no encontrado por SKU”
  - Verificar que el SKU del producto sea “XXzoom” (XX = 2 primeras letras del tag).
- “Zoom falló”
  - Revisar ZOOM_* y el S2S token; ver logs de “[ZOOM]”.
- “La lección no aparece en Course Builder”
  - Verificar `USE_LD_PLUGIN=true` y que el plugin ld-automation esté activo/instalado.
- “Errores 422 en FluentCRM”
  - Suceden si el tag/lista ya existen; no frenan el resto del flujo. Los tags en el producto se cambian manualmente (§7).

## 10) Ejemplos

Dry-run:
```
DRY_RUN_WC=true
npm run dev
# Logs: [WC] DRY-RUN habilitado. Cambios planificados:
# - name => XXX → YYY
# - image => https://.../old.jpg → https://.../new.jpg
```

Aplicar:
```
DRY_RUN_WC=false
npm run dev
# Logs: [WC] Producto actualizado (PATCH) ID=...
```

## 11) Seguridad
- Nunca commitear `.env`.
- `WP_APP_PASSWORD` puede venir con espacios; el sistema ya los remueve.
- Trabajar primero en DRY-RUN para previsualizar.

## 12) Contacto/Notas
- Si más adelante se desea automatizar el reemplazo de tags dentro del producto (FluentCRM), se puede activar un modo debug y refinar la detección de los meta fields. Por ahora, el ajuste se hace manualmente en la edición del producto.
