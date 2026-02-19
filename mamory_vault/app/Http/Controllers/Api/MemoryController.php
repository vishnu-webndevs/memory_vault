<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Memory;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class MemoryController extends Controller
{
    private function jsonSuccess($data = null, string $message = 'OK', int $status = 200)
    {
        return response()->json([
            'success' => true,
            'data' => $data,
            'message' => $message,
        ], $status);
    }

    private function jsonError(string $message, int $status)
    {
        return response()->json([
            'success' => false,
            'message' => $message,
        ], $status);
    }

    protected function ensureMutable(Memory $memory)
    {
        if ($memory->immutable) {
            abort(403, 'Immutable memory cannot be modified or deleted.');
        }
    }

    public function index(Request $request)
    {
        $query = Memory::query()->whereNull('deleted_at');

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

        $limit = (int) $request->get('limit', 20);
        $memories = $query->orderByDesc('timestamp')->limit($limit)->get();

        return $this->jsonSuccess($memories);
    }

    public function filter(Request $request)
    {
        // Alias to index with same filtering rules for clarity per spec
        return $this->index($request);
    }

    public function store(Request $request)
    {
        if ($request->has(['session_id', 'key', 'value'])) {
            $validated = $request->validate([
                'session_id' => ['required', 'string'],
                'key' => ['required', 'string', 'max:100'],
                'value' => ['required', 'string'],
                'ttl' => ['sometimes', 'integer', 'min:1'],
            ]);
            $ttl = (int) $request->get('ttl', 86400);
            $cacheKey = 'session_mem:'.$validated['session_id'].':'.$validated['key'];
            Cache::put($cacheKey, $validated['value'], $ttl);
            $indexKey = 'session_mem_index:'.$validated['session_id'];
            $index = Cache::get($indexKey, []);
            if (! in_array($validated['key'], $index, true)) {
                $index[] = $validated['key'];
            }
            Cache::put($indexKey, $index, $ttl);
            try {
                Memory::create([
                    'content' => json_encode([
                        'session_id' => $validated['session_id'],
                        'key' => $validated['key'],
                        'value' => $validated['value'],
                    ]),
                    'source' => 'kv',
                    'context_tag' => 'session',
                    'immutable' => false,
                ]);
            } catch (\Throwable $e) {
            }

            return $this->jsonSuccess(['stored' => true], 'Created', 201);
        }

        $validated = $request->validate([
            'content' => ['required', 'string'],
            'source' => ['nullable', 'string', 'max:50'],
            'context_tag' => ['nullable', 'string', 'max:50'],
            'immutable' => ['nullable', 'boolean'],
            'timestamp' => ['sometimes', 'date'],
        ]);

        $memory = Memory::create($validated);

        return $this->jsonSuccess($memory, 'Created', 201);
    }

    public function fetch(Request $request)
    {
        $validated = $request->validate([
            'session_id' => ['required', 'string'],
        ]);
        $sessionId = $validated['session_id'];
        $items = [];
        $indexKey = 'session_mem_index:'.$sessionId;
        $index = Cache::get($indexKey, []);
        foreach ($index as $k) {
            $v = Cache::get('session_mem:'.$sessionId.':'.$k);
            if (! is_null($v)) {
                $items[$k] = $v;
            }
        }
        if (empty($items)) {
            $rows = Memory::query()
                ->whereNull('deleted_at')
                ->where('source', 'kv')
                ->where('context_tag', 'session')
                ->orderByDesc('timestamp')
                ->limit(50)
                ->get();
            foreach ($rows as $row) {
                $c = json_decode($row->content, true);
                if (is_array($c) && ($c['session_id'] ?? null) === $sessionId) {
                    $k = $c['key'] ?? null;
                    $v = $c['value'] ?? null;
                    if ($k && ! is_null($v)) {
                        $items[$k] = $v;
                    }
                }
            }
        }

        return $this->jsonSuccess([
            'session_id' => $sessionId,
            'items' => $items,
            'count' => count($items),
        ]);
    }

    public function show($id)
    {
        $memory = Memory::query()->whereNull('deleted_at')->find($id);
        if (! $memory) {
            return $this->jsonError('Not found', 404);
        }

        return $this->jsonSuccess($memory);
    }

    public function update(Request $request, $id)
    {
        $memory = Memory::query()->find($id);
        if (! $memory || $memory->deleted_at) {
            return $this->jsonError('Not found', 404);
        }

        $this->ensureMutable($memory);

        $validated = $request->validate([
            'content' => ['sometimes', 'string'],
            'source' => ['sometimes', 'string', 'max:50'],
            'context_tag' => ['sometimes', 'string', 'max:50'],
            'immutable' => ['sometimes', 'boolean'],
            'timestamp' => ['sometimes', 'date'],
        ]);

        $memory->update($validated);

        return $this->jsonSuccess($memory, 'Updated');
    }

    public function destroy($id)
    {
        $memory = Memory::query()->find($id);
        if (! $memory || $memory->deleted_at) {
            return $this->jsonError('Not found', 404);
        }

        $this->ensureMutable($memory);

        $memory->delete();

        return response()->json(['success' => true, 'message' => 'Deleted'], 200);
    }
}
