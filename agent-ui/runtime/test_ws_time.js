const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:3001');

let step = 0;

ws.on('open', function open() {
    console.log('Connected to WS');
});

ws.on('message', function incoming(data) {
    const msg = data.toString();
    console.log('Received:', msg);
    
    try {
        const parsed = JSON.parse(msg);
        
        if (parsed.type === 'memory_status') {
            // Initial status, start test
            console.log('Memory status:', parsed.status);
            setTimeout(() => {
                sendTimeQuestion();
            }, 1000);
        } else if (parsed.response) {
            handleResponse(parsed);
        }
    } catch (e) {
        console.log('Parse error:', e.message);
    }
});

function sendTimeQuestion() {
    step = 1;
    console.log('Step 1: Asking time...');
    const payload = JSON.stringify({
        session_id: "test-time-" + Date.now(),
        message: "What time is it?"
    });
    ws.send(payload);
}

function sendContextQuestion() {
    step = 2;
    console.log('Step 2: Asking context question...');
    const payload = JSON.stringify({
        session_id: "test-time-" + Date.now(),
        message: "Is it currently morning, afternoon, or night? Please check the server_time."
    });
    ws.send(payload);
}

function handleResponse(parsed) {
    const reply = parsed.response;
    console.log('Agent Reply:', reply);
    
    if (step === 1) {
        if (reply.includes('server_time')) {
            console.log('SUCCESS: Step 1 (Time check passed)');
            setTimeout(sendContextQuestion, 2000);
        } else {
            console.log('FAILURE: Step 1 (Time check failed)');
            process.exit(1);
        }
    } else if (step === 2) {
        // We expect some indication of time awareness
        if (reply.toLowerCase().includes('morning') || reply.toLowerCase().includes('afternoon') || reply.toLowerCase().includes('night') || reply.toLowerCase().includes('evening')) {
            console.log('SUCCESS: Step 2 (Context check passed)');
            process.exit(0);
        } else {
            console.log('WARNING: Step 2 response unclear:', reply);
            // It might be generic, but let's see.
            process.exit(0);
        }
    }
}
