<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS) Configuration
    |--------------------------------------------------------------------------
    |
    | Configure your settings to customize the CORS behavior for your application.
    | Origins, methods, and headers can be adjusted based on environment values.
    |
    */
    'paths' => [
        'api/*',
        'sanctum/csrf-cookie',
    ],

    'allowed_methods' => ['*'],

    // Comma-separated list of origins in env, e.g.:
    // CORS_ALLOWED_ORIGINS="https://midnightswitchboard.net,http://localhost:3000"
    'allowed_origins' => explode(',', env('CORS_ALLOWED_ORIGINS', 'http://localhost:3000,https://midnightswitchboard.net')),

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => ['Authorization'],

    'max_age' => 0,

    'supports_credentials' => true,
];
