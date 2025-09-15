<?php
/**
 * Plugin Name: LD Automation (Assign Step)
 * Description: Endpoint REST seguro para asignar una lección (u otro step) a un curso de LearnDash usando las funciones internas del Builder.
 * Version:     1.0.0
 * Author:      Automatización Cursos
 */

if ( ! defined( 'ABSPATH' ) ) {
  exit;
}

add_action( 'rest_api_init', function () {
  register_rest_route( 'ld-automation/v1', '/assign-step', array(
    'methods'             => 'POST',
    'callback'            => 'ld_automation_assign_step',
    'permission_callback' => 'ld_automation_can_assign_step',
    'args'                => array(
      'course_id' => array(
        'required'          => true,
        'validate_callback' => function ( $param ) { return is_numeric( $param ) && intval( $param ) > 0; },
        'sanitize_callback' => 'absint',
      ),
      'step_id' => array(
        'required'          => true,
        'validate_callback' => function ( $param ) { return is_numeric( $param ) && intval( $param ) > 0; },
        'sanitize_callback' => 'absint',
      ),
      'step_type' => array(
        'required'          => false,
        'sanitize_callback' => function ( $param ) {
          $t = sanitize_text_field( $param );
          return $t ? $t : 'sfwd-lessons';
        },
      ),
      'step_parent_id' => array(
        'required'          => false,
        'sanitize_callback' => 'absint',
      ),
    ),
  ) );
} );

function ld_automation_can_assign_step( WP_REST_Request $request ) {
  // Requiere usuario autenticado (Application Password) y permisos de administrador.
  if ( ! is_user_logged_in() ) {
    return new WP_Error( 'ld_auto_not_logged_in', 'Debe estar autenticado para usar este endpoint.', array( 'status' => 401 ) );
  }
  if ( current_user_can( 'manage_options' ) ) {
    return true;
  }
  return new WP_Error( 'ld_auto_forbidden', 'Permisos insuficientes para asignar steps. Se requiere rol de administrador.', array( 'status' => 403 ) );
}

function ld_automation_assign_step( WP_REST_Request $request ) {
  $course_id      = absint( $request->get_param( 'course_id' ) );
  $step_id        = absint( $request->get_param( 'step_id' ) );
  $step_type      = $request->get_param( 'step_type' );
  $step_type      = $step_type ? sanitize_text_field( $step_type ) : 'sfwd-lessons';
  $step_parent_id = absint( $request->get_param( 'step_parent_id' ) );

  if ( ! $course_id || ! $step_id ) {
    return new WP_Error( 'ld_auto_bad_params', 'Parámetros inválidos.', array( 'status' => 400 ) );
  }

  // Validar que existen los posts
  $course = get_post( $course_id );
  $step   = get_post( $step_id );
  if ( ! $course || 'sfwd-courses' !== $course->post_type ) {
    return new WP_Error( 'ld_auto_no_course', 'El curso no existe o no es de tipo sfwd-courses.', array( 'status' => 404 ) );
  }
  if ( ! $step ) {
    return new WP_Error( 'ld_auto_no_step', 'El step no existe.', array( 'status' => 404 ) );
  }

  // Ideal: usar las funciones internas del Builder.
  // Según versión, existen funciones como learndash_course_add_step().
  if ( function_exists( 'learndash_course_add_step' ) ) {
    // Idempotencia básica: si ya está, devolver OK.
    if ( function_exists( 'learndash_course_step_exists' ) ) {
      $exists = learndash_course_step_exists( $course_id, $step_id );
      if ( $exists ) {
        return array(
          'ok'     => true,
          'method' => 'learndash_course_add_step',
          'note'   => 'Ya estaba asignado',
        );
      }
    }
    $result = learndash_course_add_step( $course_id, $step_id, $step_type, $step_parent_id );
    if ( is_wp_error( $result ) ) {
      return new WP_Error( 'ld_auto_add_error', $result->get_error_message(), array( 'status' => 500 ) );
    }
    return array(
      'ok'     => true,
      'method' => 'learndash_course_add_step',
      'result' => $result,
    );
  }

  // Fallback si no existe la función (según versión):
  // Intentar actualizar relación mínima (course/meta). Esto no garantiza visibilidad en Builder, pero deja consistente la data.
  $meta_updated = false;
  $existing_course = get_post_meta( $step_id, 'course_id', true );
  if ( intval( $existing_course ) !== $course_id ) {
    update_post_meta( $step_id, 'course_id', $course_id );
    $meta_updated = true;
  }

  $ld_lesson_settings = get_post_meta( $step_id, '_ld_lesson_settings', true );
  if ( ! is_array( $ld_lesson_settings ) ) {
    $ld_lesson_settings = array();
  }
  if ( ! isset( $ld_lesson_settings['associated_course'] ) || intval( $ld_lesson_settings['associated_course'] ) !== $course_id ) {
    $ld_lesson_settings['associated_course'] = $course_id;
    update_post_meta( $step_id, '_ld_lesson_settings', $ld_lesson_settings );
    $meta_updated = true;
  }

  // También guardar el campo 'course' (propiedad rest de LD v2) como respaldo
  wp_update_post( array(
    'ID'          => $step_id,
    'post_parent' => 0, // por las dudas
  ) );
  update_post_meta( $step_id, 'course', $course_id );

  return array(
    'ok'            => true,
    'method'        => 'meta-fallback',
    'meta_updated'  => $meta_updated,
    'notice'        => 'No se encontró learndash_course_add_step(). Se aplicó relación course/meta. Puede requerir añadir manualmente en el Builder.',
  );
}

