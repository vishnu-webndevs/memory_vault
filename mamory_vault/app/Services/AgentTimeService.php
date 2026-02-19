<?php

namespace App\Services;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class AgentTimeService
{
    public function getTimeStatus(): array
    {
        $token = config('services.agent_time_api_key');
        Log::info('AgentTimeService: Internal request triggered');

        if (! $token) {
            Log::info('AgentTimeService: Missing API key');
            throw new \RuntimeException('AGENT_TIME_API_KEY missing');
        }

        try {
            $internal = Request::create(
                '/api/time/status',
                'GET',
                [],
                [],
                [],
                [
                    'HTTP_AUTHORIZATION' => 'Bearer '.$token,
                    'HTTP_ACCEPT' => 'application/json',
                    'HTTP_X_INTERNAL_AGENT_CALL' => '1',
                ]
            );

            $response = app()->handle($internal);
            $payload = json_decode($response->getContent(), true);

            Log::info('AgentTimeService: Internal request success', [
                'status' => $response->status(),
            ]);

            if ($response->status() !== 200) {
                throw new \RuntimeException('Internal Time API failure: '.$response->status());
            }

            // Attach identity-lock fields into agent payload
            return [
                'server_time' => $payload['server_time'] ?? null,
                'last_memory_write' => $payload['last_memory_write'] ?? null,
                'thread_marker' => $payload['thread_marker'] ?? null,
                'vault_status' => $payload['vault_status'] ?? null,
                'drift' => $payload['drift'] ?? null,
                'local' => $payload['local'] ?? null,

                'identity_lock' => [
                    'thread_marker' => $payload['thread_marker'] ?? null,
                    'session_continuity' => $payload['drift']['session_continuity'] ?? null,
                    'restart_detected' => $payload['drift']['restart_detected'] ?? null,
                    'vault_status' => $payload['vault_status'] ?? null,
                    'restart_info' => $payload['drift']['restart_info'] ?? null,
                ],
            ];
        } catch (\Throwable $e) {
            Log::info('AgentTimeService: Internal request failure', [
                'exception' => $e->getMessage(),
            ]);
            throw $e;
        }
    }
}
