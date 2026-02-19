<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\TimeService;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RestartSimulationTest extends TestCase
{
    public function test_restart_detection_after_boot_marker_rotation(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $service = app(TimeService::class);

        $service->touchLastInteraction($user->id);
        $initial = $service->driftPayload($user->id);
        $this->assertFalse($initial['restart_detected']);

        $service->rotateBootMarker();

        $drift = $service->driftPayload($user->id);
        $this->assertTrue($drift['restart_detected']);

        $response = $this->getJson('/api/time/drift');
        $response->assertOk();
        $response->assertJsonPath('restart_detected', true);

        $status = $this->getJson('/api/time/status');
        $status->assertOk();
        $status->assertJsonPath('restart_detected', true);

        $after = $this->getJson('/api/time/drift');
        $after->assertOk();
        $after->assertJsonPath('restart_detected', false);
    }
}
