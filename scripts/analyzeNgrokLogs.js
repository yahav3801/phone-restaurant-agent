/**
 * Analyze ngrok logs to extract timestamps and identify bottlenecks
 */

const axios = require('axios');

async function analyzeLogs() {
  try {
    const response = await axios.get('http://localhost:4040/api/requests/http');
    const data = response.data;

    if (!data.requests || data.requests.length === 0) {
      console.log('No requests found');
      return;
    }

    // Get the most recent request
    const latest = data.requests[0];
    
    console.log('\n' + '='.repeat(80));
    console.log('TIMING ANALYSIS');
    console.log('='.repeat(80));
    console.log(`Request ID: ${latest.id}`);
    console.log(`Start Time: ${latest.start}`);
    console.log(`Duration: ${(latest.duration / 1000000).toFixed(2)}ms`);
    console.log(`Status: ${latest.response.status}`);

    // Parse the request body if it's a tool call
    try {
      const requestBody = Buffer.from(latest.request.raw, 'base64').toString('utf-8');
      const requestJson = JSON.parse(requestBody);
      
      if (requestJson.message && requestJson.message.type === 'tool-calls') {
        console.log('\n🔧 TOOL CALL DETECTED:');
        if (requestJson.message.toolCalls && requestJson.message.toolCalls.length > 0) {
          requestJson.message.toolCalls.forEach((call, index) => {
            console.log(`\n  Tool Call ${index + 1}:`);
            console.log(`    Function: ${call.function.name}`);
            console.log(`    Arguments: ${JSON.stringify(call.function.arguments, null, 2)}`);
            console.log(`    ID: ${call.id}`);
          });
        }
      }

      // Parse the response
      const responseBody = Buffer.from(latest.response.raw, 'base64').toString('utf-8');
      const responseJson = JSON.parse(responseBody);
      
      if (responseJson.results && responseJson.results.length > 0) {
        console.log('\n✅ TOOL RESPONSE:');
        responseJson.results.forEach((result, index) => {
          console.log(`\n  Result ${index + 1}:`);
          console.log(`    Tool Call ID: ${result.toolCallId}`);
          if (typeof result.result === 'string') {
            console.log(`    Result Type: String (length: ${result.result.length})`);
            // Show first 200 chars
            console.log(`    Preview: ${result.result.substring(0, 200)}...`);
          } else if (Array.isArray(result.result)) {
            console.log(`    Result Type: Array (${result.result.length} items)`);
            if (result.result.length > 0) {
              console.log(`    First item: ${JSON.stringify(result.result[0], null, 2)}`);
            }
          } else {
            console.log(`    Result Type: Object`);
            console.log(`    Keys: ${Object.keys(result.result).join(', ')}`);
          }
        });
      }

    } catch (parseError) {
      console.log('\n⚠️  Could not parse request/response body:', parseError.message);
    }

    // Check if there are artifacts (conversation messages with timestamps)
    if (latest.artifact) {
      try {
        const artifactData = Buffer.from(latest.artifact, 'base64').toString('utf-8');
        const artifact = JSON.parse(artifactData);
        
        if (artifact.messages && artifact.messages.length > 0) {
          console.log('\n' + '='.repeat(80));
          console.log('CONVERSATION TIMELINE');
          console.log('='.repeat(80));
          
          const startTime = artifact.messages[0].time || 0;
          
          artifact.messages.forEach((msg, index) => {
            const relativeTime = ((msg.time - startTime) / 1000).toFixed(2);
            const duration = msg.duration ? (msg.duration / 1000).toFixed(2) : 'N/A';
            
            console.log(`\n[+${relativeTime}s] ${msg.role.toUpperCase()}`);
            if (msg.message) {
              const preview = msg.message.length > 100 ? msg.message.substring(0, 100) + '...' : msg.message;
              console.log(`  Message: ${preview}`);
            }
            if (msg.toolCalls && msg.toolCalls.length > 0) {
              console.log(`  🔧 Tool Calls:`);
              msg.toolCalls.forEach((call) => {
                console.log(`    - ${call.function.name}(${JSON.stringify(call.function.arguments).substring(0, 100)})`);
              });
            }
            if (duration !== 'N/A') {
              console.log(`  Duration: ${duration}ms`);
            }
          });
          
          // Calculate total time and gaps
          if (artifact.messages.length > 1) {
            console.log('\n' + '='.repeat(80));
            console.log('TIMING BREAKDOWN');
            console.log('='.repeat(80));
            
            const totalTime = (artifact.messages[artifact.messages.length - 1].time - startTime) / 1000;
            console.log(`Total Conversation Time: ${totalTime.toFixed(2)}s`);
            
            for (let i = 1; i < artifact.messages.length; i++) {
              const gap = (artifact.messages[i].time - artifact.messages[i - 1].time) / 1000;
              const prevMsg = artifact.messages[i - 1];
              const currMsg = artifact.messages[i];
              
              if (gap > 1) {
                console.log(`\n⏱️  Gap ${i}: ${gap.toFixed(2)}s between:`);
                console.log(`  Previous: ${prevMsg.role} (${prevMsg.message?.substring(0, 50) || 'tool call'}...)`);
                console.log(`  Next: ${currMsg.role} (${currMsg.message?.substring(0, 50) || 'tool call'}...)`);
                
                if (prevMsg.toolCalls && prevMsg.toolCalls.length > 0) {
                  console.log(`  ⚠️  This gap likely includes tool execution time (vector search, DB query, etc.)`);
                }
              }
            }
          }
        }
        
      } catch (artifactError) {
        console.log('\n⚠️  Could not parse artifact:', artifactError.message);
      }
    }

    console.log('\n' + '='.repeat(80) + '\n');

  } catch (error) {
    console.error('Error fetching logs:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('\n❌ Could not connect to ngrok API at http://localhost:4040');
      console.error('   Make sure ngrok is running on port 4040');
    }
  }
}

analyzeLogs();






