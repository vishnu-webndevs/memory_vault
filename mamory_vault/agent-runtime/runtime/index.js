const cfg = require("./config")
const { log, error } = require("./utils/logger")
const { initState, markStart } = require("./utils/state")
const { agentLoop } = require("./agentLoop")

process.on("uncaughtException", e => error("uncaughtException", e.message))
process.on("unhandledRejection", e => error("unhandledRejection", String(e)))
process.on("SIGINT", () => process.exit(0))
process.on("SIGTERM", () => process.exit(0))

async function main() {
  await initState()
  await markStart()
  log("runtime_start")
  if (process.env.SELF_TEST === "true") {
    try {
      const { runSelfTest } = require("./selfTest")
      await runSelfTest(agentLoop, cfg)
    } catch (e) {
      error("self_test_error", e.message || String(e))
      await agentLoop(cfg)
    }
  } else {
    await agentLoop(cfg)
  }
}
main()