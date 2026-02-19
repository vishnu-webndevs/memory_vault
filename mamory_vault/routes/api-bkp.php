<?php

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

// Stateless API routes (no CSRF), prefixed with /api
Route::middleware('auth:sanctum')->group(function () {
    Route::get('/memories', [MemoryController::class, 'index']);
    Route::post('/memories', [MemoryController::class, 'store']);
    Route::get('/memories/{memory}', [MemoryController::class, 'show']);
    Route::put('/memories/{memory}', [MemoryController::class, 'update']);
    Route::delete('/memories/{memory}', [MemoryController::class, 'destroy']);
});

// Phase-1 spec: routes under /api/memory with filter endpoint
Route::middleware('auth:sanctum')->prefix('memory')->group(function () {
    Route::get('/', [ApiMemoryController::class, 'index']);
    Route::get('/filter', [ApiMemoryController::class, 'filter']);
    Route::post('/', [ApiMemoryController::class, 'store']);
    Route::get('/{id}', [ApiMemoryController::class, 'show']);
    Route::put('/{id}', [ApiMemoryController::class, 'update']);
    Route::delete('/{id}', [ApiMemoryController::class, 'destroy']);
});

Route::middleware('auth:sanctum')->prefix('time')->group(function () {
    Route::get('/server', [TimeController::class, 'server']);
    Route::get('/local', [TimeController::class, 'local']);
    Route::get('/drift', [TimeController::class, 'drift']);
    Route::get('/session', [TimeController::class, 'session']);
    Route::get('/last-interaction', [TimeController::class, 'lastInteraction']);
    Route::get('/status', [TimeController::class, 'status']);
});

Route::middleware('auth:sanctum')->get('/user', function (Request $request) {
    return response()->json($request->user());
});
