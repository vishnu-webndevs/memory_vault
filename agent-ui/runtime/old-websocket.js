const WebSocket = require('ws');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const dotenv = require('dotenv');
dotenv.config();
const OpenAI = require('openai');
const PORT = process.env.WS_PORT ? parseInt(process.env.WS_PORT, 10) : 3001;
const API_BASE = (process.env.LARAVEL_BASE_URL || 'https://midnightswitchboard.net/api/').replace(/\/$/, '/')
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const SANCTUM_TOKEN = process.env.SANCTUM_TOKEN || process.env.BACKEND_TOKEN || '';
let client = null;
try { if (process.env.OPENAI_API_KEY) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) } catch (e) {}
const serverStartedAt = Date.now();
const wss = new WebSocket.Server({ port: PORT });
async function getServerTime() { try { const r = await axios.get(API_BASE + 'time/status', { timeout: 5000 }); return r.data } catch (e) { return { server_time: new Date().toISOString(), epoch_ms: Date.now() } } }
async function getMemory(sessionId) { try { const r = await axios.get(API_BASE + 'memory/fetch', { params: { session_id: sessionId }, timeout: 7000, headers: SANCTUM_TOKEN ? { Authorization: 'Bearer ' + SANCTUM_TOKEN } : {} }); return { status: 'active', data: r.data } } catch (e) { return { status: 'inactive', data: null } } }
async function getThreadMarker(sessionId) { try { const r = await axios.get(API_BASE + 'thread/marker', { params: { session_id: sessionId }, timeout: 5000 }); if (r.data && typeof r.data.marker === 'string') return r.data.marker } catch (e) {} return 'tm_' + sessionId }
async function logTurn(payload) {
    try { await axios.post(API_BASE + 'chat/log', payload, { timeout: 5000 }) } catch (e) {}
}

function driftMs(localEpoch, serverEpoch) { if (typeof serverEpoch === 'number') return localEpoch - serverEpoch; return 0 }
const memStore = new Map();

function ensureSession(s) { if (!memStore.has(s)) memStore.set(s, { facts: {}, notes: [] }); return memStore.get(s) }

