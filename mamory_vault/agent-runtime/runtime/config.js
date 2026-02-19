const { loadEnv } = require("./utils/env")
const env = loadEnv()
const mode = String(env.MODE || env.NODE_ENV || "local").toLowerCase()
const defaultBackend =
  mode === "production"
    ? "https://midnightswitchboard.net"
    : "http://127.0.0.1:8000"
const cfg = {
  BACKEND_URL: (env.BACKEND_URL || defaultBackend),
  BACKEND_API_KEY: env.BACKEND_API_KEY,
  TIME_API_KEY: env.TIME_API_KEY,
  OPENAI_API_KEY: env.OPENAI_API_KEY,
  POLL_INTERVAL_MS: Number(env.POLL_INTERVAL_MS || 3000),
  MEMORY_API_TOKEN: env.MEMORY_API_TOKEN,
  MEMORY_LIMIT: Number(env.MEMORY_LIMIT || 20),
  OFFLINE: String(env.OFFLINE || "false").toLowerCase() === "true"
}
if (!cfg.BACKEND_URL || !cfg.BACKEND_API_KEY || !cfg.OPENAI_API_KEY || !cfg.TIME_API_KEY) {
  throw new Error("Missing required environment variables")
}
module.exports = cfg
