import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('production API exits before listening when MongoDB is not configured', () => {
  const result = spawnSync(process.execPath, ['server/src/index.js'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    timeout: 10_000,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      MONGODB_URI: '',
      JWT_SECRET: 'test-production-secret-long-enough-for-validation',
      PORT: '0',
    },
  });

  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.match(result.stderr, /Production requires MONGODB_URI/);
  assert.doesNotMatch(result.stdout + result.stderr, /API listening/);
});
