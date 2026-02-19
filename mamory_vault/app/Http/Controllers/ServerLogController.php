<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

class ServerLogController extends Controller
{
    public function show(Request $request)
    {
        $path = storage_path('logs/Server-requests.log');
        $linesToShow = (int) $request->get('lines', 50);
        $linesToShow = max(1, min(1000, $linesToShow));

        $entries = [];
        $rawLinesCount = 0;
        if (file_exists($path)) {
            $lines = @file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];
            $rawLinesCount = count($lines);
            $slice = array_slice($lines, -$linesToShow);

            foreach ($slice as $line) {
                $pretty = $this->prettyFromLogLine($line);
                $entries[] = $pretty ?? $line;
            }
        } else {
            $entries[] = "No log file found at: {$path}";
        }

        return view('server_requests', [
            'entries' => $entries,
            'path' => $path,
            'linesCount' => $rawLinesCount,
            'shownCount' => count($entries),
        ]);
    }

    private function prettyFromLogLine(string $line): ?string
    {
        // First try: line is pure JSON
        $decoded = json_decode($line, true);
        if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
            // Render in print_r style
            return print_r($decoded, true);
        }

        // Fallback: old format with prefix, extract JSON substring
        $marker = 'Server request ';
        $pos = strpos($line, $marker);
        if ($pos !== false) {
            $jsonStart = strpos($line, '{', $pos + strlen($marker));
            if ($jsonStart !== false) {
                $json = substr($line, $jsonStart);
                $decoded = json_decode($json, true);
                if (json_last_error() === JSON_ERROR_NONE) {
                    // Render in print_r style
                    return print_r($decoded, true);
                }
            }
        }

        return null;
    }
}
