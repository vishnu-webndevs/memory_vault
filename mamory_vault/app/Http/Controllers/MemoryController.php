<?php

namespace App\Http\Controllers;

use App\Models\Memory;
use Illuminate\Http\Request;

class MemoryController extends Controller
{
    public function index(Request $request)
    {
        $query = Memory::query();

        if ($request->filled('source')) {
            $query->where('source', $request->string('source'));
        }

        if ($request->filled('context_tag')) {
            $query->where('context_tag', $request->string('context_tag'));
        }

        if ($request->filled('immutable')) {
            $query->where('immutable', filter_var($request->input('immutable'), FILTER_VALIDATE_BOOLEAN));
        }

        if ($request->filled('from')) {
            $query->where('timestamp', '>=', $request->date('from'));
        }

        if ($request->filled('to')) {
            $query->where('timestamp', '<=', $request->date('to'));
        }

        $memories = $query->orderByDesc('timestamp')->paginate(20);

        return response()->json($memories);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'content' => ['required', 'string'],
            'source' => ['required', 'string', 'max:255'],
            'context_tag' => ['required', 'string', 'max:255'],
            'immutable' => ['sometimes', 'boolean'],
            'timestamp' => ['sometimes', 'date'],
        ]);

        $memory = Memory::create($validated);

        return response()->json($memory, 201);
    }

    public function show(Memory $memory)
    {
        return response()->json($memory);
    }

    public function update(Request $request, Memory $memory)
    {
        $validated = $request->validate([
            'content' => ['sometimes', 'string'],
            'source' => ['sometimes', 'string', 'max:255'],
            'context_tag' => ['sometimes', 'string', 'max:255'],
            'immutable' => ['sometimes', 'boolean'],
            'timestamp' => ['sometimes', 'date'],
        ]);

        $memory->update($validated);

        return response()->json($memory);
    }

    public function destroy(Memory $memory)
    {
        $memory->delete();

        return response()->noContent();
    }
}
