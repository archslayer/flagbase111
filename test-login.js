// Login sistemi test scripti
// Browser console'da çalıştırılacak

console.log('🧪 FlagWars Login Test Started');

// Test 1: Sayfa yüklendi mi?
console.log('✅ Test 1: Page loaded');

// Test 2: ConnectAndLogin component var mı?
const connectButton = document.querySelector('button');
if (connectButton) {
  console.log('✅ Test 2: Connect button found');
  console.log('Button text:', connectButton.textContent);
} else {
  console.log('❌ Test 2: Connect button not found');
}

// Test 3: Wallet connection test
async function testWalletConnection() {
  console.log('🔍 Test 3: Testing wallet connection...');
  
  if (typeof window.ethereum !== 'undefined') {
    console.log('✅ MetaMask detected');
    
    try {
      // Wallet connection test
      const accounts = await window.ethereum.request({ 
        method: 'eth_requestAccounts' 
      });
      
      if (accounts.length > 0) {
        console.log('✅ Wallet connected:', accounts[0]);
        return accounts[0];
      } else {
        console.log('❌ No accounts found');
        return null;
      }
    } catch (error) {
      console.log('❌ Wallet connection failed:', error.message);
      return null;
    }
  } else {
    console.log('❌ MetaMask not detected');
    return null;
  }
}

// Test 4: Login flow test
async function testLoginFlow() {
  console.log('🔍 Test 4: Testing login flow...');
  
  const address = await testWalletConnection();
  if (!address) {
    console.log('❌ Cannot test login without wallet connection');
    return;
  }
  
  try {
    // Test nonce API
    const nonceResponse = await fetch('/api/auth/nonce', { 
      credentials: 'include' 
    });
    
    if (nonceResponse.ok) {
      const { nonce } = await nonceResponse.json();
      console.log('✅ Nonce API working:', nonce);
      
      // Test message signing
      const message = `FlagWars Login
Address: ${address.toLowerCase()}
Nonce: ${nonce}
URI: ${location.origin}
Chain: 84532`;
      
      console.log('📝 Message to sign:', message);
      
      // Test signature
      const signature = await window.ethereum.request({
        method: 'personal_sign',
        params: [message, address]
      });
      
      console.log('✅ Signature successful:', signature.substring(0, 10) + '...');
      
      // Test verify API
      const verifyResponse = await fetch('/api/auth/verify', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          wallet: address.toLowerCase(), 
          message, 
          signature 
        }),
      });
      
      if (verifyResponse.ok) {
        console.log('✅ Login verification successful');
        console.log('🎉 All tests passed!');
      } else {
        const error = await verifyResponse.json().catch(() => ({}));
        console.log('❌ Login verification failed:', error);
      }
      
    } else {
      console.log('❌ Nonce API failed:', nonceResponse.status);
    }
    
  } catch (error) {
    console.log('❌ Login flow test failed:', error.message);
  }
}

// Test 5: Error handling test
async function testErrorHandling() {
  console.log('🔍 Test 5: Testing error handling...');
  
  try {
    // Test with invalid signature
    const invalidResponse = await fetch('/api/auth/verify', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        wallet: '0x1234567890123456789012345678901234567890', 
        message: 'invalid message', 
        signature: 'invalid signature' 
      }),
    });
    
    if (!invalidResponse.ok) {
      console.log('✅ Error handling working - invalid signature rejected');
    } else {
      console.log('❌ Error handling failed - invalid signature accepted');
    }
    
  } catch (error) {
    console.log('✅ Error handling working:', error.message);
  }
}

// Run all tests
async function runAllTests() {
  console.log('🚀 Starting comprehensive login tests...');
  
  await testWalletConnection();
  await testLoginFlow();
  await testErrorHandling();
  
  console.log('🏁 All tests completed!');
}

// Export for manual testing
window.testLogin = runAllTests;
window.testWalletConnection = testWalletConnection;
window.testLoginFlow = testLoginFlow;
window.testErrorHandling = testErrorHandling;

console.log('📋 Available test functions:');
console.log('- testLogin() - Run all tests');
console.log('- testWalletConnection() - Test wallet connection');
console.log('- testLoginFlow() - Test complete login flow');
console.log('- testErrorHandling() - Test error handling');
console.log('');
console.log('💡 Run testLogin() to start comprehensive testing');
