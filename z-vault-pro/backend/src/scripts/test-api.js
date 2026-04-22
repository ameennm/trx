const BASE_URL = 'http://127.0.0.1:8787';
const TEST_ADDRESS = 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf'; // Example address

async function runTests() {
  console.log('🚀 Starting Z-Vault Pro API Test Suite...');
  
  const testEndpoint = async (name, path) => {
    console.log(`\n--- ${name} ---`);
    try {
      const res = await fetch(`${BASE_URL}${path}`);
      const data = await res.json();
      console.log('Status:', res.status);
      if (res.ok && data.success !== false) {
        console.log('✅ Success!');
        console.log('Data:', JSON.stringify(data, null, 2).substring(0, 200) + '...');
      } else {
        console.error('❌ Failed:', data.error || 'Unknown error');
      }
    } catch (err) {
      console.error('💥 Request failed:', err.message);
    }
  };

  await testEndpoint('1. Health Check', '/api/health');
  await testEndpoint('2. Token Config (Proxy)', '/api/config/tokens');
  await testEndpoint('3. User Nonce (Proxy)', '/api/nonce/' + TEST_ADDRESS);
  await testEndpoint('4. Transaction History', '/api/history/' + TEST_ADDRESS);

  console.log('\n🎉 All core GET tests completed.');
}

runTests();
