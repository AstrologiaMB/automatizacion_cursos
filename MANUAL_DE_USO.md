# Manual de Uso - Automatización de Cursos 🚀

Este script automatiza la creación y configuración de cursos en **WordPress (LearnDash + WooCommerce)**, integrando **Zoom** y **FluentCRM**.

## ✨ Funcionalidades

1.  **Zoom**: Crea reuniones (Individuales o Recurrentes).
2.  **FluentCRM**: Asegura que existan los TAGS y LISTAS correspondientes.
3.  **LearnDash**:
    *   **Integración Post-Clonado**: Busca un curso existente por su Tag y le agrega la Lección de Zoom.
    *   **Corrección de URL**: Si el curso clonado quedó con una URL sucia (ej. `curso-xy-copy`), el script la corrige automáticamente al Tag limpio (ej. `/el0526`).
    *   **Lección Zoom**: Crea/Actualiza la lección con los datos de conexión y archivo `.ics` (Calendario).
4.  **WooCommerce**: Busca el producto asociado y actualiza la integración con LearnDash y FluentCRM.

---

## 🛠️ Requisitos Previos

1.  **Curso Clonado Manualmente**: Debes haber clonado el curso en LearnDash y haberle asignado un Tag o Título distintivo (ej. `PP0326_S`).
2.  **Node.js**: Instalado (v14+ recomendado).
3.  **Archivo `.env`**: Configurado correctamente.
4.  **Dependencias**: `npm install`.

---

## ▶️ Cómo Ejecutar

1.  **Clona el Curso** en WordPress/LearnDash. Asegúrate de incluir el **Tag** en el título (ej: "Curso Nivel 1 - PP0326_S").
2.  Ejecutar el script:
    ```bash
    node main.js
    ```

---

## 📝 Guía Paso a Paso (Inputs)

Al iniciar, el asistente te pedirá:

1.  **🏷️ Tag del curso YA CLONADO**
    *   Ingresa el código identificador que está en el título del curso que acabas de clonar (ej: `PP0326_S`).
    *   *El script buscará un curso que contenga este texto en su título.*

2.  **📝 Nombre INTERNO del curso (LearnDash)**
    *   Solo para verificar (el script te mostrará el curso encontrado).

3.  **🛒 Nombre PÚBLICO del producto (WooCommerce)**
    *   Se asocia automáticamente si coincide.

4.  **📅 Fecha y Hora de Inicio**
    *   Para configurar la reunión de Zoom.

5.  **⏳ Duración y Cantidad**
    *   Para Zoom.

6.  **🎥 Tipo de Reunión**
    *   Individual o Recurrente.

7.  **🖼️ Ruta de Imagen (Opcional)**
    *   Solo se subirá a WooCommerce.

---

## ⚠️ Solución de Problemas

*   **Error: "NO se encontró ningún curso con el tag..."**: El script no encontró ningún curso en LearnDash que tenga ese texto en el título. Revisa que hayas clonado el curso y que el título incluya el Tag.
*   **Error: "Producto no encontrado por SKU"**: Revisa el nombre del producto en WooCommerce.

---

## 🧩 Estructura Automática

El script asegura la siguiente estructura:
1.  **Producto Woo** -> vinculado a -> **Curso LearnDash**.
2.  **Curso LearnDash** -> contiene -> **Lección "Datos de Encuentro (Zoom)"**.
3.  **FluentCRM** -> Etiqueta `P$` (Pendiente) y `TagCurso` asignadas al producto.

¡Listo! Tu curso debería estar operativo en minutos. 🚀
