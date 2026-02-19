<?php

use App\Http\Controllers\AgentResponseController;
use App\Http\Controllers\Api\MemoryController as ApiMemoryController;
use App\Http\Controllers\MemoryController;
use App\Http\Controllers\TimeController;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Validator;

Route::get('/health', function () {
    return response()->json(['status' => 'ok']);
});

Route::post('/token', function (Request $request) {
    $validated = Validator::validate($request->all(), [
        'email' => ['required', 'email'],
        'password' => ['required', 'string'],
        'device_name' => ['sometimes', 'string'],
    ]);

    $user = User::where('email', $validated['email'])->first();

    if (! $user || ! Hash::check($validated['password'], $user->password)) {
        return response()->json(['message' => 'Invalid credentials'], 401);
    }

    $token = $user->createToken($validated['device_name'] ?? 'api')->plainTextToken;

    return response()->json(['token' => $token]);
});

Route::middleware(['agent.key'])->prefix('agent-memory')->group(function () {
    Route::get('/', [ApiMemoryController::class, 'index']);
    Route::post('/', [ApiMemoryController::class, 'store']);
    Route::post('/store', [ApiMemoryController::class, 'store']);
    Route::get('/fetch', [ApiMemoryController::class, 'fetch']);
});

// Stateless API routes (no CSRF), prefixed with /api
Route::middleware('auth:sanctum')->group(function () {
    Route::get('/memories', [MemoryController::class, 'index']);
    Route::post('/memories', [MemoryController::class, 'store']);
    Route::get('/memories/{memory}', [MemoryController::class, 'show']);
    Route::put('/memories/{memory}', [MemoryController::class, 'update']);
    Route::delete('/memories/{memory}', [MemoryController::class, 'destroy']);
    Route::get('/agent/test-time-awareness', [TimeController::class, 'testAgentTime']);
    Route::get('/agent/run-live-demo', [TimeController::class, 'agentLiveDemo']);
});

// Phase-1 spec: routes under /api/memory with filter endpoint
Route::middleware('auth:sanctum')->prefix('memory')->group(function () {
    Route::get('/', [ApiMemoryController::class, 'index']);
    Route::get('/filter', [ApiMemoryController::class, 'filter']);
    Route::get('/fetch', [ApiMemoryController::class, 'fetch']);
    Route::post('/', [ApiMemoryController::class, 'store']);
    Route::post('/store', [ApiMemoryController::class, 'store']);
    Route::get('/{id}', [ApiMemoryController::class, 'show']);
    Route::put('/{id}', [ApiMemoryController::class, 'update']);
    Route::delete('/{id}', [ApiMemoryController::class, 'destroy']);
});

Route::middleware(['agent.key'])->prefix('time')->group(function () {
    Route::get('/server', [TimeController::class, 'server']);
    Route::get('/local', [TimeController::class, 'local']);
    Route::get('/drift', [TimeController::class, 'drift']);
    Route::get('/session', [TimeController::class, 'session']);
    Route::get('/last-interaction', [TimeController::class, 'lastInteraction']);
    Route::get('/status', [TimeController::class, 'status']);
    Route::post('/simulate/silence', [TimeController::class, 'simulateSilence']);
    Route::post('/simulate/backend-restart', [TimeController::class, 'simulateBackendRestart']);
    Route::post('/simulate/thread-restart', [TimeController::class, 'simulateThreadRestart']);
    Route::get('/simulate/load-session', [TimeController::class, 'loadTestSession']);
    Route::post('/simulate/time-conversion', [TimeController::class, 'simulateTimeConversion']);
});
Route::middleware(['agent.key'])->get('/thread/marker', [TimeController::class, 'threadMarker']);
Route::middleware('agent.key')->post('/agent/response', [AgentResponseController::class, 'store']);
// PATCH COMPLETE — Phase 3 now secured with AGENT_TIME_API_KEY. Phase 1 & 2 authentication untouched.

Route::middleware('auth:sanctum')->get('/user', function (Request $request) {
    return response()->json($request->user());
});
