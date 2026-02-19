const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:3001');

ws.on('open', function open() {
  console.log('Connected');
});

let step = 0;

ws.on('message', function incoming(data) {
  const msg = data.toString();
  // console.log('Received:', msg);

  try {
    const parsed = JSON.parse(msg);
    if (parsed.type === 'memory_status') {
        console.log('Memory status:', parsed.status);
        if (step === 0) {
            step = 1;
            // Send a unique fact that isn't hardcoded in regex
            const payload = JSON.stringify({
                session_id: "test-continuity-" + Date.now(),
                message: "I am planning a surprise party for Alice on Friday."
            });
            console.log('Sending Step 1:', payload);
            ws.send(payload);
        }
    } else if (parsed.response) {
        console.log('AGENT RESPONSE:', parsed.response);
        
        if (step === 1) {
            step = 2;
            console.log('Waiting for memory write...');
            setTimeout(() => {
                const payload = JSON.stringify({
                    session_id: "test-continuity-" + Date.now(), // Different session ID? 
                    // Wait, if I use different session ID, I rely on GLOBAL memory (Vault).
                    // The user wants "cross-session persistence".
                    // But fetchMemory fetches from /api/agent-memory which is user-scoped (via Token).
                    // So session_id doesn't matter for fetching, only for current session state.
                    // Let's use a DIFFERENT session_id to prove it's persistent in Vault, not just RAM.
                    message: "What am I planning for Friday?"
                });
                console.log('Sending Step 2 (New Session):', payload);
                ws.send(payload);
            }, 2000);
        } else if (step === 2) {
            if (parsed.response.toLowerCase().indexOf('alice') !== -1) {
                console.log('SUCCESS: Recall verified across sessions.');
            } else {
                console.log('FAILURE: Recall failed.');
            }
            process.exit(0);
        }
    }
  } catch (e) {
    console.log('Error parsing:', e.message);
  }
});

ws.on('error', function error(err) {
    console.log('Error:', err.message);
    process.exit(1);
});
