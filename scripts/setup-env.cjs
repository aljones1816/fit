#!/usr/bin/env node
// Writes VITE_FIREBASE_* variables to .env.local so Vite can embed them at build time.
//
// Two modes:
//   Local dev  — reads secrets.txt at project root (gitignored)
//   CI         — reads from environment variables already set by the runner

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const envPath = path.join(root, '.env.local');

const KEYS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
];

// CI mode: all vars already in environment — just write them to .env.local for Vite
if (KEYS.every(k => process.env[k])) {
  const out = KEYS.map(k => `${k}=${process.env[k]}`).join('\n') + '\n';
  fs.writeFileSync(envPath, out);
  console.log('Wrote .env.local from environment variables');
  process.exit(0);
}

// Local dev mode: parse secrets.txt
const secretsPath = path.join(root, 'secrets.txt');
if (!fs.existsSync(secretsPath)) {
  console.error('Error: secrets.txt not found and VITE_FIREBASE_* env vars are not set.');
  console.error('Local dev: create secrets.txt with your Firebase web config.');
  console.error('CI: set VITE_FIREBASE_* as repository secrets in GitHub.');
  process.exit(1);
}

const content = fs.readFileSync(secretsPath, 'utf8');

function extract(key) {
  const re = new RegExp(`["']?${key}["']?:\\s*["']([^"']+)["']`);
  const m = content.match(re);
  return m ? m[1].trim() : '';
}

const fields = {
  VITE_FIREBASE_API_KEY:             extract('apiKey'),
  VITE_FIREBASE_AUTH_DOMAIN:         extract('authDomain'),
  VITE_FIREBASE_PROJECT_ID:          extract('projectId'),
  VITE_FIREBASE_STORAGE_BUCKET:      extract('storageBucket'),
  VITE_FIREBASE_MESSAGING_SENDER_ID: extract('messagingSenderId'),
  VITE_FIREBASE_APP_ID:              extract('appId'),
};

const missing = Object.entries(fields).filter(([, v]) => !v).map(([k]) => k);
if (missing.length) {
  console.warn('Warning: could not extract:', missing.join(', '));
}

const out = Object.entries(fields).map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
fs.writeFileSync(envPath, out);
console.log('Wrote .env.local from secrets.txt');
