<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\TimeService;
use Carbon\Carbon;
use Illuminate\Support\Facades\Cache;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DriftSimulationTest extends TestCase
{
    public function test_delay_status_when_long_silence(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $service = app(TimeService::class);

        $past = Carbon::now('UTC')->subSeconds(TimeService::SILENCE_THRESHOLD + 10)->toIso8601String();
        Cache::put("time:last_interaction:{$user->id}", $past, Carbon::now()->addDays(30));

        $response = $this->getJson('/api/time/status');
        $response->assertOk();
        $response->assertJsonPath('vault_status', 'delay');
    }

    public function test_unexpected_state_when_desync_threshold_exceeded(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $past = Carbon::now('UTC')->subSeconds(TimeService::DESYNC_THRESHOLD + 10)->toIso8601String();
        Cache::put("time:last_interaction:{$user->id}", $past, Carbon::now()->addDays(30));

        $response = $this->getJson('/api/time/status');
        $response->assertOk();
        $response->assertJsonPath('vault_status', 'unexpected_state');
    }
}
