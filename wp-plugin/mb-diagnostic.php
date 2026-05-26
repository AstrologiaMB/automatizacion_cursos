<?php
/**
 * Plugin Name: MB Diagnostic Tool
 * Description: Herramienta temporal y segura para obtener versión de PHP, FluentCRM y capturar errores de API sin tocar wp-config.
 * Version: 1.0
 * Author: Soporte Técnico
 */

// Evitar acceso directo
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

// 1. Endpoint REST seguro para ver info del sistema (Solo Admin)
add_action( 'rest_api_init', function () {
    register_rest_route( 'mb-diag/v1', '/info', array(
        'methods' => 'GET',
        'callback' => 'mb_diag_get_info',
        'permission_callback' => function () {
            // Solo administradores pueden ver esto por seguridad
            return current_user_can( 'manage_options' );
        }
    ) );

    // Endpoint público (con clave secreta) para loguear errores desde el script Node
    register_rest_route( 'mb-diag/v1', '/log-error', array(
        'methods' => 'POST',
        'callback' => 'mb_diag_log_error',
        'permission_callback' => '__return_true' // Protegemos con token en el body
    ) );
} );

function mb_diag_get_info() {
    // Versión PHP
    $php_version = phpversion();

    // Versión FluentCRM
    $fluent_version = 'No instalado/Activo';
    if ( defined( 'FLUENTCRM_VERSION' ) ) {
        $fluent_version = FLUENTCRM_VERSION;
    } else {
        // Buscar en los plugins activos si no está definida la constante
        if ( ! function_exists( 'get_plugins' ) ) {
            require_once ABSPATH . 'wp-admin/includes/plugin.php';
        }
        $all_plugins = get_plugins();
        foreach ( $all_plugins as $path => $data ) {
            if ( strpos( $path, 'fluent-crm' ) !== false ) {
                $fluent_version = $data['Version'];
                break;
            }
        }
    }

    return array(
        'ok' => true,
        'php' => $php_version,
        'fluent_crm' => $fluent_version,
        'server' => $_SERVER['SERVER_SOFTWARE'] ?? 'Unknown'
    );
}

function mb_diag_log_error( $request ) {
    $params = $request->get_json_params();
    $secret = 'mb-diag-secret-123'; // Clave simple para que nadie más abuse

    if ( empty( $params['secret'] ) || $params['secret'] !== $secret ) {
        return new WP_Error( 'forbidden', 'Acceso denegado', array( 'status' => 403 ) );
    }

    $msg = isset( $params['message'] ) ? $params['message'] : 'Error desconocido';
    $data = isset( $params['data'] ) ? $params['data'] : array();
    
    // Guardar en un archivo temporal en uploads (más seguro que log de sistema)
    $upload_dir = wp_upload_dir();
    $file = $upload_dir['basedir'] . '/mb-diag-log.txt';
    
    $entry = "[" . date('Y-m-d H:i:s') . "] ERROR: " . $msg . "\n" . print_r($data, true) . "\n-------------------\n";
    
    file_put_contents( $file, $entry, FILE_APPEND );

    return array( 'success' => true, 'log_file' => $upload_dir['baseurl'] . '/mb-diag-log.txt' );
}
