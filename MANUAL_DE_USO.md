# Manual de Uso - Automatización de Cursos 🚀

Este script automatiza la creación y configuración de cursos en **WordPress (LearnDash + WooCommerce)**, integrando **Zoom** y **FluentCRM**.

## ✨ Funcionalidades

1.  **Zoom**: Crea reuniones (Individuales o Recurrentes).
2.  **FluentCRM**: Asegura que existan los TAGS y LISTAS correspondientes.
3.  **LearnDash**:
    *   **Auto-Clonado**: Permite clonar un curso existente (Settings, Contenido, Imagen) buscando por su TAG (ej. `TPL01`).
    *   **Creación**: Si no se clona, crea un curso base.
    *   **Lección Zoom**: Crea/Actualiza la lección con los datos de conexión y archivo `.ics` (Calendario).
4.  **WooCommerce**: Busca el producto asociado y actualiza la integración con LearnDash y FluentCRM.

---

## 🛠️ Requisitos Previos

1.  **Node.js**: Instalado (v14+ recomendado).
2.  **Archivo `.env`**: Debe existir en la raíz con las siguientes credenciales:
    ```env
    # WordPress / LearnDash
    WP_BASE_URL=https://tucurso.com/wp-json
    WP_USER=usuario_admin
    WP_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx  # Application Password

    # WooCommerce
    WC_CONSUMER_KEY=ck_xxxxxxxx
    WC_CONSUMER_SECRET=cs_xxxxxxxx

    # Zoom (Server-to-Server OAuth)
    ZOOM_ACCOUNT_ID=xxxx
    ZOOM_CLIENT_ID=xxxx
    ZOOM_CLIENT_SECRET=xxxx
    ZOOM_HOST_EMAIL=email@zoom.com

    # FluentCRM (Basic Auth)
    FCRM_BASE_URL=https://tucurso.com/wp-json/fluent-crm/v2
    FCRM_USER=usuario_admin
    FCRM_PASS=xxxx-xxxx-xxxx-xxxx
    ```
3.  **Dependencias**: Ejecutar `npm install` si es la primera vez.

---

## ▶️ Cómo Ejecutar

1.  Abrir terminal en la carpeta del proyecto:
    ```bash
    cd /Users/apple/automatizacion_cursos
    ```
2.  Ejecutar el script principal:
    ```bash
    node main.js
    ```

---

## 📝 Guía Paso a Paso (Inputs)

Al iniciar, el asistente te hará las siguientes preguntas:

1.  **🏷️ ¿Tag del curso MOLDE a clonar?**
    *   Escribe el **Tag** (o parte única del Título) de un curso existente que quieras usar como plantilla (ej. `TPL01`).
    *   *Dejar vacío* si quieres crear un curso desde cero sin base.

2.  **📝 Nombre INTERNO del curso (LearnDash)**
    *   Ej: `Astrología Básica - Marzo 2026`.

3.  **🛒 Nombre PÚBLICO del producto (WooCommerce)**
    *   Se asocia automáticamente si coincide con el producto existente.

4.  **📅 Fecha y Hora de Inicio**
    *   Formato: `DD/MM/YYYY` y `HH:mm`.

5.  **⏳ Duración y Cantidad**
    *   Minutos por encuentro y cantidad de clases.

6.  **🏷️ TAG del NUEVO curso**
    *   Ej: `ASTRO2026`. Este código se usará en FluentCRM y para identificar el curso.

7.  **🎥 Tipo de Reunión**
    *   **Individual**: Un solo encuentro.
    *   **Recurrente**: Mismo link para todos los encuentros.

8.  **⚙️ ¿Modo Actualización?**
    *   **Sí**: Si el curso con ese Tag ya existe y quieres actualizar sus datos.
    *   **No**: Intentará crear uno nuevo (fallará si ya existe para evitar duplicados).

9.  **🖼️ Ruta de Imagen (Opcional)**
    *   Ruta completa a un archivo `.jpg` o `.png` para usar de imagen destacada.

---

## ⚠️ Solución de Problemas

*   **Error: "No se encontró ningún curso molde..."**: Revisa que el Tag escrito coincida con parte del Título del curso origen en LearnDash.
*   **Error: "Producto no encontrado por SKU"**: El script busca productos en WooCommerce que coincidan con `nombreProducto` o SKU derivados. Asegúrate de que el producto exista o créalo manualmente antes si es necesario.
*   **Tags FluentCRM no visibles en Woo**: El script fuerza la actualización visual (`fcrm-settings-woo`). Si no se ven, recarga la página de edición del producto.

---

## 🧩 Estructura Automática

El script asegura la siguiente estructura:
1.  **Producto Woo** -> vinculado a -> **Curso LearnDash**.
2.  **Curso LearnDash** -> contiene -> **Lección "Datos de Encuentro (Zoom)"**.
3.  **FluentCRM** -> Etiqueta `P$` (Pendiente) y `TagCurso` asignadas al producto.

¡Listo! Tu curso debería estar operativo en minutos. 🚀
