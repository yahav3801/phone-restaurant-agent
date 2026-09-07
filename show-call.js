const http = require('http');

http.get('http://127.0.0.1:4040/api/requests/http', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const json = JSON.parse(data);

    // Find the end-of-call-report webhook
    const endOfCallRequest = json.requests.find(req => {
      if (req.request.uri === '/webhooks/vapi') {
        try {
          // Decode base64 raw request
          const raw = Buffer.from(req.request.raw, 'base64').toString('utf-8');
          const bodyMatch = raw.match(/\r\n\r\n([\s\S]+)$/);
          if (bodyMatch) {
            const body = JSON.parse(bodyMatch[1]);
            return body.message && body.message.type === 'end-of-call-report';
          }
        } catch(e) { return false; }
      }
      return false;
    });

    if (!endOfCallRequest) {
      console.log('No end-of-call-report found in ngrok logs');
      return;
    }

    // Extract body from raw base64 encoded request
    const raw = Buffer.from(endOfCallRequest.request.raw, 'base64').toString('utf-8');
    const bodyMatch = raw.match(/\r\n\r\n([\s\S]+)$/);
    const webhook = JSON.parse(bodyMatch[1]);
    const msg = webhook.message;

    console.log('═══════════════════════════════════════════════════════');
    console.log('         VAPI CALL - END OF CALL REPORT');
    console.log('═══════════════════════════════════════════════════════\n');

    console.log('📞 CALL INFO:');
    console.log('   Call ID:', msg.call.id);
    console.log('   Customer:', msg.customer.number);
    console.log('   Started:', msg.startedAt);
    console.log('   Ended:', msg.endedAt);
    console.log('   Duration:', msg.durationSeconds + 's (' + msg.durationMinutes.toFixed(2) + ' min)');
    console.log('   End Reason:', msg.endedReason);
    console.log('   Cost: $' + msg.cost.toFixed(4));

    console.log('\n💬 CONVERSATION:\n');
    console.log(msg.transcript);

    console.log('\n📊 DETAILED MESSAGES:\n');
    msg.messages.forEach((m, i) => {
      const role = m.role === 'bot' ? '🤖 AI' : m.role === 'user' ? '👤 USER' : '⚙️  SYSTEM';
      const time = m.secondsFromStart !== undefined ? ` [${m.secondsFromStart}s]` : '';
      console.log(`${role}${time}:`);
      console.log(`   ${m.message}\n`);
    });

    console.log('💰 COST BREAKDOWN:');
    console.log('   STT (Speech-to-Text):  $' + msg.costBreakdown.stt.toFixed(4));
    console.log('   LLM (Language Model):  $' + msg.costBreakdown.llm.toFixed(4));
    console.log('   TTS (Text-to-Speech):  $' + msg.costBreakdown.tts.toFixed(4));
    console.log('   Vapi Platform:         $' + msg.costBreakdown.vapi.toFixed(4));
    console.log('   ────────────────────────────────────');
    console.log('   TOTAL:                 $' + msg.costBreakdown.total.toFixed(4));

    console.log('\n📈 TOKENS & USAGE:');
    console.log('   Prompt tokens:     ', msg.costBreakdown.llmPromptTokens);
    console.log('   Completion tokens: ', msg.costBreakdown.llmCompletionTokens);
    console.log('   TTS characters:    ', msg.costBreakdown.ttsCharacters);

    if (msg.performanceMetrics) {
      console.log('\n⚡ PERFORMANCE METRICS:');
      const perf = msg.performanceMetrics;
      console.log('   Model latency (avg):       ' + perf.modelLatencyAverage + 'ms');
      console.log('   Voice latency (avg):       ' + perf.voiceLatencyAverage + 'ms');
      console.log('   Transcriber latency (avg): ' + perf.transcribeLatencyAverage + 'ms');
      console.log('   Turn latency (avg):        ' + perf.turnLatencyAverage + 'ms');
    }

    console.log('\n═══════════════════════════════════════════════════════\n');
  });
}).on('error', err => {
  console.error('Error:', err.message);
});
