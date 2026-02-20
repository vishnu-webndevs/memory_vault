<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class AgentApiKeyMiddleware
{
    public function handle(Request $request, Closure $next)
    {
        $agentKey = config('services.agent_time_api_key');
        $authHeader = $request->header('Authorization');

        if (app()->environment('local')) {
            if ($request->user()) {
                return $next($request);
            }

            if ($authHeader && preg_match('/Bearer\s+(.*)/i', $authHeader)) {
                return $next($request);
            }
        }

        // If no agent key defined, fail securely
        if (! $agentKey) {
            return response()->json([
                'error' => 'AGENT_TIME_API_KEY not configured on server',
            ], 500);
        }

        // Allow request if Sanctum authentication succeeded
        if ($request->user()) {
            return $next($request);
        }

        // If request includes Bearer token, validate
        if ($authHeader && preg_match('/Bearer\s+(.*)/i', $authHeader, $matches)) {
            $provided = trim($matches[1]);
            
            Log::info('AgentAuth Check', [
                'provided_sub' => substr($provided, 0, 10) . '...',
                'expected_sub' => substr($agentKey, 0, 10) . '...',
                'match' => $provided === $agentKey
            ]);

            if ($provided === $agentKey) {
                return $next($request);
            }
        } else {
            Log::info('AgentAuth Header Missing or Invalid', ['header' => $authHeader]);
        }

        return response()->json([
            'error' => 'Unauthorized: Invalid or missing AGENT_TIME_API_KEY',
        ], 401);
    }
}
