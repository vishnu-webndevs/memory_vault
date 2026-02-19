/**
 * Agent UI WebSocket Server
 * Env:
 * - BACKEND_URL: base URL (e.g., http://127.0.0.1:8000)
 * - WS_MEMORY_TOKEN: Sanctum token for /api/memory/* endpoints
 * - AGENT_TIME_API_KEY: API key for /api/time/* endpoints (agent.key middleware)
 * - WS_PORT: WebSocket port
 * - OPENAI_API_KEY: optional
 * - OPENAI_MODEL: optional
 */
let WebSocket; let USE_WS = true; try { WebSocket = require('ws') } catch (_) { USE_WS = false }
const fs = require('fs'); const path = require('path');
const LOG_FILE = path.join(__dirname, 'logs', 'websocket.app.log');
function logLine(msg) { try { fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true }) } catch (_) {} try { fs.appendFileSync(LOG_FILE, new Date().toISOString() + ' ' + String(msg) + '\n') } catch (_) {} try { console.log(String(msg)) } catch (_) {} }
let axios; try { axios = require('axios') } catch (_) {
    const http = require('http'); const https = require('https');
    axios = {
        get: function (url, opts) {
            return new Promise(function (resolve, reject) {
                const u = new URL(url); const lib = u.protocol === 'https:' ? https : http;
                const req = lib.request(u, { method: 'GET', headers: (opts && opts.headers) || {}, timeout: (opts && opts.timeout) || 0 }, function (res) {
                    let data = ''; res.on('data', function (c) { data += c });
                    res.on('end', function () { let parsed; try { parsed = JSON.parse(data) } catch (_) { parsed = data } resolve({ status: res.statusCode, data: parsed }) });
                }); req.on('error', reject); req.end();
            });
        },
        post: function (url, body, opts) {
            return new Promise(function (resolve, reject) {
                const u = new URL(url); const lib = u.protocol === 'https:' ? https : http;
                const payload = JSON.stringify(body || {}); const headers = Object.assign({ 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }, (opts && opts.headers) || {});
                const req = lib.request(u, { method: 'POST', headers: headers, timeout: (opts && opts.timeout) || 0 }, function (res) {
                    let data = ''; res.on('data', function (c) { data += c });
                    res.on('end', function () { let parsed; try { parsed = JSON.parse(data) } catch (_) { parsed = data } resolve({ status: res.statusCode, data: parsed }) });
                }); req.on('error', reject); req.write(payload); req.end();
            });
        }
    };
}
let uuidv4; try { uuidv4 = require('uuid').v4 } catch (_) { uuidv4 = function () { const c = require('crypto'); return c.randomUUID ? c.randomUUID() : String(Date.now()) } }
try { require('dotenv').config(); logLine('env_loaded') } catch (_) { logLine('env_load_failed') }
let OpenAI = null; try { OpenAI = require('openai') } catch (_) {}

// ---- Config ----
const PORT = process.env.WS_PORT ? parseInt(process.env.WS_PORT, 10) : 3001;

// Backend base URL → derive /api/ base (MODE-aware)
const MODE = (process.env.MODE || process.env.NODE_ENV || 'local').toLowerCase();
let computedBase = process.env.BACKEND_URL || process.env.BACKEND_API_BASE || '';
if (!computedBase) {
    computedBase = MODE === 'production'
        ? 'https://midnightswitchboard.net'
        : 'http://127.0.0.1:8000';
}
const BACKEND_URL = String(computedBase).replace(/\/+$/, '');
const API_BASE = BACKEND_URL + '/api/';

const WS_MEMORY_TOKEN = process.env.WS_MEMORY_TOKEN || '';
const TIME_API_KEY = process.env.AGENT_TIME_API_KEY || '';
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
logLine('config MODE=' + MODE + ' PORT=' + PORT + ' BACKEND_URL=' + BACKEND_URL + ' api=' + API_BASE);

let openaiClient = null;
try {
    const apiKey = process.env.OPENAI_API_KEY || '';
    if (apiKey) {
        if (!OpenAI) {
            console.log('DEBUG_OPENAI_MODULE_MISSING');
        } else {
             openaiClient = new OpenAI({ apiKey });
        }
    } else {
        console.log('DEBUG_API_KEY_MISSING');
    }
} catch (e) {
    console.log('OpenAI init error:', e.message || String(e));
}

