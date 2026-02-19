const fs = require("fs")
const path = require("path")
const logPath = path.resolve(__dirname, "..", "runtime.log")
function stamp() { return new Date().toISOString() }
function appendLine(level, ev, msg) {
  try { fs.appendFileSync(logPath, JSON.stringify({ ts: stamp(), level, ev, msg: msg || "" }) + "\n") } catch (_) {}
}
function log(ev) {
  console.log(stamp(), "INFO", ev)
  appendLine("INFO", ev)
}
function warn(ev) {
  console.warn(stamp(), "WARN", ev)
  appendLine("WARN", ev)
}
function error(ev, msg) {
  console.error(stamp(), "ERROR", ev, msg || "")
  appendLine("ERROR", ev, msg)
}
module.exports = { log, warn, error }
