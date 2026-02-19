<?php

// Simple script to ensure a user-owned schema exists in PostgreSQL.

require __DIR__.'/../vendor/autoload.php';

// Load .env so we can read DB settings in a standalone script
Dotenv\Dotenv::createImmutable(__DIR__.'/..')->safeLoad();

// Prefer env vars loaded from .env
$env = fn ($key, $default = null) => $_ENV[$key] ?? getenv($key) ?? $default;

$host = $env('DB_HOST', '127.0.0.1');
$port = $env('DB_PORT', '5432');
$db = $env('DB_DATABASE', 'postgres');
$user = $env('DB_USERNAME', 'postgres');
$pass = $env('DB_PASSWORD', '');
$sslmode = $env('DB_SSLMODE', 'prefer');
$schema = $env('DB_SCHEMA', 'public');

$dsn = sprintf('pgsql:host=%s;port=%s;dbname=%s;sslmode=%s', $host, $port, $db, $sslmode);

try {
    $pdo = new PDO($dsn, $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    ]);

    // Create the schema owned by the current user if it doesn't exist
    $sql = sprintf('CREATE SCHEMA IF NOT EXISTS "%s" AUTHORIZATION "%s";', $schema, $user);
    $pdo->exec($sql);
    echo "Schema '$schema' is ready.\n";
} catch (Throwable $e) {
    fwrite(STDERR, 'Failed to create schema: '.$e->getMessage()."\n");
    exit(1);
}