let wss; if (USE_WS) {
    try {
        wss = new WebSocket.Server({ port: PORT });
        wss.on('error', (e) => {
             logLine('ws_server_error ' + e.message);
             if (e.code === 'EADDRINUSE') {
                 console.log('Port ' + PORT + ' in use (async), exiting...');
                 process.exit(1);
             }
        });
        logLine('WS listening on port ' + PORT)
    } catch (e) {
        logLine('ws_module_start_failed ' + (e && e.message ? e.message : String(e)));
        if (e.code === 'EADDRINUSE') {
            console.log('Port ' + PORT + ' in use, exiting...');
            process.exit(1);
        }
        USE_WS = false;
    }
}
if (!wss) {
    const http = require('http'); const crypto = require('crypto');
    const clients = new Set(); const onConnHandlers = [];
    // ... helper functions ...
    function sendFrame(sock, text) {
        const payload = Buffer.from(String(text || ''), 'utf8'); const b1 = 0x81; const len = payload.length; let header;
        if (len < 126) { header = Buffer.alloc(2); header[0] = b1; header[1] = len }
        else if (len < 65536) { header = Buffer.alloc(4); header[0] = b1; header[1] = 126; header.writeUInt16BE(len, 2) }
        else { header = Buffer.alloc(10); header[0] = b1; header[1] = 127; header.writeUInt32BE(0, 2); header.writeUInt32BE(len, 6) }
        sock.write(Buffer.concat([header, payload]));
    }
    // ... rest of helpers ...
    function decodeTextFrame(buf) {
        if (!buf || buf.length < 2) return null; const opcode = buf[0] & 0x0f; if (opcode !== 0x1) return null;
        let b2 = buf[1]; const masked = (b2 & 0x80) === 0x80; let len = b2 & 0x7f; let offset = 2;
        if (len === 126) { len = buf.readUInt16BE(offset); offset += 2 } else if (len === 127) { const hi = buf.readUInt32BE(offset); const lo = buf.readUInt32BE(offset + 4); offset += 8; if (hi !== 0) return null; len = lo }
        let payload; if (masked) { const mask = buf.slice(offset, offset + 4); offset += 4; const data = buf.slice(offset, offset + len); payload = Buffer.alloc(len); for (let i = 0; i < len; i++) { payload[i] = data[i] ^ mask[i % 4] } } else { payload = buf.slice(offset, offset + len) }
        try { return payload.toString('utf8') } catch (_) { return null }
    }
    const server = http.createServer(function (req, res) {
        try {
            res.statusCode = 426;
            res.setHeader('Content-Type', 'text/plain');
            res.end('Upgrade Required');
        } catch (_) {}
    });
    server.on('error', function(e) {
        logLine('http_server_error ' + e.message);
        if (e.code === 'EADDRINUSE') {
            process.exit(1);
        }
    });

    server.on('upgrade', function (req, socket) {
        const key = req.headers['sec-websocket-key']; if (!key) { try { socket.destroy() } catch (_) {} return }
        const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
        socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
        const wsStub = { readyState: 1, id: uuidv4(), _handlers: { message: [] }, send: function (msg) { sendFrame(socket, typeof msg === 'string' ? msg : JSON.stringify(msg)) }, on: function (evt, handler) { if (evt === 'message') this._handlers.message.push(handler) } };
        clients.add(wsStub);
        socket.on('data', function (buf) { const txt = decodeTextFrame(buf); if (txt !== null) wsStub._handlers.message.forEach(function (h) { try { h(txt) } catch (_) {} }) });
        socket.on('close', function () { clients.delete(wsStub) });
        socket.on('error', function () { clients.delete(wsStub) });
        onConnHandlers.forEach(function (h) { try { h(wsStub) } catch (_) {} });
    });
    server.listen(PORT);
    wss = { clients: clients, on: function (evt, handler) { if (evt === 'connection') onConnHandlers.push(handler) } };
    logLine('WS listening on port ' + PORT);
}

// In-memory session state
const sessionStore = new Map();

// Memory connectivity state
let memoryActive = !!WS_MEMORY_TOKEN;

function getSessionState(sessionId) {
    if (!sessionStore.has(sessionId)) {
        sessionStore.set(sessionId, { facts: {}, notes: [], history: [], timezone: null });
    }
    return sessionStore.get(sessionId);
}

function pushHistory(sessionId, role, content) {
    const st = getSessionState(sessionId);
    st.history.push({ role: role, content: content });
    if (st.history.length > 20) {
        st.history.shift();
    }
}

// Helpers
function driftMs(localEpoch, serverEpoch) {
    if (typeof serverEpoch === 'number') {
        return localEpoch - serverEpoch;
    }
    return 0;
}

function safeStatus(err) {
    if (err && err.response && typeof err.response.status !== 'undefined') {
        return err.response.status;
    }
    return null;
}

// ---- Backend calls ----

function broadcast(obj) {
    const payload = JSON.stringify(obj);
    wss.clients.forEach(function (client) {
        if (client.readyState === 1 || (typeof WebSocket !== 'undefined' && client.readyState === WebSocket.OPEN)) {
            try { client.send(payload) } catch (_) {}
        }
    });
}

