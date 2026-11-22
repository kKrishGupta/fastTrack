import { readFile } from 'node:fs/promises';

console.log('=== FaceTrack Screenshot Pipeline Diagnostic ===\n');

// Check .env configuration
try {
  const env = await readFile('D:/desktop/Task3/.env', 'utf8');
  const cloudName = /CLOUDINARY_CLOUD_NAME=(.+)/.exec(env)?.[1]?.trim();
  const apiKey = /CLOUDINARY_API_KEY=(.+)/.exec(env)?.[1]?.trim();
  const apiSecret = /CLOUDINARY_API_SECRET=(.+)/.exec(env)?.[1]?.trim();
  
  console.log('1. Cloudinary Configuration:');
  console.log(`   CLOUDINARY_CLOUD_NAME: ${cloudName ? '? Set' : '? MISSING'}`);
  console.log(`   CLOUDINARY_API_KEY: ${apiKey ? '? Set' : '? MISSING'}`);
  console.log(`   CLOUDINARY_API_SECRET: ${apiSecret ? '? Set' : '? MISSING'}`);
  
  if (!cloudName || !apiKey || !apiSecret) {
    console.log('\n   ??  Screenshot storage requires all three Cloudinary variables.');
    console.log('   Configure them in .env and restart the server.');
  }
} catch (error) {
  console.log('1. Cloudinary Configuration: ? Could not read .env');
}

console.log('\n2. Next steps to verify:');
console.log('   a) Start server: npm run dev');
console.log('   b) Log in as HR ? Activity monitoring');
console.log('   c) Check "Screenshot storage" alert status');
console.log('   d) Enable screenshots in organization policy if available');
console.log('   e) Log in as Employee ? Activity monitoring');
console.log('   f) Grant screenshot consent for enrolled device (if prompted)');
console.log('   g) Check desktop app activity log for "screenshots enabled"');
console.log('   h) Wait for one interval (default: 300 seconds)');
console.log('   i) Check desktop app for "Screenshot was skipped" errors');
console.log('   j) Log in as HR ? scroll to Screenshot Gallery');
console.log('   k) Verify at least one capture appears\n');

console.log('3. Common failure points:');
console.log('   - Device enrolled before Cloudinary configured ? grant consent manually');
console.log('   - screenshotConsentAt missing ? device.screenshotsEnabled stays false');
console.log('   - Agent not receiving policy ? check /agent/status response');
console.log('   - Timer not starting ? check FACETRACK_SCREENSHOT_POLICY in agent output');
console.log('   - Capture returning null ? locked screen or excluded app');
console.log('   - Enqueue failing ? check state.policy in agent');
console.log('   - Upload failing ? check Cloudinary credentials and network');
console.log('   - Gallery empty ? check screenshot status in MongoDB\n');
