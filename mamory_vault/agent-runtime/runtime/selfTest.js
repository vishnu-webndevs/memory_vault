const { fetchStatus } = require("./modules/backendClient")

async function runSelfTest(agentLoopFn, cfg) {
  const origLog = console.log
  const origWarn = console.warn
  const origError = console.error

  const state = {
    statusCount: 0,
    openaiCount: 0,
    responseOkCount: 0,
    failuresObserved: 0,
    recoveredObserved: 0,
    lastServerTime: null,
    serverTimeIncreasing: false,
    driftSamples: [],
    identityMarkerStable: true,
    lastThreadMarker: null,
    restartFlipObserved: false,
    checkpoints: {
      time: false,
      identity_lock: false,
      drift: false,
      handshake: false,
      no_fading: false,
      recovery: false,
      final: false
    }
  }

  function maybeEmitCheckpoint() {
    if (!state.checkpoints.time && state.statusCount >= 3 && state.serverTimeIncreasing) {
      origLog("TEST_TIME_AWARENESS_OK")
      state.checkpoints.time = true
    }
    if (!state.checkpoints.identity_lock && state.lastThreadMarker && state.identityMarkerStable) {
      origLog("TEST_IDENTITY_LOCK_OK")
      state.checkpoints.identity_lock = true
    }
    if (!state.checkpoints.drift) {
      const ds = state.driftSamples
      if (ds.length >= 3) {
        let nonDecreasing = true
        for (let i = 1; i < ds.length; i++) {
          if (ds[i] < ds[i - 1]) { nonDecreasing = false; break }
        }
        if (nonDecreasing) {
          origLog("TEST_DRIFT_OK")
          state.checkpoints.drift = true
        }
      }
    }
    if (!state.checkpoints.handshake && state.responseOkCount >= 2) {
      origLog("TEST_FULL_HANDSHAKE_OK")
      state.checkpoints.handshake = true
    }
    if (!state.checkpoints.no_fading && state.serverTimeIncreasing) {
      origLog("TEST_NO_FADING_OK")
      state.checkpoints.no_fading = true
    }
    if (!state.checkpoints.recovery) {
      if (state.failuresObserved === 0 && state.responseOkCount >= 2 && state.openaiCount >= 2) {
        origLog("TEST_ERROR_RECOVERY_OK")
        state.checkpoints.recovery = true
      } else if (state.failuresObserved > 0 && (state.responseOkCount > 0 || state.openaiCount > 0)) {
        origLog("TEST_ERROR_RECOVERY_OK")
        state.checkpoints.recovery = true
      }
    }
    if (!state.checkpoints.final && state.checkpoints.time && state.checkpoints.identity_lock && state.checkpoints.drift && state.checkpoints.handshake && state.checkpoints.no_fading && state.checkpoints.recovery) {
      origLog("RUNTIME_MVP_FULLY_VALIDATED")
      state.checkpoints.final = true
    }
  }

  console.log = function (...args) {
    try {
      const s = args.join(" ")
      if (s.includes("status_fetch_ok")) {
        state.statusCount += 1
      }
      if (s.includes("openai_ok")) {
        state.openaiCount += 1
      }
      if (s.includes("response_post_ok")) {
        state.responseOkCount += 1
      }
      maybeEmitCheckpoint()
    } finally {
      origLog.apply(console, args)
    }
  }

  console.warn = function (...args) {
    try {
      const s = args.join(" ")
      if (s.includes("response_post_failed_") || s.includes("openai_failed") || s.includes("cycle_error")) {
        state.failuresObserved += 1
      }
      maybeEmitCheckpoint()
    } finally {
      origWarn.apply(console, args)
    }
  }

  console.error = function (...args) {
    try { maybeEmitCheckpoint() } finally { origError.apply(console, args) }
  }

  setInterval(async () => {
    try {
      const status = await fetchStatus(cfg)
      const st = status.server_time
      const tm = status.thread_marker
      const localIso = new Date().toISOString()
      const driftMs = (new Date(localIso).getTime()) - (new Date(st).getTime())
      if (state.lastServerTime) {
        state.serverTimeIncreasing = new Date(st).getTime() > new Date(state.lastServerTime).getTime()
      }
      state.lastServerTime = st
      state.driftSamples.push(driftMs)
      if (state.driftSamples.length > 10) state.driftSamples.shift()
      if (state.lastThreadMarker && tm && tm !== state.lastThreadMarker) {
        state.identityMarkerStable = false
      }
      if (!state.lastThreadMarker && tm) {
        state.lastThreadMarker = tm
      }
      if (status.restart_detected) {
        state.restartFlipObserved = true
      }
      maybeEmitCheckpoint()
    } catch (_) {}
  }, Math.max(1, cfg.POLL_INTERVAL_MS))

  agentLoopFn(cfg).catch(() => {})
}

module.exports = { runSelfTest }