async function testMemoryStatus() {
    if (!WS_MEMORY_TOKEN) {
        console.warn('memory_test_failed: missing WS_MEMORY_TOKEN');
        memoryActive = false;
        broadcast({ type: 'memory_status', status: 'inactive' });
        return false;
    }
    try {
        const res = await axios.get(API_BASE + 'agent-memory', {
            params: { limit: 1 },
            timeout: 7000,
            headers: { Authorization: 'Bearer ' + WS_MEMORY_TOKEN }
        });
        const ok = res && res.status === 200;
        if (ok) {
            console.log('memory_test_ok');
            memoryActive = true;
            broadcast({ type: 'memory_status', status: 'active' });
            return true;
        }
    } catch (e) {
        // fall through
        console.warn('memory_test_error_detail', e.message);
    }
    console.warn('memory_test_failed');
    memoryActive = false;
    broadcast({ type: 'memory_status', status: 'inactive' });
    return false;
}

async function getServerTime(userTz) {
    const headers = {};
    if (TIME_API_KEY) {
        headers['Authorization'] = 'Bearer ' + TIME_API_KEY;
    }
    const params = {};
    if (userTz) {
        params.tz = userTz;
    }

    let data = null;
    try {
        const res = await axios.get(API_BASE + 'time/status', {
            timeout: 5000,
            headers: headers,
            params: params
        });
        if (res && res.data) {
            data = res.data;
        }
    } catch (err) {
        console.log('TIME ERROR:', safeStatus(err) || err.message);
    }

    // Fallback: Default structure if backend failed
    if (!data) {
        data = {
            server_time: new Date().toISOString(),
            epoch_ms: Date.now()
        };
    }

    // Robustness: Manually calculate local_time if missing (e.g. backend error) but we have a timezone
    if (!data.local_time && userTz) {
        try {
            data.local_time = new Date().toLocaleString('en-US', { timeZone: userTz, dateStyle: 'full', timeStyle: 'medium' });
            if (!data.local) data.local = {};
            data.local.timezone = userTz;
            console.log('DEBUG_TIME_CALC: Calculated ' + data.local_time + ' for ' + userTz);
        } catch (e) {
            console.warn('DEBUG_TIME_CALC_FAIL', e.message);
        }
    }

    return data;
}

async function storeMemory(sessionId, key, value) {
    if (!WS_MEMORY_TOKEN || !memoryActive) {
        console.warn('memory_write_error');
        return false;
    }
    try {
        const res = await axios.post(
            API_BASE + 'agent-memory/store', {
                session_id: sessionId,
                key: key,
                value: value
            }, {
                timeout: 10000,
                headers: {
                    Authorization: 'Bearer ' + WS_MEMORY_TOKEN,
                    'Content-Type': 'application/json'
                }
            }
        );
        console.log('memory_write_ok');
        return res.status >= 200 && res.status < 300;
    } catch (err) {
        const status = err && err.response && err.response.status;
        const detail = err && err.response && err.response.data ? JSON.stringify(err.response.data) : '';
        console.log('memory_write_error', status || '');
        if (detail) console.log('memory_write_error_detail', detail);
        return false;
    }
}

async function fetchMemory(sessionId) {
    if (!WS_MEMORY_TOKEN || !memoryActive) {
        console.warn('memory_fetch_error');
        return { status: 'inactive', items: {} };
    }
    try {
        // Fetch from Vault (global/user memory)
        const res = await axios.get(API_BASE + 'agent-memory', {
            params: { limit: 50 },
            timeout: 10000,
            headers: {
                Authorization: 'Bearer ' + WS_MEMORY_TOKEN
            }
        });
        
        let items = {};
        if (res && res.data) {
            // Handle pagination shape: { current_page: 1, data: [ ... ] }
            const rows = Array.isArray(res.data.data) ? res.data.data : (Array.isArray(res.data) ? res.data : []);
            
            rows.forEach(function(row) {
                if (row && row.content) {
                    // Check if content is JSON KV
                    try {
                        const c = JSON.parse(row.content);
                        if (c && c.key && c.value) {
                            items[c.key] = c.value;
                            return;
                        }
                    } catch (_) {}
                    
                    // Otherwise treat as note
                    items['note_' + (row.id || Math.random())] = row.content;
                }
            });
        }
        
        console.log('memory_fetch_ok');
        return {
            status: Object.keys(items).length ? 'active' : 'inactive',
            items: items
        };
    } catch (err) {
        const status = err && err.response && err.response.status;
        const detail = err && err.response && err.response.data ? JSON.stringify(err.response.data) : '';
        console.log('memory_fetch_error', status || '');
        if (detail) console.log('memory_fetch_error_detail', detail);
        return { status: 'inactive', items: {} };
    }
}

