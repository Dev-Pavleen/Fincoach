import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadEnvironment, serverEnvironmentFile } from '../src/environment.js';

test('server environment defaults to server/.env and loads dotenv values', async () => {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  assert.equal(serverEnvironmentFile, path.join(repositoryRoot, 'server', '.env'));

  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'fincoach-env-'));
  const key = `FINCOACH_ENV_TEST_${randomUUID().replaceAll('-', '').toUpperCase()}`;
  const envFile = path.join(temporaryDirectory, '.env');
  try {
    await writeFile(envFile, `${key}=loaded-from-env-file\n`, 'utf8');
    const result = loadEnvironment(envFile);
    assert.equal(result.error, undefined);
    assert.equal(process.env[key], 'loaded-from-env-file');
  } finally {
    delete process.env[key];
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});
