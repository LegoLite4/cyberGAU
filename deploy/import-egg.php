<?php

require __DIR__ . '/vendor/autoload.php';
$app = require __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

$nestId = (int) getenv('NEST_ID');
$path = getenv('EGG_PATH');
if ($nestId < 1 || !$path || !is_file($path)) {
    fwrite(STDERR, "NEST_ID and EGG_PATH are required\n");
    exit(1);
}

$file = new Illuminate\Http\UploadedFile($path, 'counter-strike-2.json', 'application/json', UPLOAD_ERR_OK, true);
$importer = $app->make(Pterodactyl\Services\Eggs\Sharing\EggImporterService::class);
$egg = $importer->handle($file, $nestId);
echo $egg->id, PHP_EOL;