function mergeBackendItemsIntoSession(sessionId, items) {
    const st = getSessionState(sessionId);
    let merged = 0;
    Object.keys(items || {}).forEach(function (k) {
        const nk = normalizeKey(k);
        const v = items[k];
        if (nk.startsWith('note')) {
            const nv = String(v || '').trim();
            if (nv && !st.notes.includes(nv)) {
                st.notes.push(nv);
                merged++;
            }
        } else {
            st.facts[nk] = v;
            merged++;
        }
    });
    if (merged > 0) {
        console.log('memory_load_ok');
    }
}

async function getThreadMarker(sessionId) {
    try {
        const res = await axios.get(API_BASE + 'thread/marker', {
            params: { session_id: sessionId },
            timeout: 5000,
            headers: TIME_API_KEY ? { Authorization: 'Bearer ' + TIME_API_KEY } : {}
        });
        if (res && res.data && typeof res.data.marker === 'string' && res.data.marker.length) {
            return res.data.marker;
        }
    } catch (err) {
        console.log('THREAD ERROR:', safeStatus(err) || err.message);
    }
    return 'tm_' + (TIME_API_KEY ? 'time_key' : 'none');
}

async function logTurn(payload) {
    if (!payload || !payload.session_id) return;
    // Store conversation turn to Vault for continuity
    try {
        const key = 'history_' + Date.now();
        const val = JSON.stringify({
            role: 'turn',
            user: payload.user_message,
            assistant: payload.agent_reply,
            timestamp: payload.meta.server_time
        });
        await storeMemory(payload.session_id, key, val);
    } catch (e) {
        console.log('logTurn_error', e.message);
    }
}

// ---- Memory helpers ----

