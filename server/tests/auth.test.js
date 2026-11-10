import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

let server;
let apiUrl;
let tempDirectory;

before(async () => {
  tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'fincoach-auth-'));
  process.env.LOCAL_DATA_FILE = path.join(tempDirectory, 'accounts.json');
  process.env.JWT_SECRET = 'test-only-secret-with-more-than-thirty-two-characters';
  process.env.FINCOACH_HOSTED = 'false';
  const { createApp } = await import('../src/app.js');
  server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  apiUrl = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (tempDirectory) await rm(tempDirectory, { recursive: true, force: true });
  delete process.env.LOCAL_DATA_FILE;
  delete process.env.JWT_SECRET;
  delete process.env.FINCOACH_HOSTED;
});

async function request(pathname, { method = 'GET', body, cookie } = {}) {
  const response = await fetch(`${apiUrl}${pathname}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = response.status === 204 ? null : await response.json();
  return { response, data, cookie: response.headers.get('set-cookie')?.split(';')[0] };
}

test('registration validation, account login, sessions and owner-scoped scenarios', async () => {
  const mismatch = await request('/auth/register', {
    method: 'POST', body: { name: 'Student One', email: 'one@example.test', password: 'learning123', confirmPassword: 'learning456' },
  });
  assert.equal(mismatch.response.status, 400);
  assert.match(mismatch.data.details.confirmPassword[0], /do not match/i);

  const weakPassword = await request('/auth/register', {
    method: 'POST', body: { name: 'Student One', email: 'one@example.test', password: 'passwordonly', confirmPassword: 'passwordonly' },
  });
  assert.equal(weakPassword.response.status, 400);
  assert.match(weakPassword.data.details.password[0], /number/i);

  const registered = await request('/auth/register', {
    method: 'POST', body: { name: 'Student One', email: ' ONE@example.test ', password: 'learning123', confirmPassword: 'learning123' },
  });
  assert.equal(registered.response.status, 201);
  assert.equal(registered.data.user.email, 'one@example.test');
  assert.equal('passwordHash' in registered.data.user, false);
  assert.ok(registered.cookie);

  const stored = JSON.parse(await readFile(process.env.LOCAL_DATA_FILE, 'utf8'));
  assert.equal(stored.users.length, 1);
  assert.notEqual(stored.users[0].passwordHash, 'learning123');

  const duplicate = await request('/auth/register', {
    method: 'POST', body: { name: 'Student One', email: 'one@example.test', password: 'learning123', confirmPassword: 'learning123' },
  });
  assert.equal(duplicate.response.status, 409);

  const wrongLogin = await request('/auth/login', {
    method: 'POST', body: { email: 'one@example.test', password: 'wrongpass123' },
  });
  assert.equal(wrongLogin.response.status, 401);

  const login = await request('/auth/login', {
    method: 'POST', body: { email: 'one@example.test', password: 'learning123' },
  });
  assert.equal(login.response.status, 200);
  const me = await request('/auth/me', { cookie: login.cookie });
  assert.equal(me.response.status, 200);
  assert.equal(me.data.user.id, registered.data.user.id);

  const saved = await request('/simulations', {
    method: 'POST', cookie: login.cookie,
    body: { type: 'investment', title: 'Practice', inputs: { principal: 1000, years: 2, rate: 5 } },
  });
  assert.equal(saved.response.status, 201);

  const progressSaved = await request('/learning/progress', {
    method: 'PUT', cookie: login.cookie,
    body: { completedLessons: ['finance.basics.01', 'finance.basics.01', 'budgeting.plan.02'] },
  });
  assert.equal(progressSaved.response.status, 200);
  assert.deepEqual(progressSaved.data.progress.completedLessons, ['finance.basics.01', 'budgeting.plan.02']);
  const progressRead = await request('/learning/progress', { cookie: login.cookie });
  assert.deepEqual(progressRead.data.progress.completedLessons, ['finance.basics.01', 'budgeting.plan.02']);

  const secondUser = await request('/auth/register', {
    method: 'POST', body: { name: 'Student Two', email: 'two@example.test', password: 'learning456', confirmPassword: 'learning456' },
  });
  assert.equal(secondUser.response.status, 201);
  const secondUserProgress = await request('/learning/progress', { cookie: secondUser.cookie });
  assert.deepEqual(secondUserProgress.data.progress.completedLessons, []);
  const privateRecord = await request(`/simulations/${saved.data.simulation.id}`, { cookie: secondUser.cookie });
  assert.equal(privateRecord.response.status, 404);

  const logout = await request('/auth/logout', { method: 'POST', cookie: login.cookie });
  assert.equal(logout.response.status, 204);
  const signedOut = await request('/simulations', { cookie: logout.cookie });
  assert.equal(signedOut.response.status, 401);
});
