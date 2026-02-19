function nowIso() {
  return new Date().toISOString()
}
function computeDriftMs(serverIso, localIso) {
  const s = new Date(serverIso).getTime()
  const l = new Date(localIso).getTime()
  return isFinite(s) && isFinite(l) ? l - s : 0
}
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}
module.exports = { nowIso, computeDriftMs, sleep }