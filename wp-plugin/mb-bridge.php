<?php
/**
 * Plugin Name: MB API Bridge
 * Description: Bridge para SmartLinks, Secuencias y Tags de FluentCRM. Soluciona bugs de PUT en LiteSpeed y json_decode en PHP 8.1.
 * Version: 1.3
 */

if ( ! defined( 'ABSPATH' ) ) exit;

add_action( 'rest_api_init', function () {

    register_rest_route( 'mb-bridge/v1', '/update-smart-link', [
        'methods'             => 'POST',
        'callback'            => 'mb_bridge_update_smart_link',
        'permission_callback' => function () { return current_user_can( 'manage_options' ); },
    ] );

    register_rest_route( 'mb-bridge/v1', '/save-sequences', [
        'methods'             => 'POST',
        'callback'            => 'mb_bridge_save_sequences',
        'permission_callback' => function () { return current_user_can( 'manage_options' ); },
    ] );

    register_rest_route( 'mb-bridge/v1', '/swap-contact-tags', [
        'methods'             => 'POST',
        'callback'            => 'mb_bridge_swap_contact_tags',
        'permission_callback' => function () { return current_user_can( 'manage_options' ); },
    ] );

    register_rest_route( 'mb-bridge/v1', '/contacts-by-tag', [
        'methods'             => 'POST',
        'callback'            => 'mb_bridge_contacts_by_tag',
        'permission_callback' => function () { return current_user_can( 'manage_options' ); },
    ] );

} );

// ============================================================
// SMART LINK UPDATE
// ============================================================
function mb_bridge_update_smart_link( WP_REST_Request $request ) {
    global $wpdb;

    $params     = $request->get_json_params();
    $id         = intval( $params['id'] ?? 0 );
    if ( ! $id ) {
        return new WP_Error( 'invalid_id', 'ID invalido', [ 'status' => 400 ] );
    }
    $title      = sanitize_text_field( $params['title']      ?? '' );
    $target_url = esc_url_raw(          $params['target_url'] ?? '' );
    $status     = in_array( $params['status'] ?? '', [ 'published', 'draft' ] ) ? $params['status'] : 'published';
    $actions    = $params['actions'] ?? [];

    foreach ( [ 'FluentCampaign\\App\\Models\\SmartLink', 'FluentCampaign\\App\\Models\\ActionLink' ] as $cls ) {
        if ( ! class_exists( $cls ) ) continue;
        try {
            $link = $cls::find( $id );
            if ( ! $link ) {
                return new WP_Error( 'not_found', "SmartLink ID {$id} no encontrado", [ 'status' => 404 ] );
            }
            if ( $title )      $link->title      = $title;
            if ( $target_url ) $link->target_url = $target_url;
            $link->status = $status;
            $link->save();
            mb_bridge_sync_actions( $link, $actions );
            return [
                'success'   => true,
                'id'        => (int) $link->id,
                'title'     => $link->title,
                'short_url' => home_url( '/?fluentcrm=1&route=smart_url&slug=' . $link->slug ),
                'strategy'  => 'model',
            ];
        } catch ( Exception $e ) {}
        break;
    }

    $table = null;
    foreach ( [ 'fc_campaign_urls', 'fluentcrm_campaign_urls', 'fc_smart_links' ] as $t ) {
        $full = $wpdb->prefix . $t;
        if ( $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $full ) ) === $full ) {
            $table = $full;
            break;
        }
    }
    if ( ! $table ) {
        return new WP_Error( 'no_table', 'Tabla no encontrada', [ 'status' => 500 ] );
    }

    $update  = [];
    $columns = $wpdb->get_col( "SHOW COLUMNS FROM `{$table}`", 0 );
    if ( $title )      $update['title']      = $title;
    if ( $target_url ) $update['target_url'] = $target_url;
    if ( in_array( 'status', $columns, true ) )     $update['status']     = $status;
    if ( in_array( 'updated_at', $columns, true ) ) $update['updated_at'] = current_time( 'mysql' );

    if ( empty( $update ) ) {
        return new WP_Error( 'nothing_to_update', 'Sin campos', [ 'status' => 400 ] );
    }
    $result = $wpdb->update( $table, $update, [ 'id' => $id ] );
    if ( $result === false ) {
        return new WP_Error( 'db_error', $wpdb->last_error, [ 'status' => 500 ] );
    }
    return [ 'success' => true, 'id' => $id, 'strategy' => 'wpdb' ];
}

function mb_bridge_sync_actions( $link, $actions ) {
    $add_lists = array_map( 'intval', $actions['lists'] ?? [] );
    $add_tags  = array_map( 'intval', $actions['tags']  ?? [] );
    foreach ( [ 'lists', 'actionLists' ] as $rel ) {
        if ( ! method_exists( $link, $rel ) ) continue;
        $link->$rel()->sync( $add_lists );
        break;
    }
    foreach ( [ 'tags', 'actionTags' ] as $rel ) {
        if ( ! method_exists( $link, $rel ) ) continue;
        $link->$rel()->sync( $add_tags );
        break;
    }
}

