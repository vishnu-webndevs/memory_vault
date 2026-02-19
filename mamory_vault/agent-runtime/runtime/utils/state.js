const fs = require("fs")
const path = require("path")
const storePath = path.resolve(process.cwd(), "runtime", "utils", "state.json")

async function initState() {
  try {
    await fs.promises.access(storePath)
  } catch {
    await fs.promises.writeFile(storePath, JSON.stringify({ created_at: new Date().toISOString() }, null, 0))
  }
}

async function markStart() {
  const s = await getState()
  s.last_start_at = new Date().toISOString()
  await setState(s)
}

async function getState() {
  const raw = await fs.promises.readFile(storePath, "utf8")
  return JSON.parse(raw || "{}")
}

async function setState(partial) {
  const current = await getState()
  const next = { ...current, ...partial }
  await fs.promises.writeFile(storePath, JSON.stringify(next, null, 0))
  return next
}

module.exports = { initState, markStart, getState, setState }