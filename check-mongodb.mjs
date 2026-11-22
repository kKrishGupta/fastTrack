import { MongoClient } from 'mongodb';

const client = new MongoClient('mongodb+srv://kg20060220_db_user:4qmMr8sGFtfFnzLr@cluster0.m8rdgid.mongodb.net/');
await client.connect();
const db = client.db();

console.log('\n=== Screenshot Captures ===');
const captures = await db.collection('screenshotcaptures').find({}).sort({ capturedAt: -1 }).limit(10).toArray();
console.log(`Total captures: ${captures.length}`);
for (const cap of captures) {
  console.log(`\nCapture ID: ${cap.captureId}`);
  console.log(`Status: ${cap.status}`);
  console.log(`Captured At: ${cap.capturedAt}`);
  console.log(`Created At: ${cap.createdAt}`);
  console.log(`Employee: ${cap.employeeId}`);
  console.log(`Device: ${cap.deviceId}`);
}

console.log('\n=== Monitoring Devices ===');
const devices = await db.collection('monitoringdevices').find({}).toArray();
for (const dev of devices) {
  console.log(`\nDevice: ${dev.name}`);
  console.log(`Status: ${dev.status}`);
  console.log(`Screenshot Consent: ${dev.screenshotConsentAt || 'NOT GRANTED'}`);
  console.log(`Collect After: ${dev.collectAfter}`);
}

console.log('\n=== Monitoring Policy ===');
const policy = await db.collection('monitoringpolicies').findOne({});
if (policy) {
  console.log(`Screenshots Enabled: ${policy.screenshotsEnabled}`);
  console.log(`Screenshot Interval: ${policy.screenshotIntervalSeconds} seconds`);
  console.log(`Screenshot Retention: ${policy.screenshotRetentionDays} days`);
}

await client.close();
