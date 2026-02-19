const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:3001');

ws.on('open', function open() {
  console.log('Connected');
});

ws.on('message', function incoming(data) {
  const msg = data.toString();
  console.log('Received:', msg);
  
  try {
    const parsed = JSON.parse(msg);
    if (parsed.type === 'memory_status') {
        // Initial status, send query
        console.log('Memory status:', parsed.status);
        
        // Wait a bit to ensure server is ready
        setTimeout(() => {
            const payload = JSON.stringify({
                session_id: "test-recall-verify-" + Date.now(),
                message: "Please summarize what you know about me based on your memory."
            });
            console.log('Sending:', payload);
            ws.send(payload);
        }, 1000);
    } else if (parsed.response) {
        // This is the answer
        console.log('-----------------------------------');
        console.log('AGENT RESPONSE:', parsed.response);
        console.log('-----------------------------------');
        process.exit(0);
    }
  } catch (e) {
    console.log('Error parsing:', e.message);
  }
});

ws.on('error', function error(err) {
    console.log('Error:', err.message);
    process.exit(1);
});
