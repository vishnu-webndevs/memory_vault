<?php

use App\Http\Controllers\ServerLogController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

// Readable server request log view (pre-formatted)
Route::get('/server-requests', [ServerLogController::class, 'show']);