// ============================================================
// SAVE SEQUENCES
// ============================================================
function mb_bridge_save_sequences( WP_REST_Request $request ) {
    $params    = $request->get_json_params();
    $funnel_id = intval( $params['funnel_id'] ?? 0 );
    $sequences = $params['sequences'] ?? [];
    if ( ! $funnel_id || empty( $sequences ) ) {
        return new WP_Error( 'invalid', 'Parametros requeridos', [ 'status' => 400 ] );
    }

    foreach ( [ 'FluentCrm\\App\\Models\\FunnelSequence', 'FluentCrm\\App\\Models\\FunnelAction' ] as $cls ) {
        if ( ! class_exists( $cls ) ) continue;
        $saved = 0;
        foreach ( $sequences as $seq ) {
            $seq_id = intval( $seq['id'] ?? 0 );
            if ( ! $seq_id ) continue;
            $model = $cls::find( $seq_id );
            if ( ! $model ) continue;
            $settings   = $seq['settings']   ?? [];
            $conditions = $seq['conditions']  ?? [];
            if ( is_string( $settings ) )   $settings   = json_decode( $settings,   true ) ?: [];
            if ( is_string( $conditions ) ) $conditions = json_decode( $conditions, true ) ?: [];
            $model->settings   = $settings;
            $model->conditions = $conditions;
            if ( isset( $seq['status'] ) ) $model->status = $seq['status'];
            $model->save();
            $saved++;
        }
        return [ 'success' => true, 'funnel_id' => $funnel_id, 'sequences_saved' => $saved, 'strategy' => 'model' ];
    }

    if ( class_exists( 'FluentCrm\\App\\Services\\Funnel\\FunnelHelper' ) ) {
        foreach ( $sequences as &$seq ) {
            if ( isset( $seq['settings'] )   && is_array( $seq['settings'] ) )   $seq['settings']   = wp_json_encode( $seq['settings'] );
            if ( isset( $seq['conditions'] ) && is_array( $seq['conditions'] ) ) $seq['conditions'] = wp_json_encode( $seq['conditions'] );
        }
        unset( $seq );
        try {
            foreach ( $sequences as $seq ) {
                FluentCrm\App\Services\Funnel\FunnelHelper::saveFunnelSequence( $funnel_id, $seq );
            }
            return [ 'success' => true, 'funnel_id' => $funnel_id, 'strategy' => 'FunnelHelper' ];
        } catch ( Throwable $e ) {
            return new WP_Error( 'helper_error', $e->getMessage(), [ 'status' => 500 ] );
        }
    }

    return new WP_Error( 'no_method', 'Sin metodo disponible', [ 'status' => 500 ] );
}

// ============================================================
// SWAP CONTACT TAGS
// ============================================================
function mb_bridge_swap_contact_tags( WP_REST_Request $request ) {
    $params        = $request->get_json_params();
    $contact_ids   = array_map( 'intval', $params['contact_ids']   ?? [] );
    $remove_tag_id = intval( $params['remove_tag_id'] ?? 0 );
    $add_tag_id    = intval( $params['add_tag_id']    ?? 0 );

    if ( empty( $contact_ids ) || ( ! $remove_tag_id && ! $add_tag_id ) ) {
        return new WP_Error( 'invalid', 'contact_ids y al menos un tag requeridos', [ 'status' => 400 ] );
    }

    $contact_ids = array_slice( $contact_ids, 0, 50 );

    $cls = 'FluentCrm\\App\\Models\\Subscriber';
    if ( ! class_exists( $cls ) ) {
        return new WP_Error( 'no_model', 'Modelo Subscriber no disponible', [ 'status' => 500 ] );
    }

    $updated = 0;
    foreach ( $contact_ids as $id ) {
        if ( ! $id ) continue;
        try {
            $sub = $cls::find( $id );
            if ( ! $sub ) continue;
            if ( $add_tag_id )    $sub->attachTags( [ $add_tag_id ] );
            if ( $remove_tag_id ) $sub->detachTags( [ $remove_tag_id ] );
            $updated++;
        } catch ( Exception $e ) {}
    }

    return [ 'success' => true, 'updated' => $updated ];
}

// ============================================================
// CONTACTS BY TAG
// ============================================================
function mb_bridge_contacts_by_tag( WP_REST_Request $request ) {
    global $wpdb;
    $params = $request->get_json_params();
    $tag_id = intval( $params['tag_id'] ?? 0 );
    if ( ! $tag_id ) {
        return new WP_Error( 'invalid', 'tag_id requerido', [ 'status' => 400 ] );
    }
    $ids = $wpdb->get_col( $wpdb->prepare(
        "SELECT subscriber_id FROM {$wpdb->prefix}fc_subscriber_pivot WHERE object_id = %d AND object_type = %s",
        $tag_id,
        'FluentCrm\\App\\Models\\Tag'
    ) );
    return [ 'success' => true, 'total' => count( $ids ), 'ids' => array_map( 'intval', $ids ) ];
}
