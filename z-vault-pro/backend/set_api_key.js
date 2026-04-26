const { execSync } = require('child_process');

function setSecret(key, val) {
  try {
    console.log(`Setting ${key}...`);
    execSync(`npx wrangler secret put ${key}`, { input: val, stdio: 'pipe' });
    console.log(`✅ ${key} set successfully.`);
  } catch (err) {
    console.error(`❌ Failed to set ${key}:`, err.message);
  }
}

setSecret('TRONGRID_API_KEY', '464bdc25-956d-40b5-8065-743ddd8c63f8');
