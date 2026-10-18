<?php

/**
 * Application API no longer allows POST /api/application/nests (405).
 * Create or reuse a nest via NestCreationService for the CS2 egg import.
 */
// cyberGAU env exports DATABASE_URL for Postgres — unset so Panel uses MariaDB.
putenv('DATABASE_URL');
unset($_ENV['DATABASE_URL'], $_SERVER['DATABASE_URL']);

$panel = getenv('PANEL_DIR') ?: '/var/www/pterodactyl';
require $panel . '/vendor/autoload.php';
$app = require $panel . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

$name = getenv('NEST_NAME') ?: 'cyberGAU';
$description = getenv('NEST_DESCRIPTION') ?: 'CS2 pool';
$author = getenv('NEST_AUTHOR') ?: (getenv('ADMIN_EMAIL') ?: 'admin@cybergau.local');

$nest = Pterodactyl\Models\Nest::query()->where('name', $name)->first();
if (!$nest) {
    /** @var Pterodactyl\Services\Nests\NestCreationService $creator */
    $creator = $app->make(Pterodactyl\Services\Nests\NestCreationService::class);
    $nest = $creator->handle(
        ['name' => $name, 'description' => $description],
        $author
    );
}

echo $nest->id, PHP_EOL;