function normalizeKey(raw) {
    return String(raw || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_');
}

async function handleMemoryStore(sessionId, userMsg) {
    const st = getSessionState(sessionId);
    const text = String(userMsg || '').trim();

    if (!WS_MEMORY_TOKEN || !memoryActive) {
        try { console.warn('memory_store_blocked_inactive'); } catch (_){}
        if (text.length) {
            st.notes = st.notes || [];
            st.notes.push(text);
        }
        return 'System notice: The Vault is currently inactive, so I may not be able to store this long-term.';
    }

    // Explicit phrases that always store
    const phraseMatch = text.match(/(?:store\s+this\s+fact|add\s+note)\s*:?\s*(.*)$/i);
    if (phraseMatch) {
        const body = phraseMatch[1] ? phraseMatch[1].trim() : text;
        st.notes.push(body);
        await storeMemory(sessionId, 'note', body);
        return 'Stored in memory.';
    }

    // "Remember this: My favorite color is red."
    let m = text.match(/favorite\s+color\s+is\s+([^.!?\n\r]+)/i);
    if (m && m[1]) {
        const color = m[1].trim();
        st.facts.favorite_color = color;
        await storeMemory(sessionId, 'favorite_color', color);
        return 'Stored in memory.';
    }

    // "My name is Hitesh."
    m = text.match(/my\s+name\s+is\s+([^.!?\n\r]+)/i);
    if (m && m[1]) {
        const name = m[1].trim();
        st.facts.name = name;
        await storeMemory(sessionId, 'name', name);
        return 'Stored in memory.';
    }

    // Generic direct statement: "My X is Y"
    m = text.match(/my\s+([a-zA-Z0-9 _-]{1,40})\s+is\s+([^.!?\n\r]+)/i);
    if (m && m[1] && m[2]) {
        const key = normalizeKey(m[1]);
        const value = m[2].trim();
        st.facts[key] = value;
        await storeMemory(sessionId, key, value);
        return 'Stored in memory.';
    }

    // Ownership: "I own Maruti Brezza 2023 model"
    m = text.match(/\bi\s+own\s+([^.!?\n\r]+)/i);
    if (m && m[1]) {
        const item = m[1].trim();
        st.facts.owned_item = item;
        await storeMemory(sessionId, 'owned_item', item);
        if (/\b(car|brezza|maruti|suzuki|honda|toyota|tesla|model)\b/i.test(item)) {
            st.facts.car_owned = item;
            await storeMemory(sessionId, 'car_owned', item);
        }
        return 'Stored in memory.';
    }

    // Generic: "Remember this: my X is Y"
    m = text.match(/(?:remember|store|save)\s+(?:this(?:\s+fact)?\:?\s*)?(.*)/i);
    if (m && m[1]) {
        const body = m[1].trim();
        let kv = body.match(/my\s+([a-zA-Z0-9 _-]{1,40})\s+is\s+([^.!?\n\r]+)/i);
        if (kv && kv[1] && kv[2]) {
            const key = normalizeKey(kv[1]);
            const value = kv[2].trim();
            st.facts[key] = value;
            await storeMemory(sessionId, key, value);
            return 'Stored in memory.';
        }
        // Fallback: just store as note
        st.notes.push(body);
        await storeMemory(sessionId, 'note', body);
        return 'Stored in memory.';
    }

    return null;
}

function handleMemoryQuery(sessionId, userMsg, backendItems) {
    const st = getSessionState(sessionId);
    const text = String(userMsg || '').toLowerCase();

    if (!WS_MEMORY_TOKEN || !memoryActive) {
        if (
            text.indexOf('remember') !== -1 ||
            text.indexOf('memory') !== -1 ||
            text.indexOf('favourite') !== -1 ||
            text.indexOf('favorite') !== -1 ||
            text.indexOf('what is my') !== -1
        ) {
            return 'System notice: The Vault is currently inactive, so I cannot reliably recall earlier stored facts.';
        }
    }

    // "Which car I own?" / "What car do I own?"
    if (/which\s+car\s+i\s+own/i.test(text) || /which\s+car\s+do\s+i\s+own/i.test(text) || /what\s+car\s+do\s+i\s+own/i.test(text) || (/\bcar\b/i.test(text) && /\bown\b/i.test(text))) {
        try { console.log('mem_debug_car_check', JSON.stringify(st.facts || {}), JSON.stringify(backendItems || {})); } catch (_){}
        const car =
            (backendItems && (backendItems.car_owned || backendItems.owned_item)) ||
            st.facts.car_owned ||
            st.facts.owned_item;
        if (car) {
            console.log('memory_answer_hit', 'car_owned');
            return 'You own ' + car + '.';
        }
        console.log('memory_answer_miss', 'car_owned');
        return "I don't have that yet.";
    }

    // Generic ownership question
    if (/\bdo\s+i\s+own\b/i.test(text) || /\bi\s+own\b/i.test(text)) {
        const item =
            (backendItems && backendItems.owned_item) ||
            st.facts.owned_item ||
            st.facts.car_owned ||
            (backendItems && backendItems.car_owned);
        if (item) {
            console.log('memory_answer_hit', 'owned_item');
            return 'You own ' + item + '.';
        }
        console.log('memory_answer_miss', 'owned_item');
        return "I don't have that yet.";
    }

    // Dynamic: "What is my X?"
    let q = text.match(/what\s+is\s+my\s+([a-z0-9 _-]{1,40})\??/i);
    if (q && q[1]) {
        const rawKey = q[1];
        const key = normalizeKey(rawKey);
        const altKeys = [key];
        if (key === 'car' || key === 'vehicle') {
            altKeys.push('car_owned', 'owned_item');
        }
        let value = null;
        for (let i = 0; i < altKeys.length; i++) {
            const k = altKeys[i];
            value =
                (backendItems && backendItems[k]) ||
                st.facts[k];
            if (value) break;
        }
        if (value) {
            console.log('memory_answer_hit', key);
            const display = rawKey.trim().toLowerCase();
            return 'Your ' + display + ' is ' + value + '.';
        }
        console.log('memory_answer_miss', key);
        return "I don't have that yet.";
    }

    // "What did I ask you to remember?"
    if (/what\s+did\s+i\s+ask\s+you\s+to\s+remember/i.test(text)) {
        const notes = [];
        if (backendItems && backendItems.note) {
            notes.push(String(backendItems.note));
        }
        if (Array.isArray(st.notes)) {
            st.notes.forEach(function(n){ if (n && notes.indexOf(String(n)) === -1) notes.push(String(n)) });
        }
        if (notes.length) {
            console.log('memory_answer_hit', 'note');
            return 'You asked me to remember: ' + notes[notes.length - 1] + '.';
        }
        console.log('memory_answer_miss', 'note');
        return "I don't have that yet.";
    }

    // "What do you remember?" or "What do you remember about me?"
    if (
        /what\s+do\s+you\s+remember(?:\s+about\s+me)?/i.test(text) ||
        /do\s+you\s+remember\s+anything\s+about\s+me/i.test(text)
    ) {
        const lines = [];
        const b = backendItems || {};
        const stFacts = st.facts || {};
        const keys = {};
        Object.keys(b).forEach(function(k){ keys[normalizeKey(k)] = true });
        Object.keys(stFacts).forEach(function(k){ keys[normalizeKey(k)] = true });
        Object.keys(keys).forEach(function(k) {
            const v = (b && b[k]) || stFacts[k];
            if (typeof v !== 'undefined') {
                lines.push(k + ': ' + String(v));
            }
        });
        if (st.notes && st.notes.length) {
            st.notes.forEach(function(n) {
                lines.push('note: ' + String(n));
            });
        }
        if (lines.length) {
            console.log('memory_answer_hit', 'summary');
            return 'Here is what I remember:\n' + lines.join('\n');
        }
        console.log('memory_answer_miss', 'summary');
        return "I don't have anything yet.";
    }

    return null;
}

// ---- Emotion / context ----

function isEmotionQuestion(userMsg) {
    const t = String(userMsg || '').toLowerCase();
    return (
        t.indexOf('how do i seem') !== -1 ||
        t.indexOf('emotional state') !== -1 ||
        t.indexOf('how do i sound') !== -1
    );
}

function describeEmotion(sessionId) {
    const st = getSessionState(sessionId);
    const text = st.history.map(function(h) {
        return String(h.content || '').toLowerCase();
    }).join(' ');

    let sentiment = 'neutral';
    if (/\b(great|awesome|love|nice|thanks)\b/.test(text)) {
        sentiment = 'positive';
    }
    if (/\b(error|fail|issue|broken|angry|frustrated|annoyed|mad|hate)\b/.test(text)) {
        sentiment = 'negative';
    }

    let mode = 'engaged';
    if (/\btest|testing|check|verify|debug\b/.test(text)) {
        mode = 'testing';
    }
    if (/\bconfused|unclear|stuck\b/.test(text)) {
        mode = 'frustrated';
    }

    if (mode === 'testing') {
        if (sentiment === 'negative') {
            return 'You seem focused on testing the system but also a bit frustrated.';
        }
        return 'You seem focused on testing the system and checking how things behave.';
    }

    if (sentiment === 'positive') {
        return 'You seem positive and engaged.';
    }
    if (sentiment === 'negative') {
        return 'You seem a bit frustrated or concerned.';
    }
    return 'You seem engaged and thoughtful.';
}

// ---- LLM fallback ----

async function generateLLMReply(userMsg, serverTime, threadMarker, backendItems, sessionId, timeStatus) {
    const st = getSessionState(sessionId);
    const history = st.history || [];
    
    const memLines = [];
    if (backendItems) {
        Object.keys(backendItems).forEach(k => {
            memLines.push(`${k}: ${backendItems[k]}`);
        });
    }
    if (st.notes && st.notes.length) {
        st.notes.forEach(n => {
            // Avoid duplicates if note is already in backendItems (unlikely but possible)
            if (memLines.indexOf(`note: ${n}`) === -1) {
                memLines.push(`note: ${n}`);
            }
        });
    }
    
    const memSummary = memLines.length ?
        'Known memory:\n' + memLines.slice(0, 30).join('\n') :
        'No stored memory yet.';

    let localTimeInfo = '';
    if (timeStatus && timeStatus.local_time) {
        localTimeInfo = 'local_user_time: ' + timeStatus.local_time + '\n';
        if (timeStatus.local && timeStatus.local.timezone) {
            localTimeInfo += 'local_timezone: ' + timeStatus.local.timezone + '\n';
        }
    }

    const systemPrompt =
        'You are the agent runtime. Your memory is persistent.\n' +
        'Below is a summary of your past interactions and knowledge (memSummary).\n' +
        'You MUST use this memory to maintain continuity and identity.\n' +
        'If the user asks about past topics, refer to the notes below.\n' +
        'server_time: ' + serverTime + '\n' +
        localTimeInfo +
        (localTimeInfo ? 'NOTE: The local_user_time above is the AUTHORITATIVE current time for the user (updated ' + new Date().toISOString() + '). If asked for the time, USE THIS VALUE EXACTLY. Ignore any previous time context.\n' : '') +
        'thread_marker: ' + threadMarker + '\n' +
        '--- MEMORY START ---\n' +
        memSummary + '\n' +
        '--- MEMORY END ---\n';
        
    console.log('DEBUG_SYSTEM_PROMPT_GENERATED:', systemPrompt);

    console.log('LLM_SYSTEM_PROMPT:', systemPrompt);

    if (!openaiClient) {
        const t = userMsg.toLowerCase();
        if (t.indexOf('time') !== -1) {
            return 'The server_time is ' + serverTime + '.';
        }
        if (t.indexOf('thread marker') !== -1) {
            return 'Your thread_marker is ' + threadMarker + '.';
        }
        if (t.indexOf('restart') !== -1) {
            return 'restart_detected is false.';
        }
        return 'System Error: OpenAI client not initialized. Check server logs.';
    }

    try {
        const messages = [
            { role: 'system', content: systemPrompt }
        ];
        history.forEach(function(h) {
            messages.push({
                role: h.role === 'assistant' ? 'assistant' : 'user',
                content: h.content
            });
        });
        messages.push({ role: 'user', content: userMsg });

        const res = await openaiClient.chat.completions.create({
            model: MODEL,
            messages: messages,
            temperature: 0.2
        });
        
        if (res) {
             console.log('LLM_RESPONSE_RAW:', JSON.stringify(res));
        }

        if (
            res &&
            res.choices &&
            res.choices[0] &&
            res.choices[0].message &&
            typeof res.choices[0].message.content === 'string'
        ) {
            return res.choices[0].message.content;
        }
    } catch (err) {
        console.log('OPENAI ERROR:', safeStatus(err) || err.message);
        return 'System Error: OpenAI API failed: ' + (err.message || 'unknown');
    }

    return 'System Error: No response content from LLM.';
}

// ---- WebSocket handling ----

wss.on('connection', function(ws, req) {
    ws.id = uuidv4();
    try {
        const xfwd = (req && req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.headers['cf-connecting-ip'])) ? String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.headers['cf-connecting-ip']) : '';
        const sockIp = req && req.socket && req.socket.remoteAddress ? String(req.socket.remoteAddress) : '';
        let ip = xfwd ? xfwd.split(',')[0].trim() : (sockIp || '');
        // Normalize IPv6 localhost
        if (ip === '::1') ip = '127.0.0.1';
        ws.clientIp = ip || null;
        console.log('ws_client_ip', ws.clientIp || 'unknown');
    } catch (_) { ws.clientIp = null }

    // Send current memory status on connect
    try {
        ws.send(JSON.stringify({ type: 'memory_status', status: memoryActive ? 'active' : 'inactive' }));
    } catch (_) {}

    // Cache IP-based timezone results to avoid repeated API calls
    const ipTimezoneCache = new Map();

    async function detectTimezoneFromIp(ip) {
        if (!ip || ip === '127.0.0.1') return null;
        if (ipTimezoneCache.has(ip)) return ipTimezoneCache.get(ip);
        
        try {
            const url = 'https://ipapi.co/' + encodeURIComponent(ip) + '/json/';
            const res = await axios.get(url, { timeout: 4000 });
            if (res && res.data && typeof res.data.timezone === 'string' && res.data.timezone.length) {
                const tz = res.data.timezone;
                ipTimezoneCache.set(ip, tz);
                // Clear cache entry after 1 hour
                setTimeout(() => ipTimezoneCache.delete(ip), 3600000);
                return tz;
            }
        } catch (_) {}
        try {
            // Fallback: worldtimeapi (may rate-limit)
            const url2 = 'http://worldtimeapi.org/api/ip/' + encodeURIComponent(ip);
            const res2 = await axios.get(url2, { timeout: 4000 });
            if (res2 && res2.data && typeof res2.data.timezone === 'string' && res2.data.timezone.length) {
                const tz = res2.data.timezone;
                ipTimezoneCache.set(ip, tz);
                setTimeout(() => ipTimezoneCache.delete(ip), 3600000);
                return tz;
            }
        } catch (_) {}
        return null;
    }

    async function ensureTimezone(wsObj, sessionState, payload) {
        let tz =
            (payload && (payload.timezone || payload.tz)) ? String(payload.timezone || payload.tz).trim() : null;
        if (tz) {
            wsObj.timezone = tz;
            sessionState.timezone = tz;
            return tz;
        }
        if (wsObj.timezone) {
            tz = wsObj.timezone;
            if (!sessionState.timezone) sessionState.timezone = tz;
            return tz;
        }
        if (sessionState.timezone) {
            return sessionState.timezone;
        }
        // Discover from client IP
        const guessed = await detectTimezoneFromIp(wsObj.clientIp);
        if (guessed) {
            wsObj.timezone = guessed;
            sessionState.timezone = guessed;
            console.log('DEBUG_TZ_DISCOVERY', guessed);
            return guessed;
        }
        return null;
    }

    ws.on('message', async function(raw) {
        console.log('ws_message_received', String(raw));
        let data;
        try {
            data = JSON.parse(String(raw));
            console.log('DEBUG_WS_MESSAGE_PAYLOAD:', JSON.stringify(data));
        } catch (e) {
            console.warn('ws_message_parse_failed');
            return;
        }

        // Accept both snake_case and camelCase keys
        const sessionId =
            (data && (data.session_id || data.sessionId) && String(data.session_id || data.sessionId).trim()) ||
            uuidv4();
        const userMsg =
            (data && (data.message || data.msg) && String(data.message || data.msg).trim()) ||
            '';
        if (!userMsg) {
            console.warn('ws_message_empty');
            return;
        }

        console.log('ws_message_session', sessionId);
        console.log('ws_message_text', userMsg);

        // Track history
        pushHistory(sessionId, 'user', userMsg);

        // Fetch context from backend (pass timezone if present, and persist it)
        const st = getSessionState(sessionId);
        const userTz = await ensureTimezone(ws, st, data);
        console.log('DEBUG_RESOLVED_TIMEZONE:', userTz);

        const timeStatus = await getServerTime(userTz);

        // Trust client-side reported time if available (fixes mismatches due to VPN/Server drift)
        if (data && data.local_time_string && String(data.local_time_string).length > 5) {
             const clientLocal = String(data.local_time_string);
             console.log('DEBUG_CLIENT_LOCAL_TIME_OVERRIDE:', clientLocal);
             timeStatus.local_time = clientLocal;
             if (!timeStatus.local) timeStatus.local = {};
             timeStatus.local.local_user_time = clientLocal;
             // We keep timezone as is, because that comes from resolvedOptions
        }

        console.log('DEBUG_SERVER_TIME_STATUS:', JSON.stringify(timeStatus));
        const server_time =
            timeStatus.server_time || new Date().toISOString();
        const epoch_ms =
            typeof timeStatus.epoch_ms === 'number' ?
            timeStatus.epoch_ms :
            Date.parse(server_time) || Date.now();
        const drift_ms = driftMs(Date.now(), epoch_ms);

        console.log('memory_fetch_called');
        const memory = await fetchMemory(sessionId);
        const backendItems = memory.items || {};
        mergeBackendItemsIntoSession(sessionId, backendItems);

        // Identity lock and continuity from backend
        const thread_marker = await getThreadMarker(sessionId);
        const restart_detected =
            (timeStatus && typeof timeStatus.restart_detected !== 'undefined')
                ? !!timeStatus.restart_detected
                : false;
        const session_continuity =
            (timeStatus && typeof timeStatus.session_continuity !== 'undefined')
                ? !!timeStatus.session_continuity
                : null;

        let reply = null;
        const lower = userMsg.toLowerCase();

        // 1) Time / thread / restart tests
        const isTimeQuestion =
            lower.indexOf('what time is it') !== -1 ||
            lower.indexOf('what is the time') !== -1 ||
            lower.indexOf('current time') !== -1 ||
            lower.indexOf('what\'s the time') !== -1 ||
            lower.indexOf('local time') !== -1 ||
            (lower.indexOf('time') !== -1 && (
                lower.indexOf('now') !== -1 ||
                lower.indexOf('for you') !== -1 ||
                lower.indexOf('where i am') !== -1 ||
                lower.indexOf('my time') !== -1
            ));
        if (isTimeQuestion) {
            console.log('DEBUG_TIME_QUESTION_HIT', userMsg);
            const localTime = timeStatus && timeStatus.local_time ? timeStatus.local_time : null;
            if (localTime) {
                reply = 'The server_time is ' + server_time + ' and your local_time is ' + localTime + '.';
            } else {
                reply = 'The server_time is ' + server_time + '.';
            }
        } else if (
            lower.indexOf('current thread marker') !== -1 ||
            lower.indexOf('what is my thread marker') !== -1
        ) {
            reply = 'Your thread_marker is ' + thread_marker + '.';
        } else if (
            lower.indexOf('have you detected any restart') !== -1 ||
            lower.indexOf('restart recently') !== -1
        ) {
            reply = 'restart_detected is ' + String(restart_detected) + '.';
        }

        // 2) Memory store / recall
        if (!reply) {
            console.log('memory_store_called');
            const storeReply = await handleMemoryStore(sessionId, userMsg);
            if (storeReply) {
                reply = storeReply;
            }
        }

        if (!reply) {
            const memReply = handleMemoryQuery(
                sessionId,
                userMsg,
                backendItems
            );
            if (memReply) {
                reply = memReply;
            }
        }

        // 3) Emotion / context
        if (!reply && isEmotionQuestion(userMsg)) {
            reply = describeEmotion(sessionId);
        }

        // 4) Simple acknowledgements
        if (!reply) {
            const t = lower.trim();
            if (
                t === 'ok' ||
                t === 'okay' ||
                t === 'thanks' ||
                t === 'thank you' ||
                t === 'yes' ||
                t === 'no' ||
                t === 'done'
            ) {
                reply = 'Acknowledged.';
            }
        }

        // 5) LLM or fallback
        if (!reply) {
            reply = await generateLLMReply(
                userMsg,
                server_time,
                thread_marker,
                backendItems,
                sessionId,
                timeStatus
            );
        }

        // Track assistant message
        pushHistory(sessionId, 'assistant', reply);

        // Log to backend
        const logPayload = {
            session_id: sessionId,
            user_message: userMsg,
            agent_reply: reply,
            meta: {
                server_time: server_time,
                drift_ms: drift_ms,
                restart_detected: restart_detected,
                session_continuity: session_continuity,
                thread_marker: thread_marker,
                memory_status: memory.status
            }
        };
        await logTurn(logPayload);

        const out = {
            response: reply,
            server_time: server_time,
            drift_ms: drift_ms,
            restart_detected: restart_detected,
            session_continuity: session_continuity,
            thread_marker: thread_marker,
            memory_status: memory.status
        };
        try {
            const serialized = JSON.stringify(out);
            console.log('ws_message_reply', serialized);
            ws.send(serialized);
        } catch (e) {
            // ignore
        }
    });
});

// Kick off memory status test on startup
(async function init() {
    try { await testMemoryStatus() } catch (e) { logLine('init_memory_status_error ' + (e && e.message ? e.message : String(e))) }
})();
