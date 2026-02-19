const axios = require("axios")
const { log, warn } = require("../utils/logger")

async function fetchMemory(cfg) {
  try {
    const client = axios.create({
      baseURL: cfg.BACKEND_URL,
      timeout: 15000,
      headers: {
        "Accept": "application/json",
        "Authorization": `Bearer ${cfg.MEMORY_API_TOKEN}`
      }
    })
    const limit = cfg.MEMORY_LIMIT || 20
    const res = await client.get(`/api/agent-memory?limit=${limit}`)
    const items = res && res.data && res.data.data ? res.data.data : []
    log("memory_fetch_ok")
    return Array.isArray(items) ? items : []
  } catch (e) {
    const status = e && e.response && e.response.status
    warn(`memory_fetch_failed_${status || "unknown"}`)
    return []
  }
}

async function storeMemory(cfg, content) {
  try {
    const client = axios.create({
      baseURL: cfg.BACKEND_URL,
      timeout: 15000,
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": `Bearer ${cfg.MEMORY_API_TOKEN}`
      }
    })
    const body = {
        content: content,
        source: 'agent',
        context_tag: 'response'
    }
    const res = await client.post("/api/agent-memory", body)
    if (res && res.status >= 200 && res.status < 300) {
        log("memory_store_ok")
        return true
    }
    return false
  } catch (e) {
    const status = e && e.response && e.response.status
    warn(`memory_store_failed_${status || "unknown"}`)
    return false
  }
}

module.exports = { fetchMemory, storeMemory }