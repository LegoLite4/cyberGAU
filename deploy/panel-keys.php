<?php

require __DIR__ . '/vendor/autoload.php';
$app = require __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use Illuminate\Support\Str;
use Pterodactyl\Models\ApiKey;
use Pterodactyl\Models\User;

$user = User::query()->where('root_admin', true)->first();
if (!$user) {
    fwrite(STDERR, "admin user missing\n");
    exit(1);
}

function issueKey(User $user, int $type, string $memo): string
{
    $identifier = ApiKey::generateTokenIdentifier($type);
    $token = Str::random(ApiKey::KEY_LENGTH);
    $key = new ApiKey();
    $key->forceFill([
        'user_id' => $user->id,
        'key_type' => $type,
        'identifier' => $identifier,
        'token' => encrypt($token),
        'memo' => $memo,
        'allowed_ips' => [],
        'r_servers' => 3,
        'r_nodes' => 3,
        'r_allocations' => 3,
        'r_users' => 3,
        'r_locations' => 3,
        'r_nests' => 3,
        'r_eggs' => 3,
        'r_database_hosts' => 3,
        'r_server_databases' => 3,
    ]);
    $key->save();
    return $identifier . $token;
}

echo 'APP=' . issueKey($user, ApiKey::TYPE_APPLICATION, 'cybergau-app') . PHP_EOL;
echo 'CLIENT=' . issueKey($user, ApiKey::TYPE_ACCOUNT, 'cybergau-client') . PHP_EOL;
