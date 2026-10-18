<?php

/**
 * After the CS2 mount is attached, reinstall pool servers whose slot volume
 * is missing the game binary (install raced before /cs2-base was mounted).
 *
 * Env: PANEL_DIR, EGG_ID, MOUNT_ID (optional), SERVER_PREFIX (default cybergau-),
 *      VOLUMES_DIR (default /var/lib/pterodactyl/volumes),
 *      FORCE_POOL_REINSTALL=1 to reinstall every matching server.
 */
putenv('DATABASE_URL');
unset($_ENV['DATABASE_URL'], $_SERVER['DATABASE_URL']);

$panel = getenv('PANEL_DIR') ?: '/var/www/pterodactyl';
require $panel . '/vendor/autoload.php';
$app = require $panel . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

$eggId = (int) getenv('EGG_ID');
$mountId = (int) (getenv('MOUNT_ID') ?: 0);
$prefix = getenv('SERVER_PREFIX') ?: 'cybergau-';
$volumesDir = rtrim(getenv('VOLUMES_DIR') ?: '/var/lib/pterodactyl/volumes', '/');
$force = getenv('FORCE_POOL_REINSTALL') === '1';

if ($eggId < 1) {
    fwrite(STDERR, "EGG_ID required\n");
    exit(1);
}

$egg = Pterodactyl\Models\Egg::query()->find($eggId);
if (!$egg) {
    fwrite(STDERR, "Egg {$eggId} not found\n");
    exit(1);
}
if (!str_contains((string) $egg->script_install, 'cp -al') || !str_contains((string) $egg->script_install, '/cs2-base')) {
    fwrite(STDERR, "Egg {$eggId} install script is not the shared-base hardlink script\n");
    exit(1);
}

$mount = null;
if ($mountId > 0) {
    $mount = Pterodactyl\Models\Mount::query()->find($mountId);
}

/** @var \Pterodactyl\Services\Servers\ReinstallServerService $reinstall */
$reinstall = $app->make(Pterodactyl\Services\Servers\ReinstallServerService::class);

$servers = Pterodactyl\Models\Server::query()
    ->where('name', 'like', $prefix . '%')
    ->orderBy('id')
    ->get();

$ids = [];
foreach ($servers as $server) {
    if ((int) $server->egg_id !== $eggId) {
        $server->egg_id = $eggId;
        $server->nest_id = $egg->nest_id;
        $server->save();
    }
    if ($mount) {
        $mount->servers()->syncWithoutDetaching([$server->id]);
    }

    $bin = $volumesDir . '/' . $server->uuid . '/game/bin/linuxsteamrt64/cs2';
    $hasGame = is_executable($bin) || is_file($bin);
    if (!$force && $hasGame) {
        echo "ok server_id={$server->id} name={$server->name} has_cs2=1\n";
        continue;
    }

    $reinstall->handle($server);
    $ids[] = $server->id;
    echo "reinstall server_id={$server->id} name={$server->name} reason=" . ($force ? 'force' : 'missing_cs2') . "\n";
}

echo 'reinstall_count=' . count($ids), PHP_EOL;
