const OpenAI = require("openai")
const { log, warn } = require("../utils/logger")

function client(cfg) {
  return new OpenAI({ apiKey: cfg.OPENAI_API_KEY })
}

async function sendStructuredRequest(cfg, payload, memoryBlock) {
  log("debug_openai_key_check: " + (cfg ? cfg.OPENAI_API_KEY : "no_cfg"))
  if (cfg && (cfg.OFFLINE === true || !cfg.OPENAI_API_KEY || cfg.OPENAI_API_KEY === "dummy")) {
    const m = payload && payload.meta ? payload.meta : {}
    const notes = "offline"
    return { action: "observe", notes, continuity: m && m.session_continuity, time: m && m.local_time }
  }
  const c = client(cfg)
  const base = "Respond as a JSON object with keys: action, notes, continuity, time.\n" +
               "IMPORTANT: In the 'notes' field, you MUST summarize the user's input, key facts, and any new information learned in this turn. " +
               "Do not just say 'Identity lock enabled'. Capture the actual content of the conversation for future recall."
  let sys = base + (memoryBlock ? "\n" + memoryBlock : "")
  try {
    const m = payload && payload.meta ? payload.meta : null
    if (m) {
      const has = {
        server_time: typeof m.server_time !== "undefined" && m.server_time !== null,
        local_time: typeof m.local_time !== "undefined" && m.local_time !== null,
        drift_ms: typeof m.drift_ms !== "undefined" && m.drift_ms !== null,
        session_continuity: typeof m.session_continuity !== "undefined" && m.session_continuity !== null,
        restart_detected: typeof m.restart_detected !== "undefined" && m.restart_detected !== null
      }
      const timeBlock = `<context name="time_awareness">\nserver_time: ${has.server_time ? m.server_time : "unknown"}\nlocal_time: ${has.local_time ? m.local_time : "unknown"}\ndrift_ms: ${has.drift_ms ? m.drift_ms : "unknown"}\nsession_continuity: ${has.session_continuity ? Boolean(m.session_continuity) : "unknown"}\nrestart_detected: ${has.restart_detected ? Boolean(m.restart_detected) : "unknown"}\n</context>`
      sys = sys + "\n" + timeBlock
      if (has.server_time && has.local_time && has.drift_ms && has.session_continuity && has.restart_detected) {
        log("time_context_injected")
      } else {
        warn("time_context_missing")
      }
    } else {
      warn("time_context_missing")
    }
  } catch (_) {
    warn("time_context_missing")
  }
  const messages = [
    { role: "system", content: sys },
    { role: "user", content: JSON.stringify(payload) }
  ]
  const res = await c.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
    temperature: 0,
    response_format: { type: "json_object" }
  })
  log("openai_ok")
  const txt = res.choices?.[0]?.message?.content || "{}"
  try {
    return JSON.parse(txt)
  } catch {
    return { action: "none", notes: txt, continuity: payload.meta.session_continuity, time: payload.meta.local_time }
  }
}

module.exports = { sendStructuredRequest }