add_action( 'rest_api_init', function () {
  register_rest_route( 'ld-automation/v1', '/set-course-setting', array(
    'methods'             => 'POST',
    'callback'            => 'ld_automation_set_course_setting',
    'permission_callback' => 'ld_automation_can_assign_step',
    'args'                => array(
      'course_id' => array(
        'required'          => true,
        'validate_callback' => function ( $param ) { return is_numeric( $param ) && intval( $param ) > 0; },
        'sanitize_callback' => 'absint',
      ),
      'key' => array(
        'required'          => true,
        'sanitize_callback' => 'sanitize_text_field',
      ),
      'value' => array(
        'required'          => true,
        'sanitize_callback' => 'sanitize_text_field',
      ),
    ),
  ) );
} );

function ld_automation_set_course_setting( WP_REST_Request $request ) {
  // Requiere usuario autenticado (Application Password) y permisos de administrador.
  if ( ! is_user_logged_in() ) {
    return new WP_Error( 'ld_auto_not_logged_in', 'Debe estar autenticado para usar este endpoint.', array( 'status' => 401 ) );
  }
  if ( ! current_user_can( 'manage_options' ) ) {
    return new WP_Error( 'ld_auto_forbidden', 'Permisos insuficientes. Se requiere rol de administrador.', array( 'status' => 403 ) );
  }

  $course_id = absint( $request->get_param( 'course_id' ) );
  $key       = sanitize_text_field( $request->get_param( 'key' ) );
  $value     = sanitize_text_field( $request->get_param( 'value' ) );

  if ( ! $course_id || ! $key ) {
    return new WP_Error( 'ld_auto_bad_params', 'Parámetros inválidos.', array( 'status' => 400 ) );
  }

  if ( ! function_exists( 'learndash_update_setting' ) ) {
    return new WP_Error( 'ld_auto_no_ld', 'LearnDash no disponible en este sitio.', array( 'status' => 500 ) );
  }

  // Actualizar ajuste usando API nativa de LearnDash
  learndash_update_setting( $course_id, $key, $value );

  // Compatibilidad: varias claves donde distintos entornos guardan el tipo de precio
  if ( 'course_price_type' === $key ) {
    update_post_meta( $course_id, '_ld_course_price_type', $value );
    update_post_meta( $course_id, '_ld_price_type', $value );
    update_post_meta( $course_id, 'course_price_type', $value );
  }

  return array(
    'ok'        => true,
    'course_id' => $course_id,
    'key'       => $key,
    'value'     => $value,
  );
}
