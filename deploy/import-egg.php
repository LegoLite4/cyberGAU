<?php

// cyberGAU env exports DATABASE_URL for Postgres — unset so Panel uses MariaDB.
putenv('DATABASE_URL');
unset($_ENV['DATABASE_URL'], $_SERVER['DATABASE_URL']);

$panel = getenv('PANEL_DIR') ?: '/var/www/pterodactyl';
require $panel . '/vendor/autoload.php';
$app = require $panel . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

$nestId = (int) getenv('NEST_ID');
$path = getenv('EGG_PATH');
if ($nestId < 1 || !$path || !is_file($path)) {
    fwrite(STDERR, "NEST_ID and EGG_PATH are required\n");
    exit(1);
}

$payload = json_decode(file_get_contents($path), true);
if (!is_array($payload)) {
    fwrite(STDERR, "Egg JSON is invalid\n");
    exit(1);
}

$scriptFile = dirname($path) . '/cs2-install.sh';
if (is_file($scriptFile)) {
    $payload['scripts']['installation']['script'] = file_get_contents($scriptFile);
}

$existing = Pterodactyl\Models\Egg::query()
    ->where('nest_id', $nestId)
    ->where('name', $payload['name'])
    ->first();

if (!$existing) {
    $temp = tempnam(sys_get_temp_dir(), 'egg');
    file_put_contents($temp, json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    $file = new Illuminate\Http\UploadedFile($temp, 'counter-strike-2.json', 'application/json', UPLOAD_ERR_OK, true);
    $importer = $app->make(Pterodactyl\Services\Eggs\Sharing\EggImporterService::class);
    $existing = $importer->handle($file, $nestId);
    @unlink($temp);
    echo $existing->id, PHP_EOL;
    exit(0);
}

$install = $payload['scripts']['installation'];
$existing->forceFill([
    'author' => $payload['author'],
    'description' => $payload['description'],
    'features' => $payload['features'],
    'docker_images' => $payload['docker_images'],
    'file_denylist' => $payload['file_denylist'] ?: [],
    'startup' => $payload['startup'],
    'config_files' => $payload['config']['files'],
    'config_startup' => $payload['config']['startup'],
    'config_logs' => $payload['config']['logs'],
    'config_stop' => $payload['config']['stop'],
    'script_container' => $install['container'],
    'script_entry' => $install['entrypoint'],
    'script_install' => $install['script'],
    'script_is_privileged' => false,
])->save();

$seen = [];
foreach ($payload['variables'] as $variable) {
    $seen[] = $variable['env_variable'];
    Pterodactyl\Models\EggVariable::query()->updateOrCreate(
        ['egg_id' => $existing->id, 'env_variable' => $variable['env_variable']],
        [
            'name' => $variable['name'],
            'description' => $variable['description'],
            'default_value' => (string) $variable['default_value'],
            'user_viewable' => (bool) $variable['user_viewable'],
            'user_editable' => (bool) $variable['user_editable'],
            'rules' => $variable['rules'],
        ]
    );
}

echo $existing->id, PHP_EOL;
