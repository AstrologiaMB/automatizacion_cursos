# Product Context

## Por qué existe este proyecto
Reducir el tiempo de creación y publicación de cursos online desde 45–60 minutos a 2–5 minutos mediante un sistema automatizado que orquesta múltiples servicios (Zoom, LearnDash, TimeAndDate/tabla de horarios, WooCommerce, FluentCRM, FluentCommunity y TablePress/HTML).

## Problemas que resuelve
- Configuración manual y repetitiva de reuniones Zoom (individuales y recurrentes).
- Creación y vinculación manual de curso + lecciones en LearnDash (que la lección aparezca dentro del Course Builder).
- Generación de tablas de horarios y conversión de zonas horarias (DST correcto por ciudad).
- Gestión y actualización de producto existente en WooCommerce (título público, precio, imagen, contenido).
- Reuso de automatizaciones en FluentCRM (tags/listas) y configuración de espacios en FluentCommunity.
- Validación de inputs y consistencia de datos entre sistemas.

## Cómo debería funcionar (visión de producto)
1) El usuario ejecuta un CLI (Módulo INPUT) y responde preguntas guiadas con validaciones estrictas.
2) El sistema valida y normaliza los datos (fecha DD/MM/YYYY, hora HH:mm, duración, precios USD, booleanos, etc.).
3) Con los datos confirmados:
   - Crea reunión Zoom (individual o recurrente diaria/semanal/mensual) y devuelve URLs/IDs.
   - Genera enlaces de TimeAndDate por encuentro y una tabla HTML de horarios por ciudad (DST automático).
   - Crea/actualiza el curso en LearnDash y la Lección 1 con el contenido necesario:
     - Datos de Zoom: joinUrl, meetingId, passcode (si aplica)
     - Detalle de horario (fecha/hora BA, duración, tipo de reunión, cantidad de encuentros)
     - Tabla HTML de horarios (TimeAndDate)
     - Enlaces “Ver en tu ciudad” por encuentro
     - Notas condicionales (foro/formulario)
   - Añade la Lección 1 dentro del Course Builder (curriculum) de LearnDash:
     - Prioriza la API oficial “course-steps” si está expuesta en tu instalación.
     - Si no está disponible, usa un plugin mínimo de WordPress (ld-automation) que llama las funciones internas del Builder.
     - El orden de estrategias y el fallback están encapsulados y son idempotentes.
   - (Futuro) Reutiliza automatizaciones de FluentCRM y actualiza el producto existente en WooCommerce.
4) Devuelve un resumen final con IDs/URLs de todos los recursos creados/actualizados, listo para vender.

## Flujo alto nivel (confirmado)
Input (CLI) → Zoom → LearnDash (curso + Lección 1 + asignación al curso) → TimeAndDate (links + tabla HTML) → (WooCommerce) → (FluentCRM) → (FluentCommunity) → Output final.

## Interacción del usuario (prompts relevantes)
- Tipo de reunión (numérico): 1 = individual | 2 = recurrente
- Si recurrente, tipo de recurrencia (numérico): 1 = diaria | 2 = semanal | 3 = mensual

## Ejemplo de input estándar (confirmado)
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

## Criterios de éxito
- Tiempo de orquestación total 2–5 minutos.
- Tolerancia a errores con mensajes claros y reintentos seguros.
- Idempotencia (evitar duplicados; actualizar cuando corresponde).
- Log detallado por paso y salida JSON estandarizada para auditoría.

## Supuestos actuales (decisiones de producto)
- WooCommerce: se trabaja sobre producto existente (slug y descripción permanecen). El INPUT pide `nombreProducto` solo para el título público.
- TablePress: se mantiene un shortcode y el contenido se puede actualizar manualmente por ahora; alternativa HTML disponible (la tabla ya se genera).
- Automatizaciones FluentCRM: se reutilizan (no se crean nuevas por ahora).
- LearnDash:
  - Se crea/actualiza el curso y la Lección 1 con contenido completo.
  - La lección se agrega al Course Builder ya sea por API oficial “course-steps” (si existe) o por plugin ld-automation (fallback seguro y reversible).
- Estrategia de asignación de LearnDash controlada por variable de entorno:
  - `USE_LD_PLUGIN` (true|false): si true, el sistema intenta primero el plugin para evitar warnings 404 cuando la API oficial no está expuesta en el sitio. Si false, prioriza la API oficial y cae al plugin solo si todo falla.
