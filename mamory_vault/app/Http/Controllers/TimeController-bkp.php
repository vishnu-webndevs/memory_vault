<?php

namespace App\Http\Controllers;

use App\Services\TimeService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

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

        return response()->json($this->service->localTimePayload($tz, Auth::user()));
    }

    public function drift(Request $request)
    {
        $userId = Auth::id();

        return response()->json($this->service->driftPayload($userId));
    }

    public function session(Request $request)
    {
        $userId = Auth::id();

        return response()->json($this->service->sessionPayload($userId));
    }

    public function lastInteraction(Request $request)
    {
        $userId = Auth::id();
        $this->service->touchLastInteraction($userId);

        return response()->json($this->service->getLastInteraction($userId));
    }

    public function status(Request $request)
    {
        $userId = Auth::id();
        $tz = $request->query('tz');

        return response()->json($this->service->statusPayload($userId, $tz, Auth::user()));
    }
}
