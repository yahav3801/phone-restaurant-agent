const fs = require('fs');

const data = fs.readFileSync(0, 'utf-8');
const json = JSON.parse(data);

if (json.requests && json.requests.length > 0) {
  const latest = json.requests[0];
  const body = JSON.parse(latest.request.body);

  console.log('=== VAPI WEBHOOK - END OF CALL REPORT ===\n');
  console.log('Call ID:', body.message.call.id);
  console.log('Type:', body.message.type);
  console.log('Started:', body.message.startedAt);
  console.log('Ended:', body.message.endedAt);
  console.log('Duration:', body.message.durationSeconds, 'seconds');
  console.log('Ended Reason:', body.message.endedReason);
  console.log('Cost: $' + body.message.cost);

  console.log('\n=== CONVERSATION TRANSCRIPT ===\n');
  console.log(body.message.transcript);

  console.log('\n=== DETAILED MESSAGES ===');
  body.message.messages.forEach((msg, i) => {
    const roleLabel = msg.role.toUpperCase();
    const timeLabel = msg.secondsFromStart ? `${msg.secondsFromStart}s` : '0s';
    console.log(`\n[${i+1}] ${roleLabel} (${timeLabel}):`);
    console.log(msg.message);
  });

  console.log('\n=== COST BREAKDOWN ===');
  console.log('STT (Speech-to-Text): $' + body.message.costBreakdown.stt);
  console.log('LLM (Language Model): $' + body.message.costBreakdown.llm);
  console.log('TTS (Text-to-Speech): $' + body.message.costBreakdown.tts);
  console.log('Vapi Platform: $' + body.message.costBreakdown.vapi);
  console.log('Total: $' + body.message.costBreakdown.total);

  console.log('\n=== TOKENS ===');
  console.log('Prompt tokens:', body.message.costBreakdown.llmPromptTokens);
  console.log('Completion tokens:', body.message.costBreakdown.llmCompletionTokens);
  console.log('TTS characters:', body.message.costBreakdown.ttsCharacters);

  console.log('\n=== PERFORMANCE ===');
  console.log('Model latency avg:', body.message.performanceMetrics.modelLatencyAverage + 'ms');
  console.log('Voice latency avg:', body.message.performanceMetrics.voiceLatencyAverage + 'ms');
  console.log('Turn latency avg:', body.message.performanceMetrics.turnLatencyAverage + 'ms');
} else {
  console.log('No requests found');
}
