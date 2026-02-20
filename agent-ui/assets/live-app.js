const wsScheme = location.protocol === 'https:' ? 'wss' : 'ws';
const host = location.hostname || '127.0.0.1';
const pathWs = '/ws';
const apiBase = `${location.protocol}//${location.host}/api/`;
const CONFIG = { WS_URL: `${wsScheme}://${host}${pathWs}`, API_BASE: apiBase };
console.log("Live App Loaded v3.2 - Timezone Fix");
const chatEl = document.getElementById('chat');
const inputEl = document.getElementById('input');
const sendBtn = document.getElementById('sendBtn');
const serverTimeEl = document.getElementById('serverTime');
const threadMarkerEl = document.getElementById('threadMarker');
const restartDetectedEl = document.getElementById('restartDetected');
const driftMsEl = document.getElementById('driftMs');
const memoryStatusEl = document.getElementById('memoryStatus');
let ws = null;

// Generate unique session ID for this page load to ensure fresh thread
let sessionId = 'sess_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();

function appendBubble(text, role) {
    const d = document.createElement('div');
    d.className = `bubble ${role}`;
    d.textContent = text;
    chatEl.appendChild(d);
    chatEl.scrollTop = chatEl.scrollHeight;
}

function connect() {
    try { ws = new WebSocket(CONFIG.WS_URL); } catch (e) { setTimeout(connect, 1500); return; }
    ws.onopen = () => {
        console.log('WS Connected');
    };
    ws.onmessage = (evt) => {
        try {
            const data = JSON.parse(evt.data);
            if (data && data.type === 'memory_status') {
                if (memoryStatusEl) memoryStatusEl.textContent = `memory status: ${data.status}`;
                return;
            }
            if (typeof data.response === 'string') appendBubble(data.response, 'agent');
            if (data.server_time && serverTimeEl) serverTimeEl.textContent = data.server_time;
            if (typeof data.thread_marker === 'string' && threadMarkerEl) threadMarkerEl.textContent = data.thread_marker || sessionId;
            if (typeof data.restart_detected !== 'undefined' && restartDetectedEl) restartDetectedEl.textContent = String(data.restart_detected);
            if (typeof data.drift_ms !== 'undefined' && driftMsEl) driftMsEl.textContent = String(data.drift_ms);
            if (typeof data.memory_status === 'string' && memoryStatusEl) memoryStatusEl.textContent = `memory status: ${data.memory_status}`;
        } catch (e) {}
    };
    ws.onclose = () => { setTimeout(connect, 1500); };
}

function sendMessage() {
    const msg = inputEl.value.trim();
    if (!msg || !ws || ws.readyState !== 1) return;
    appendBubble(msg, 'user');
    
    // Get client timezone
    let userTz = 'UTC';
    let localTimeString = '';
    try {
        userTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        localTimeString = new Date().toString();
    } catch (e) {}

    ws.send(JSON.stringify({
        session_id: sessionId,
        message: msg,
        timezone: userTz,
        local_time_string: localTimeString
    }));
    inputEl.value = '';
}

sendBtn.addEventListener('click', sendMessage);
inputEl.addEventListener('keydown', e => { if (e.key === 'Enter') { sendMessage(); } });
connect();
