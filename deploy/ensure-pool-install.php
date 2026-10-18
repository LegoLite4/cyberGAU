<?php

/**
 * Attach CS2 mount, hardlink shared base into empty pool volumes on the host,
 * and trigger Wings reinstall only so the egg wait-script can observe the binary.
 *
 * Env: PANEL_DIR, EGG_ID, MOUNT_ID (optional), SERVER_PREFIX (default cybergau-),
 *      VOLUMES_DIR, CS2_BASE_DIR, LINK_SCRIPT, FORCE_POOL_REINSTALL=1,
 *      SKIN_API_BASE, SKIN_PLUGIN_URL, SKIP_WINGS_REINSTALL=1
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
$baseDir = getenv('CS2_BASE_DIR') ?: '/var/lib/cybergau/cs2-base';
$linkScript = getenv('LINK_SCRIPT') ?: '/opt/cybergau/deploy/link-cs2-slot.sh';
$force = getenv('FORCE_POOL_REINSTALL') === '1';
// Host linker fills the volume; Wings reinstall is unnecessary unless explicitly requested.
$skipReinstall = getenv('SKIP_WINGS_REINSTALL') !== '0';
$skinApi = getenv('SKIN_API_BASE') ?: '';
$skinPlugin = getenv('SKIN_PLUGIN_URL') ?: '';

if ($eggId < 1) {
    fwrite(STDERR, "EGG_ID required\n");
    exit(1);
}
if (!is_executable($linkScript) && !is_file($linkScript)) {
    fwrite(STDERR, "link script missing: {$linkScript}\n");
    exit(1);
}
if (!is_executable($baseDir . '/game/bin/linuxsteamrt64/cs2')) {
    fwrite(STDERR, "CS2 base missing binary under {$baseDir}\n");
    exit(1);
}

$egg = Pterodactyl\Models\Egg::query()->find($eggId);
if (!$egg) {
    fwrite(STDERR, "Egg {$eggId} not found\n");
    exit(1);
}

$mount = null;
if ($mountId > 0) {
    $mount = Pterodactyl\Models\Mount::query()->find($mountId);
}

/** @var \Pterodactyl\Services\Servers\ReinstallServerService $reinstall */
$reinstall = $app->make(Pterodactyl\Services\Servers\ReinstallServerService::class);

// Wings du() counts hardlinks at full size — keep disk limit above apparent base size.
$baseBytes = 0;
$duOut = [];
$duCode = 0;
exec('du -sb ' . escapeshellarg($baseDir) . ' 2>/dev/null', $duOut, $duCode);
if ($duCode === 0 && !empty($duOut[0]) && preg_match('/^(\d+)/', $duOut[0], $m)) {
    $baseBytes = (int) $m[1];
}
$minDiskMb = $baseBytes > 0 ? (int) ($baseBytes / 1024 / 1024) + 4096 : 73728;

$servers = Pterodactyl\Models\Server::query()
    ->where('name', 'like', $prefix . '%')
    ->orderBy('id')
    ->get();

$linked = 0;
foreach ($servers as $server) {
    $dirty = false;
    if ((int) $server->egg_id !== $eggId) {
        $server->egg_id = $eggId;
        $server->nest_id = $egg->nest_id;
        $dirty = true;
    }
    if ((int) $server->disk < $minDiskMb) {
        $server->disk = $minDiskMb;
        $dirty = true;
        echo "disk_limit server_id={$server->id} disk={$minDiskMb}\n";
    }
    if ($dirty) {
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

    $cmd = 'CS2_BASE_DIR=' . escapeshellarg($baseDir)
        . ' VOLUMES_DIR=' . escapeshellarg($volumesDir);
    if ($skinApi !== '') {
        $cmd .= ' SKIN_API_BASE=' . escapeshellarg($skinApi);
    }
    if ($skinPlugin !== '') {
        $cmd .= ' SKIN_PLUGIN_URL=' . escapeshellarg($skinPlugin);
    }
    $cmd .= ' bash ' . escapeshellarg($linkScript) . ' ' . escapeshellarg($server->uuid);
    passthru($cmd, $code);
    if ($code !== 0) {
        fwrite(STDERR, "link failed for {$server->name} ({$server->uuid}) exit={$code}\n");
        exit($code > 0 ? $code : 1);
    }
    $linked++;
    echo "linked server_id={$server->id} name={$server->name} uuid={$server->uuid}\n";

    // Optional: nudge Wings install wait-loop if a reinstall is already pending.
    if (!$skipReinstall && !$hasGame) {
        try {
            $reinstall->handle($server);
            echo "reinstall_queued server_id={$server->id}\n";
        } catch (Throwable $e) {
            echo "reinstall_skip server_id={$server->id} err=" . $e->getMessage() . "\n";
        }
    }
}

echo "link_count={$linked}\n";
