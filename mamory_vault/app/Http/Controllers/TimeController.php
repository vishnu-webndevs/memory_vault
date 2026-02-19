<?php

namespace App\Http\Controllers;

use App\Services\AgentTimeService;
use App\Services\TimeService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;

class TimeController extends Controller
{
    public function __construct(private TimeService $service) {}

    public function server(Request $request)
    {
        return response()->json($this->service->serverTimePayload());
    }

    public function local(Request $request)
    {
        $tz = $request->query('tz');

        return response()->json($this->service->localTimePayload($tz, null));
    }

    public function drift(Request $request)
    {
        $userId = Auth::id() ?? 1;

        return response()->json($this->service->driftPayload($userId));
    }

    public function session(Request $request)
    {
        $userId = Auth::id() ?? 1;

        return response()->json($this->service->sessionPayload($userId));
    }

    public function lastInteraction(Request $request)
    {
        $userId = Auth::id() ?? 1;
        $this->service->touchLastInteraction($userId);

        return response()->json($this->service->getLastInteraction($userId));
    }

    public function status(Request $request)
    {
        $userId = Auth::id() ?? 1;
        $tz = $request->query('tz');

        return response()->json($this->service->statusPayload($userId, $tz, null));
    }

    public function simulateSilence(Request $request)
    {
        $userId = 1;
        $seconds = (int) $request->input('seconds', 300);
        app(\App\Services\TimeService::class)->setLastInteractionSecondsAgo($userId, $seconds);

        return response()->json([
            'simulated_silence_seconds' => $seconds,
            'message' => "Last interaction moved back by {$seconds} seconds.",
        ]);
    }

    public function simulateBackendRestart()
    {
        $data = app(\App\Services\TimeService::class)->rotateBootMarker();

        return response()->json([
            'restart_simulated' => true,
            'boot_marker' => $data,
        ]);
    }

    public function simulateThreadRestart()
    {
        $userId = 1;
        Cache::forget("time:session:{$userId}");
        Cache::forget("time:boot_seen:{$userId}");

        return response()->json([
            'thread_restart_simulated' => true,
        ]);
    }

    public function loadTestSession()
    {
        $userId = 1;
        $service = app(\App\Services\TimeService::class);
        $results = [];
        for ($i = 0; $i < 20; $i++) {
            $results[] = $service->sessionPayload($userId);
        }

        return response()->json([
            'calls' => 20,
            'results' => $results,
        ]);
    }

    public function simulateTimeConversion(Request $request)
    {
        $ts = $request->input('timestamp');
        $tz = $request->input('tz', 'UTC');
        if (! $ts) {
            return response()->json(['error' => 'timestamp required'], 422);
        }
        try {
            $carbon = Carbon::parse($ts)->setTimezone($tz);

            return response()->json([
                'input_timestamp' => $ts,
                'timezone' => $tz,
                'converted' => $carbon->toIso8601String(),
                'offset_seconds' => $carbon->getOffset(),
            ]);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 400);
        }
    }

    public function testAgentTime()
    {
        try {
            return response()->json(
                app(\App\Services\AgentTimeService::class)->getTimeStatus()
            );
        } catch (\Throwable $e) {
            $status = $e->getCode() ?: 500;
            $message = $e->getMessage() ?: 'Unable to connect to Time API';

            return response()->json(['error' => $message], $status);
        }
    }

    /**
     * Final Phase 3 Demo:
     * Calls the AgentTimeService to fetch live /api/time/status
     * using AGENT_TIME_API_KEY and returns it as JSON.
     */
    public function agentLiveDemo()
    {
        try {
            $result = app(AgentTimeService::class)->getTimeStatus();

            return response()->json($result, 200);
        } catch (\Throwable $e) {
            $status = $e->getCode() ?: 500;
            $message = $e->getMessage() ?: 'Unable to connect to Time API';

            return response()->json(['error' => $message], $status);
        }
    }

    public function threadMarker(Request $request)
    {
        $userId = Auth::id() ?? 1;
        $session = $this->service->sessionPayload($userId);

        return response()->json(['marker' => $session['thread_marker']]);
    }
}
