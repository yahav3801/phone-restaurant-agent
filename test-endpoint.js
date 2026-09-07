const axios = require('axios');

async function testEndpoint() {
  try {
    console.log('Testing /v1/chat/completions endpoint...');
    const response = await axios.post('http://localhost:8000/v1/chat/completions', {
      messages: [
        { role: 'user', content: 'test' }
      ],
      model: 'gemini-flash-latest',
      stream: false
    }, {
      timeout: 10000
    });

    console.log('✅ Success!');
    console.log('Response:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.log('❌ Error!');
    console.log('Message:', error.message);
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Data:', error.response.data);
    }
    console.log('Stack:', error.stack);
  }
}

testEndpoint();
