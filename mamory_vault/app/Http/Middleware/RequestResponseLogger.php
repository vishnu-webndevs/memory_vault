<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class RequestResponseLogger
{
    public function handle(Request $request, Closure $next)
    {
        $start = microtime(true);

        $requestData = [
            'time' => now()->toISOString(),
            'ip' => $request->ip(),
            'method' => $request->method(),
            'path' => $request->path(),
            'full_url' => $request->fullUrl(),
            'headers' => [
                'accept' => $request->header('Accept'),
                'content_type' => $request->header('Content-Type'),
                'authorization_present' => $request->hasHeader('Authorization'),
            ],
            'query' => $request->query(),
            'body' => $this->safeBody($request),
        ];

        $response = $next($request);

        $durationMs = (int) ((microtime(true) - $start) * 1000);
        $contentType = $response->headers->get('Content-Type');
        $omitBody = $this->shouldOmitResponseBody($contentType);
        $responseBody = $omitBody ? null : $this->safeResponseBody($response, $contentType);

        $responseData = [
            'status' => $response->getStatusCode(),
            'content_type' => $contentType,
            'duration_ms' => $durationMs,
            'body' => $responseBody,
            'body_omitted' => $omitBody,
        ];

        $payload = [
            'request' => $requestData,
            'response' => $responseData,
        ];
        $json = json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
        if (env('LOG_AGENT_REQUESTS', false)) {
            Log::channel('server_requests')->info($json);
        }

        return $response;
    }

    private function safeBody(Request $request): array|string|null
    {
        // Attempt JSON; fall back to raw string for small bodies; omit large or binary
        if (str_contains($request->header('Content-Type', ''), 'application/json')) {
            return $request->json()->all();
        }
        $raw = $request->getContent();
        if ($raw === '' || $raw === null) {
            return null;
        }

        // Truncate to avoid huge logs
        return mb_strimwidth($raw, 0, 1000, '...');
    }

    private function safeResponseBody($response, ?string $contentType): array|string|null
    {
        $content = method_exists($response, 'getContent') ? $response->getContent() : null;
        if (! $content) {
            return null;
        }
        if ($contentType && (str_contains($contentType, 'text/html') || str_starts_with($contentType, 'text/'))) {
            return null;
        }
        if ($contentType && str_contains($contentType, 'application/json')) {
            // Decode safely; if fails, return truncated string
            $decoded = json_decode($content, true);
            if (json_last_error() === JSON_ERROR_NONE) {
                return $decoded;
            }
        }

        return mb_strimwidth((string) $content, 0, 1000, '...');
    }

    private function shouldOmitResponseBody(?string $contentType): bool
    {
        if (! $contentType) {
            return false;
        }
        if (str_contains($contentType, 'text/html')) {
            return true;
        }
        if (str_starts_with($contentType, 'text/')) {
            return true;
        }

        return false;
    }
}