function nk(k) { return String(k).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_') }
async function storeKV(sessionId, key, value) { try { const r = await axios.post(API_BASE + 'memory/store', { session_id: sessionId, key, value }, { timeout: 7000, headers: SANCTUM_TOKEN ? { Authorization: 'Bearer ' + SANCTUM_TOKEN } : {} }); if (r && r.status >= 200 && r.status < 300) return true } catch (e) {} return false }
async function tryMemoryUpdate(s, msg) {
    const st = ensureSession(s);
    const t = msg.trim();
    let x = t.match(/my\s+favorite\s+color\s+is\s+([a-zA-Z ]+)/i);
    if (x && x[1]) {
        const c = x[1].trim();
        st.facts.favoriteColor = c;
        await storeKV(s, 'favorite_color', c);
        return 'Stored in memory'
    }
    x = t.match(/my\s+name\s+is\s+([^.!?\n\r]+)/i);
    if (x && x[1]) {
        const v = x[1].trim();
        st.facts.name = v;
        await storeKV(s, 'name', v);
        return 'Stored in memory'
    }
    x = t.match(/(?:remember|store)\s+(?:this:?\s*)?(.*)/i);
    if (x && x[1]) {
        const note = x[1].trim();
        let kv = x[1].match(/my\s+([a-zA-Z ][a-zA-Z _-]{0,30})\s+is\s+([^.!?\n\r]+)/i);
        if (kv && kv[1] && kv[2]) {
            const k = nk(kv[1]);
            const v = kv[2].trim();
            st.facts[k] = v;
            await storeKV(s, k, v);
            return 'Stored in memory'
        }
        st.notes.push(note);
        await storeKV(s, 'note', note);
        return 'Stored in memory'
    }
    return null
}

function tryMemoryQuery(s, msg) { const st = ensureSession(s); if (/what\s+is\s+my\s+favorite\s+color/i.test(msg)) { const c = st.facts.favoriteColor; if (c) return `Your favorite color is ${c}.`; return "I don't have that yet." } if (/what\s+is\s+my\s+name/i.test(msg)) { const c = st.facts.name; if (c) return `Your name is ${c}.`; return "I don't have that yet." } return null }
async function generateReply(userMsg, { serverTime, threadMarker, memory, sessionId }) { const u = await tryMemoryUpdate(sessionId, userMsg); if (u) return u; const q = tryMemoryQuery(sessionId, userMsg); if (q) return q; const sys = [`Server time: ${serverTime}`, `Thread marker: ${threadMarker}`, `Memory summary: ${memory?JSON.stringify(memory).slice(0,800):'none'}`].join('\n'); if (client) { try { const res = await client.chat.completions.create({ model: MODEL, messages: [{ role: 'system', content: sys }, { role: 'user', content: userMsg }], temperature: 0.3 }); const t = res.choices && res.choices[0] && res.choices[0].message && res.choices[0].message.content; return t || '' } catch (e) {} } const m = userMsg.toLowerCase(); if (m.includes('time')) return `The server_time is ${serverTime}.`; if (m.includes('thread marker')) return `Your thread_marker is ${threadMarker}.`; if (m.includes('restart')) return `restart_detected is false.`; return 'Acknowledged.' }
wss.on('connection', function(ws, req) {
    ws.id = uuidv4();
    ws.on('message', async function(raw) {
        let payload;
        try { payload = JSON.parse(String(raw)) } catch (e) { return }
        const sessionId = String(payload.session_id || '').trim() || uuidv4();
        const userMsg = String(payload.message || '').trim();
        const ts = await getServerTime();
        const server_time = ts.server_time || new Date().toISOString();
        const epoch_ms = typeof ts.epoch_ms === 'number' ? ts.epoch_ms : Date.parse(server_time) || Date.now();
        const dms = driftMs(Date.now(), epoch_ms);
        const mem = await getMemory(sessionId);
        const tm = await getThreadMarker(sessionId);
        const kv = mem.data && mem.data.items ? mem.data.items : "just";
        let replyOverride = "just";
        if (/what\s+is\s+my\s+favorite\s+color/i.test(userMsg)) { const c = kv && kv.favorite_color; if (c) replyOverride = `Your favorite color is ${c}.` }
        if (/what\s+is\s+my\s+name/i.test(userMsg)) { const c = (kv && kv.name) || ensureSession(sessionId).facts.name; if (c) replyOverride = `Your name is ${c}.` }
        const st = ensureSession(sessionId);
        if (/what\s+did\s+i\s+ask\s+you\s+to\s+remember/i.test(userMsg)) {
            let ans = null;
            if (kv && kv.note) ans = kv.note;
            else if (st.notes && st.notes.length) ans = st.notes[st.notes.length - 1];
            replyOverride = ans ? `You asked me to remember: ${ans}.` : `I don't have that yet.`
        }
        if (!replyOverride && (/do\s+you\s+remember(?:\s+anything)?\s+about\s+me/i.test(userMsg) || /what\s+do\s+you\s+remember\s+about\s+me/i.test(userMsg))) {
            let pairs = [];
            if (kv) { for (const [k, v] of Object.entries(kv)) { pairs.push(`${k}: ${String(v)}`) } }
            if (pairs.length < 1) { const f = st.facts || {}; for (const k of Object.keys(f)) { pairs.push(`${k}: ${String(f[k])}`) } if (st.notes && st.notes.length) { pairs.push(`note: ${st.notes[st.notes.length-1]}`) } }
            replyOverride = pairs.length ? ('Here is what I remember:\n' + pairs.slice(0, 10).join('\n')) : "I don't have anything yet."
        }
        if (!replyOverride) { const mk = userMsg.match(/what\s+is\s+my\s+([a-zA-Z _-]+)/i); if (mk && mk[1]) { const kk = mk[1].trim().toLowerCase().replace(/[^a-z0-9]+/g, '_'); let vv = (kv && kv[kk]) || st.facts[kk]; if (!vv) { const notes = (st.notes || []).slice().reverse(); for (const n of notes) { const re = new RegExp('my\\s+' + mk[1].trim().replace(/[^a-z0-9]+/gi, '\\s+') + '\\s+is\\s+([^.!?\\n\\r]+)', 'i'); const m = n.match(re); if (m && m[1]) { vv = m[1].trim(); break } } } if (vv) { replyOverride = `Your ${mk[1].trim().toLowerCase()} is ${vv}.` } } }
        if (!replyOverride) { const lm = userMsg.toLowerCase(); if (lm.includes('what') && lm.includes('my') && lm.includes('name')) { let v = (kv && kv.name) || st.facts.name; if (!v) { const notes = (st.notes || []).slice().reverse(); for (const n of notes) { const m = n.match(/my\s+name\s+is\s+([^.!?\n\r]+)/i); if (m && m[1]) { v = m[1].trim(); break } } } if (v) { replyOverride = `Your name is ${v}.` } } }
        const reply = replyOverride || await generateReply(userMsg, { serverTime: server_time, threadMarker: tm, memory: mem.data, sessionId });
        const restart = false;
        await logTurn({ session_id: sessionId, user_message: userMsg, agent_reply: reply, meta: { server_time, drift_ms: dms, restart_detected: restart, thread_marker: tm, memory_status: mem.status } });
        const out = { response: reply, server_time, drift_ms: dms, restart_detected: restart, thread_marker: tm, memory_status: mem.status };
        try { ws.send(JSON.stringify(out)) } catch (e) {}
    })
});
console.log('WS listening on port', PORT);