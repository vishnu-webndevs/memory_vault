const { fetchStatus } = require("./modules/backendClient")
const { fetchMemory, storeMemory } = require("./modules/memoryClient")
const { sendStructuredRequest } = require("./modules/openaiClient")
const { nowIso, computeDriftMs, sleep } = require("./utils/time")
const { log, warn, error } = require("./utils/logger")
const { setState } = require("./utils/state")
const axios = require("axios")

async function cycle(cfg) {
  const status = await fetchStatus(cfg)
  const local_time = nowIso()
  const server_time = status.server_time
  const drift_ms = computeDriftMs(server_time, local_time)
  const continuity = status.session_continuity
  const restart_detected = status.restart_detected
  const restart_info = status.restart_info
  const vault_status = status.vault_status
  const thread_marker = status.thread_marker || "agent"

  let memoryBlock = ""
  if (!cfg.MEMORY_API_TOKEN) {
    warn("memory_disabled")
  } else {
    const items = await fetchMemory(cfg)
    if (!items || items.length === 0) {
      warn("memory_empty")
    } else {
      const sorted = [...items].sort((a, b) => {
        const ta = new Date(a.timestamp).getTime()
        const tb = new Date(b.timestamp).getTime()
        return tb - ta
      })
      const limited = sorted.slice(0, cfg.MEMORY_LIMIT || 20)
      const lines = limited.map(it => `- [${it.timestamp}] ${it.content}`)
      let block = `<context name="memory_vault">\n${lines.join("\n")}\n</context>`
      if (block.length > 6000) {
        let keep = lines.length
        while (keep > 0) {
          const candidate = `<context name="memory_vault">\n${lines.slice(0, keep).join("\n")}\n</context>`
          if (candidate.length <= 6000) { block = candidate; break }
          keep -= 1
        }
        warn("memory_trimmed")
      }
      memoryBlock = block
      log("memory_injected")
    }
  }

  const payload = {
    meta: {
      server_time,
      local_time,
      drift_ms,
      vault_status,
      session_continuity: continuity,
      restart_detected,
      restart_info,
      thread_marker
    },
    directives: {
      identity_lock: true
    }
  }

  try {
    const ai = await sendStructuredRequest(cfg, payload, memoryBlock)
    log("openai_ok")

    if (ai && ai.notes && typeof ai.notes === "string" && ai.notes.length > 5) {
      // Store significant thoughts/notes as memory, filtering out generic spam
      const lower = ai.notes.toLowerCase();
      if (
          !lower.includes('identity lock enabled') &&
          !lower.includes('no new information') &&
          !lower.includes('maintaining identity')
      ) {
          await storeMemory(cfg, ai.notes)
      }
    }

    try {
      const client = axios.create({
        baseURL: cfg.BACKEND_URL,
        timeout: 15000,
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Authorization": `Bearer ${cfg.TIME_API_KEY}`
        }
      })
      const resultText = typeof ai === "string" ? ai : (ai && ai.notes ? ai.notes : JSON.stringify(ai))
      const body = {
        thread_marker,
        run_id: thread_marker,
        response: [resultText],
        server_time,
        drift: String(drift_ms),
        restart_detected,
        session_continuity: continuity
      }
      const res = await client.post("/api/agent/response", body)
      if (res && res.status >= 200 && res.status < 300) {
        log("response_post_ok")
      } else {
        warn(`response_post_failed_${res && res.status ? res.status : "unknown"}`)
      }
    } catch (e) {
      const status = e && e.response && e.response.status
      const details = e && e.response && e.response.data ? JSON.stringify(e.response.data) : ""
      warn(`response_post_failed_${status || "unknown"}`)
      if (details) error("response_post_failed_detail", details)
    }
  } catch (e) {
    warn("openai_failed")
  }
  await setState({ last_cycle_at: local_time, last_server_time: server_time, thread_marker })
  
}

async function agentLoop(cfg) {
  while (true) {
    try {
      await cycle(cfg)
    } catch (e) {
      warn("cycle_error")
      const msg = (e && e.response && (e.response.status + " " + (e.response.statusText || ""))) || (e && e.message) || String(e)
      error("cycle_error_detail", msg)
    }
    await sleep(cfg.POLL_INTERVAL_MS)
  }
}

module.exports = { agentLoop }