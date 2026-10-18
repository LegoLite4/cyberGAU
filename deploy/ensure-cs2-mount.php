<?php

/**
 * Shared CS2 base mount for egg install/run containers.
 * Host: /var/lib/cybergau/cs2-base → container: /cs2-base
 */
putenv('DATABASE_URL');
unset($_ENV['DATABASE_URL'], $_SERVER['DATABASE_URL']);

$panel = getenv('PANEL_DIR') ?: '/var/www/pterodactyl';
require $panel . '/vendor/autoload.php';
$app = require $panel . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

$eggId = (int) getenv('EGG_ID');
$nodeId = (int) getenv('NODE_ID');
$source = getenv('CS2_BASE_DIR') ?: '/var/lib/cybergau/cs2-base';
$target = getenv('CS2_MOUNT_TARGET') ?: '/cs2-base';

if ($eggId < 1 || $nodeId < 1) {
    fwrite(STDERR, "EGG_ID and NODE_ID are required\n");
    exit(1);
}

if (!is_dir($source)) {
    fwrite(STDERR, "CS2 base missing: {$source}\n");
    exit(1);
}

/** @var \Pterodactyl\Models\Mount|null $mount */
$mount = Pterodactyl\Models\Mount::query()->where('source', $source)->first();
if (!$mount) {
    $mount = new Pterodactyl\Models\Mount();
    $mount->forceFill([
        'uuid' => (string) Ramsey\Uuid\Uuid::uuid4(),
        'name' => 'cyberGAU CS2 base',
        'description' => 'Shared Counter-Strike 2 game files for the lobby pool',
        'source' => $source,
        'target' => $target,
        'read_only' => true,
        'user_mountable' => false,
    ]);
    $mount->save();
} else {
    $mount->forceFill([
        'name' => 'cyberGAU CS2 base',
        'description' => 'Shared Counter-Strike 2 game files for the lobby pool',
        'target' => $target,
        'read_only' => true,
        'user_mountable' => false,
    ])->save();
}

$mount->eggs()->syncWithoutDetaching([$eggId]);
$mount->nodes()->syncWithoutDetaching([$nodeId]);

// Attach to existing pool servers on this egg so reinstall/start sees /cs2-base.
$serverIds = Pterodactyl\Models\Server::query()
    ->where('egg_id', $eggId)
    ->pluck('id')
    ->all();
foreach ($serverIds as $serverId) {
    $mount->servers()->syncWithoutDetaching([$serverId]);
}

echo $mount->id, PHP_EOL;
