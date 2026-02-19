<?php

namespace App\Services;

use Carbon\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class TimeService
{
    public const DEFAULT_TZ = 'America/New_York';

    public const SILENCE_THRESHOLD = 300;

    public const DESYNC_THRESHOLD = 3600;

    public function nowUtc(): Carbon
    {
        $this->ensureBootMarker();

        return Carbon::now('UTC');
    }

    public function normalizeTimezone(?string $tz, ?\App\Models\User $user = null): string
    {
        $candidate = $tz ?: ($user && $user->timezone ? $user->timezone : null);
        $candidate = $candidate ? trim($candidate) : null;
        if ($candidate && in_array($candidate, timezone_identifiers_list())) {
            return $candidate;
        }

        return static::DEFAULT_TZ;
    }

    public function serverTimePayload(): array
    {
        $now = $this->nowUtc();

        return [
            'server_time' => $now->toIso8601String(),
            'server_time_iso' => $now->toIso8601String(),
            'server_time_unix' => $now->timestamp,
            'server_time_offset_seconds' => 0,
        ];
    }

    public function localTimePayload(?string $tz, ?\App\Models\User $user = null): array
    {
        $timezone = $this->normalizeTimezone($tz, $user);
        $serverNow = $this->nowUtc();
        $now = $serverNow->copy()->setTimezone($timezone);

        return [
            'local_user_time' => $now->toIso8601String(),
            'local_time_iso' => $now->toIso8601String(),
            'local_time_unix' => $now->timestamp,
            'local_time_offset_seconds' => $now->getOffset(),
            'timezone' => $timezone,
        ];
    }

    public function sessionPayload(int $userId): array
    {
        $key = "time:session:$userId";
        $existing = Cache::get($key);
        if (! $existing) {
            $existing = [
                'thread_marker' => Str::uuid()->toString(),
                'created_at' => $this->nowUtc()->toIso8601String(),
            ];
            Cache::put($key, $existing, Carbon::now()->addDays(30));
        }
        $age = $existing['created_at'] ? Carbon::parse($existing['created_at'], 'UTC')->diffInSeconds($this->nowUtc()) : null;

        return [
            'thread_marker' => $existing['thread_marker'],
            'session_age_seconds' => $age,
        ];
    }

    public function touchLastInteraction(int $userId): void
    {
        $this->ensureBootMarker();
        $now = $this->nowUtc()->toIso8601String();
        $boot = $this->readBootMarker();
        $lastKey = "time:last_interaction:$userId";
        $bootSeenKey = "time:boot_seen:$userId";
        Cache::put($lastKey, $now, Carbon::now()->addDays(30));
        Log::info('TimeService::touchLastInteraction wrote last_interaction', [
            'userId' => $userId,
            'key' => "time:last_interaction:$userId",
            'value' => $now,
            'call_stack' => debug_backtrace(DEBUG_BACKTRACE_IGNORE_ARGS, 6),
        ]);
        Log::info('DEBUG: TimeService::touchLastInteraction wrote last_interaction', [
            'userId' => $userId,
            'key' => $lastKey,
            'value' => $now,
            'timestamp' => now()->toIso8601String(),
            'trace' => collect(debug_backtrace(DEBUG_BACKTRACE_IGNORE_ARGS, 6))->pluck('function'),
        ]);
        Cache::put($bootSeenKey, $boot['id'], Carbon::now()->addDays(30));
    }

    public function getLastInteraction(int $userId): array
    {
        $last = Cache::get("time:last_interaction:$userId");
        $seconds = null;
        if ($last) {
            $now = $this->nowUtc();
            $seconds = Carbon::parse($last, 'UTC')->diffInSeconds($now);
            $seconds = max(0, $seconds);
        }

        return [
            'last_interaction' => $last,
            'seconds_since_last_interaction' => $seconds,
        ];
    }

    public function detectRestart(int $userId): array
    {
        $current = $this->readBootMarker();
        $seen = Cache::get("time:boot_seen:$userId");
        $detected = $seen !== null && $seen !== $current['id'];
        Cache::put("time:boot_seen:$userId", $current['id'], Carbon::now()->addDays(30));

        return [
            'restart_detected' => $detected,
            'current_id' => $current['id'],
            'seen_id' => $seen,
            'boot_at' => $current['boot_at'],
        ];
    }

    public function driftPayload(int $userId): array
    {
        $last = $this->getLastInteraction($userId);
        $seconds = max(0, $last['seconds_since_last_interaction']);
        $silence = $seconds !== null ? $seconds >= static::SILENCE_THRESHOLD : true;
        $restart = $this->detectRestart($userId);
        $session = $this->sessionPayload($userId);
        $continuity = ($silence === false) && ($restart['restart_detected'] === false);

        return [
            'time_since_last_request_seconds' => $seconds,
            'long_silence' => $silence,
            'session_continuity' => $continuity,
            'restart_detected' => $restart['restart_detected'],
            'session' => $session,
            'restart_info' => $restart,
        ];
    }

    public function statusPayload(int $userId, ?string $tz, ?\App\Models\User $user = null): array
    {
        $server = $this->serverTimePayload();
        $drift = $this->driftPayload($userId);
        $lastWrite = Cache::get("time:last_write:$userId");
        $session = $this->sessionPayload($userId);

        $status = 'ok';
        if ($drift['restart_detected'] === true) {
            $status = 'restart';
        } elseif (($drift['time_since_last_request_seconds'] ?? null) !== null &&
                  $drift['time_since_last_request_seconds'] >= static::DESYNC_THRESHOLD) {
            $status = 'unexpected_state';
        } elseif ($drift['long_silence'] === true) {
            $status = 'delay';
        }

        $local = $this->localTimePayload($tz, $user);

        return [
            'server_time' => $server['server_time_iso'],
            'last_memory_write' => $lastWrite,
            'thread_marker' => $session['thread_marker'],
            'vault_status' => $status,
            'drift' => $drift,
            'local' => $local,
        ];
    }

    public function rotateBootMarker(): array
    {
        $path = storage_path('framework/boot_marker.json');
        $this->ensureBootMarker();
        $data = [
            'boot_at' => $this->nowUtc()->toIso8601String(),
            'id' => Str::uuid()->toString(),
        ];
        File::put($path, json_encode($data));

        return $data;
    }

    public function setLastInteractionSecondsAgo(int $userId, int $seconds): array
    {
        $target = $this->nowUtc()->subSeconds(max(0, $seconds))->toIso8601String();
        Cache::put("time:last_interaction:$userId", $target, Carbon::now()->addDays(30));
        Log::info('TimeService::setLastInteractionSecondsAgo set last_interaction (simulated)', [
            'userId' => $userId,
            'key' => "time:last_interaction:$userId",
            'value' => $target,
            'secondsAgo' => $seconds,
            'call_stack' => debug_backtrace(DEBUG_BACKTRACE_IGNORE_ARGS, 6),
        ]);
        Log::info('DEBUG: TimeService::setLastInteractionSecondsAgo wrote simulated last_interaction', [
            'userId' => $userId,
            'key' => "time:last_interaction:$userId",
            'value' => $target,
            'secondsAgo' => $seconds,
            'timestamp' => now()->toIso8601String(),
            'trace' => collect(debug_backtrace(DEBUG_BACKTRACE_IGNORE_ARGS, 6))->pluck('function'),
        ]);
        Cache::forget("time:last_write:$userId");

        return $this->getLastInteraction($userId);
    }

    protected function ensureBootMarker(): void
    {
        $path = storage_path('framework/boot_marker.json');
        if (! File::exists(dirname($path))) {
            File::makeDirectory(dirname($path), 0755, true);
        }
        if (! File::exists($path)) {
            $data = [
                'boot_at' => Carbon::now('UTC')->toIso8601String(),
                'id' => Str::uuid()->toString(),
            ];
            File::put($path, json_encode($data));
        }
    }

    protected function readBootMarker(): array
    {
        $this->ensureBootMarker();
        $path = storage_path('framework/boot_marker.json');
        $raw = File::get($path);
        $data = json_decode($raw, true) ?: [];
        $bootAt = $data['boot_at'] ?? ($data['boot_time'] ?? null);
        $id = $data['id'] ?? ($data['boot_id'] ?? null);

        return [
            'boot_at' => $bootAt,
            'id' => $id,
        ];
    }
}
