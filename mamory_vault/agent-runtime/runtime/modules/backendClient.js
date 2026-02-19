const axios = require("axios")
const { log } = require("../utils/logger")

function client(cfg) {
  return axios.create({
    baseURL: cfg.BACKEND_URL,
    timeout: 15000,
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "Authorization": `Bearer ${cfg.BACKEND_API_KEY}`
    }
  })
}

function timeClient(cfg) {
  return axios.create({
    baseURL: cfg.BACKEND_URL,
    timeout: 15000,
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "Authorization": `Bearer ${cfg.TIME_API_KEY}`
    }
  })
}

async function fetchStatus(cfg) {
  const c = timeClient(cfg)
  const res = await c.get("/api/time/status")
  log("status_fetch_ok")
  return res.data
}

async function postResponse(cfg, body) {
  const c = client(cfg)
  try {
    const res = await c.post("/api/agent/response", body)
    log("response_post_ok")
    return res.data
  } catch (err) {
    const status = err && err.response && err.response.status
    const aiPayload = typeof body.ai_response === "string" ? body.ai_response : JSON.stringify(body.ai_response)
    const memoryBody = {
      context_tag: body.thread_marker || "agent",
      immutable: true,
      content: aiPayload
    }
    try {
      const res = await c.post("/api/memory", memoryBody)
      log("response_post_memory_ok")
      return res.data
    } catch (memErr) {
      const memStatus = memErr && memErr.response && memErr.response.status
      throw new Error(`response_post_failed:${status || "unknown"}; memory_post_failed:${memStatus || "unknown"}`)
    }
  }
}

module.exports = { fetchStatus, postResponse }