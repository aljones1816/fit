#!/usr/bin/env node
// Parses secrets.txt (any common Firebase config format) and writes VITE_FIREBASE_*
// variables to .env.local so Vite can embed them at build time.
// Run: node scripts/setup-env.js

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const secretsPath = path.join(root, 'secrets.txt');
const envPath = path.join(root, '.env.local');

if (!fs.existsSync(secretsPath)) {
  console.error('Error: secrets.txt not found at project root.');
  console.error('Create it with your Firebase web config (paste from Firebase console).');
  process.exit(1);
}

const content = fs.readFileSync(secretsPath, 'utf8');

function extract(key) {
  // Matches:  key: "value"  or  key: 'value'  or  "key": "value"
  const re = new RegExp(`["']?${key}["']?:\\s*["']([^"']+)["']`);
  const m = content.match(re);
  return m ? m[1].trim() : '';
}

const fields = {
  VITE_FIREBASE_API_KEY:            extract('apiKey'),
  VITE_FIREBASE_AUTH_DOMAIN:        extract('authDomain'),
  VITE_FIREBASE_PROJECT_ID:         extract('projectId'),
  VITE_FIREBASE_STORAGE_BUCKET:     extract('storageBucket'),
  VITE_FIREBASE_MESSAGING_SENDER_ID: extract('messagingSenderId'),
  VITE_FIREBASE_APP_ID:             extract('appId'),
};

const missing = Object.entries(fields).filter(([, v]) => !v).map(([k]) => k);
if (missing.length) {
  console.warn('Warning: could not extract the following fields:', missing.join(', '));
}

const out = Object.entries(fields).map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
fs.writeFileSync(envPath, out);
console.log('Wrote .env.local');
