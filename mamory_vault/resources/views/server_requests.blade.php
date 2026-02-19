<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Server Requests Log</title>
    <style>
        body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; padding: 20px; }
        pre { background: #f7f7f7; border: 1px solid #e5e7eb; padding: 16px; border-radius: 8px; white-space: pre-wrap; word-wrap: break-word; }
        .meta { color: #6b7280; font-size: 0.9em; margin-bottom: 10px; }
    </style>
</head>
<body>
    <h1>Server Requests Log</h1>
    <p class="meta">Path: {{ $path }} · Total lines: {{ $linesCount }} · Showing: {{ $shownCount }}</p>
    <p class="meta">Adjust lines via query: <code>?lines=200</code></p>
    <pre>@foreach($entries as $entry){{ $entry }}

@endforeach</pre>
</body>
</html>