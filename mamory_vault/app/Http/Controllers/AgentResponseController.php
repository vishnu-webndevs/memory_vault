<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class AgentResponseController extends Controller
{
    public function store(Request $request)
    {
        $validated = $request->validate([
            'run_id' => ['required', 'string'],
            'response' => ['required', 'array'],
            'meta' => ['sometimes', 'array'],
        ]);

        Log::channel('server_requests')->info(json_encode([
            'agent_response' => $validated,
        ], JSON_UNESCAPED_SLASHES));

        return response()->json(['status' => 'ok'], 201);
    }
}
