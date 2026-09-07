/**
 * Analyze response timing from Vapi call data
 * Calculates time between user messages and assistant responses
 */

const http = require('http');

http.get('http://127.0.0.1:4040/api/requests/http', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const json = JSON.parse(data);

      // Find end-of-call-report
      const endOfCallRequest = json.requests.find(req => {
        if (req.request.uri === '/webhooks/vapi') {
          try {
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
        console.log('❌ No end-of-call-report found');
        return;
      }

      const raw = Buffer.from(endOfCallRequest.request.raw, 'base64').toString('utf-8');
      const bodyMatch = raw.match(/\r\n\r\n([\s\S]+)$/);
      const webhook = JSON.parse(bodyMatch[1]);
      const msg = webhook.message;

      console.log('═══════════════════════════════════════════════════════');
      console.log('         RESPONSE TIMING ANALYSIS');
      console.log('═══════════════════════════════════════════════════════\n');
      console.log(`📞 Call ID: ${msg.call.id}`);
      console.log(`📅 Duration: ${msg.durationSeconds}s (${msg.durationMinutes.toFixed(2)} min)\n`);

      // Calculate response times
      const messages = msg.messages;
      const responseTimes = [];
      let lastUserTime = null;

      console.log('⏱️  RESPONSE TIMING BREAKDOWN:\n');
      console.log('Time | Role     | Response Time | Message Preview');
      console.log('─'.repeat(80));

      messages.forEach((m, i) => {
        const time = m.secondsFromStart || 0;
        const role = m.role === 'bot' ? 'AI      ' : m.role === 'user' ? 'USER    ' : 'SYSTEM  ';
        const preview = (m.message || '').substring(0, 50).replace(/\n/g, ' ');

        if (m.role === 'user') {
          lastUserTime = time;
          console.log(`${time.toFixed(1).padStart(5)}s | ${role} | ${' '.repeat(13)} | ${preview}`);
        } else if (m.role === 'bot' && lastUserTime !== null) {
          const responseTime = time - lastUserTime;
          responseTimes.push(responseTime);
          
          // Color code based on response time
          let timeStr = `${responseTime.toFixed(1)}s`;
          if (responseTime > 5) {
            timeStr = `🔴 ${timeStr.padStart(10)} (SLOW!)`;
          } else if (responseTime > 3) {
            timeStr = `🟡 ${timeStr.padStart(10)} (Moderate)`;
          } else {
            timeStr = `🟢 ${timeStr.padStart(10)} (Good)`;
          }
          
          console.log(`${time.toFixed(1).padStart(5)}s | ${role} | ${timeStr} | ${preview}`);
          lastUserTime = null; // Reset for next pair
        } else {
          console.log(`${time.toFixed(1).padStart(5)}s | ${role} | ${' '.repeat(13)} | ${preview}`);
        }
      });

      // Statistics
      if (responseTimes.length > 0) {
        const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
        const minResponseTime = Math.min(...responseTimes);
        const maxResponseTime = Math.max(...responseTimes);
        const slowResponses = responseTimes.filter(t => t > 5).length;
        const moderateResponses = responseTimes.filter(t => t > 3 && t <= 5).length;
        const fastResponses = responseTimes.filter(t => t <= 3).length;

        console.log('\n' + '═'.repeat(80));
        console.log('📊 TIMING STATISTICS:');
        console.log('═'.repeat(80));
        console.log(`Total Responses: ${responseTimes.length}`);
        console.log(`Average Response Time: ${avgResponseTime.toFixed(2)}s`);
        console.log(`Fastest Response: ${minResponseTime.toFixed(2)}s`);
        console.log(`Slowest Response: ${maxResponseTime.toFixed(2)}s`);
        console.log(`\n🟢 Fast (≤3s): ${fastResponses} (${((fastResponses/responseTimes.length)*100).toFixed(1)}%)`);
        console.log(`🟡 Moderate (3-5s): ${moderateResponses} (${((moderateResponses/responseTimes.length)*100).toFixed(1)}%)`);
        console.log(`🔴 Slow (>5s): ${slowResponses} (${((slowResponses/responseTimes.length)*100).toFixed(1)}%)`);

        // Performance metrics from Vapi
        if (msg.performanceMetrics) {
          console.log('\n' + '═'.repeat(80));
          console.log('⚡ VAPI PERFORMANCE METRICS:');
          console.log('═'.repeat(80));
          const perf = msg.performanceMetrics;
          console.log(`Model Latency (avg): ${perf.modelLatencyAverage}ms`);
          console.log(`Voice Latency (avg): ${perf.voiceLatencyAverage}ms`);
          console.log(`Transcriber Latency (avg): ${perf.transcribeLatencyAverage}ms`);
          console.log(`Turn Latency (avg): ${perf.turnLatencyAverage}ms`);
        }

        // Recommendations
        console.log('\n' + '═'.repeat(80));
        console.log('💡 RECOMMENDATIONS:');
        console.log('═'.repeat(80));
        if (avgResponseTime > 5) {
          console.log('🔴 CRITICAL: Average response time is too slow (>5s)');
          console.log('   - Check LLM latency (should be <2s for Gemini Flash)');
          console.log('   - Review RAG search duration (should be <500ms)');
          console.log('   - Check intent classification speed (should be <1s)');
          console.log('   - Consider optimizing database queries');
        } else if (avgResponseTime > 3) {
          console.log('🟡 WARNING: Response time is moderate (3-5s)');
          console.log('   - Could be improved by optimizing slow components');
          console.log('   - Check for sequential operations that could be parallelized');
        } else {
          console.log('🟢 GOOD: Response times are acceptable (≤3s)');
          console.log('   - Continue monitoring for consistency');
        }
      }

      console.log('\n' + '═'.repeat(80) + '\n');

    } catch (error) {
      console.error('Error:', error.message);
      console.error(error.stack);
    }
  });
}).on('error', err => {
  console.error('Error fetching ngrok data:', err.message);
});
