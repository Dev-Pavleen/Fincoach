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
  const unauthenticatedAssessment = await request('/learning/assessments/personal-finance-review-v1/attempts', { method: 'POST', body: { attemptId: 'c09a3517-512b-4e75-9fe4-6fde0e2a9861', answers: [0, 0, 1, 0] } });
  assert.equal(unauthenticatedAssessment.response.status, 401);
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
  const loadedScenario = await request(`/simulations/${saved.data.simulation.id}`, { cookie: login.cookie });
  assert.equal(loadedScenario.response.status, 200);
  assert.ok(Math.abs(loadedScenario.data.simulation.results.finalValue - 1102.5) < 0.01);
  const renamedScenario = await request(`/simulations/${saved.data.simulation.id}`, { method: 'PATCH', cookie: login.cookie, body: { title: 'Updated practice' } });
  assert.equal(renamedScenario.data.simulation.title, 'Updated practice');

  const progressSaved = await request('/learning/progress', {
    method: 'PUT', cookie: login.cookie,
    body: { completedLessons: ['finance.basics.01', 'finance.basics.01', 'budgeting.plan.02'] },
  });
  assert.equal(progressSaved.response.status, 200);
  assert.deepEqual(progressSaved.data.progress.completedLessons, ['finance.basics.01', 'budgeting.plan.02']);
  const progressRead = await request('/learning/progress', { cookie: login.cookie });
  assert.deepEqual(progressRead.data.progress.completedLessons, ['finance.basics.01', 'budgeting.plan.02']);
  const wrongAttemptId = '1485ae58-a426-4bb6-8b37-4e6dc84bcd5b';
  const wrongAttempt = await request('/learning/attempts', { method: 'POST', cookie: login.cookie, body: { attemptId: wrongAttemptId, lessonId: 'personal-finance.money-basics', selectedAnswer: 2 } });
  assert.equal(wrongAttempt.response.status, 201);
  assert.equal(wrongAttempt.data.attempt.isCorrect, false);
  assert.equal(wrongAttempt.data.attempt.score, 0);
  const duplicateAttempt = await request('/learning/attempts', { method: 'POST', cookie: login.cookie, body: { attemptId: wrongAttemptId, lessonId: 'personal-finance.money-basics', selectedAnswer: 2 } });
  assert.equal(duplicateAttempt.response.status, 200);
  assert.equal(duplicateAttempt.data.duplicate, true);
  const correctAttempt = await request('/learning/attempts', { method: 'POST', cookie: login.cookie, body: { attemptId: '774c7628-563d-41ea-8b84-bfb5d3d46ae1', lessonId: 'personal-finance.money-basics', selectedAnswer: 0 } });
  assert.equal(correctAttempt.data.attempt.isCorrect, true);
  const courseAssessment = await request('/learning/assessments/personal-finance-review-v1/attempts', { method: 'POST', cookie: login.cookie, body: { attemptId: '9241c4d7-7825-43a1-8d59-071d073623d2', answers: [0, 0, 1, 0] } });
  assert.equal(courseAssessment.response.status, 201);
  assert.equal(courseAssessment.data.attempt.score, 4);
  assert.equal(courseAssessment.data.attempt.total, 4);
  assert.equal(courseAssessment.data.attempt.percentage, 100);
  const duplicateAssessment = await request('/learning/assessments/personal-finance-review-v1/attempts', { method: 'POST', cookie: login.cookie, body: { attemptId: '9241c4d7-7825-43a1-8d59-071d073623d2', answers: [2, 1, 0, 2] } });
  assert.equal(duplicateAssessment.response.status, 200);
  assert.equal(duplicateAssessment.data.duplicate, true);
  assert.equal(duplicateAssessment.data.attempt.score, 4);
  const gradedAssessment = await request('/learning/assessments/personal-finance-review-v1/attempts', { method: 'POST', cookie: login.cookie, body: { attemptId: '2240dd41-6e5f-4027-984f-ed155b16036f', answers: [0, 0, 0, 0] } });
  assert.equal(gradedAssessment.data.attempt.score, 3);
  assert.equal(gradedAssessment.data.attempt.percentage, 75);
  const incompleteAssessment = await request('/learning/assessments/personal-finance-review-v1/attempts', { method: 'POST', cookie: login.cookie, body: { attemptId: '19b63d59-554a-4a3c-9821-bac7f8cbad91', answers: [0] } });
  assert.equal(incompleteAssessment.response.status, 400);
  const attemptHistory = await request('/learning/progress', { cookie: login.cookie });
  assert.equal(attemptHistory.data.progress.quizAttempts.length, 4);
  const readingSaved = await request('/learning/reading-list', { method: 'PUT', cookie: login.cookie, body: { items: [{ title: 'The Psychology of Money', status: 'Reading' }] } });
  assert.equal(readingSaved.response.status, 200);
  assert.deepEqual(readingSaved.data.readingList, [{ title: 'The Psychology of Money', status: 'Reading' }]);
  const unknownBook = await request('/learning/reading-list', { method: 'PUT', cookie: login.cookie, body: { items: [{ title: 'Unknown PDF', status: 'Completed' }] } });
  assert.equal(unknownBook.response.status, 400);
  const comparison = await request('/comparisons', { method: 'POST', cookie: login.cookie, body: { title: 'Replay example', scenarioA: { type: 'investment', inputs: { principal: 1000, years: 2, rate: 5 } }, scenarioB: { type: 'investment', inputs: { principal: 1000, years: 2, rate: 8 } } } });
  assert.equal(comparison.response.status, 201);
  assert.ok(Math.abs(comparison.data.comparison.scenarioA.results.finalValue - 1102.5) < 0.01);
  const comparisonList = await request('/comparisons', { cookie: login.cookie });
  assert.equal(comparisonList.data.comparisons[0].id, comparison.data.comparison.id);
  const renamedComparison = await request(`/comparisons/${comparison.data.comparison.id}`, { method: 'PATCH', cookie: login.cookie, body: { title: 'Renamed replay' } });
  assert.equal(renamedComparison.data.comparison.title, 'Renamed replay');
  const replayVersion = await request(`/comparisons/${comparison.data.comparison.id}/versions`, { method: 'POST', cookie: login.cookie, body: { inputs: { principal: 2000, years: 2, rate: 8 }, notes: 'Raised the return assumption for a sensitivity check.' } });
  assert.equal(replayVersion.response.status, 201);
  assert.equal(replayVersion.data.version.versionNumber, 2);
  assert.equal(replayVersion.data.version.notes, 'Raised the return assumption for a sensitivity check.');
  assert.deepEqual(replayVersion.data.version.changes.find((item) => item.key === 'principal'), { key: 'principal', label: 'Principal', a: 1000, b: 2000 });
  assert.ok(Math.abs(replayVersion.data.version.scenario.results.finalValue - 2332.8) < 0.02);
  assert.equal(replayVersion.data.comparison.scenarioA.inputs.principal, 1000);
  assert.equal(replayVersion.data.comparison.versions[0].scenario.inputs.rate, 8);
  const replayHistory = await request(`/comparisons/${comparison.data.comparison.id}/versions`, { cookie: login.cookie });
  assert.equal(replayHistory.data.comparison.versions.length, 2);

  const secondUser = await request('/auth/register', {
    method: 'POST', body: { name: 'Student Two', email: 'two@example.test', password: 'learning456', confirmPassword: 'learning456' },
  });
  assert.equal(secondUser.response.status, 201);
  const secondUserProgress = await request('/learning/progress', { cookie: secondUser.cookie });
  assert.deepEqual(secondUserProgress.data.progress.completedLessons, []);
  assert.deepEqual(secondUserProgress.data.progress.quizAttempts, []);
  assert.deepEqual(secondUserProgress.data.progress.readingList, []);
  const privateRecord = await request(`/simulations/${saved.data.simulation.id}`, { cookie: secondUser.cookie });
  assert.equal(privateRecord.response.status, 404);
  const secondUserComparisons = await request('/comparisons', { cookie: secondUser.cookie });
  assert.deepEqual(secondUserComparisons.data.comparisons, []);
  const privateReplay = await request(`/comparisons/${comparison.data.comparison.id}/versions`, { cookie: secondUser.cookie });
  assert.equal(privateReplay.response.status, 404);
  const privateReplayWrite = await request(`/comparisons/${comparison.data.comparison.id}/versions`, { method: 'POST', cookie: secondUser.cookie, body: { inputs: { principal: 5000, years: 1, rate: 12 } } });
  assert.equal(privateReplayWrite.response.status, 404);
  const deletedComparison = await request(`/comparisons/${comparison.data.comparison.id}`, { method: 'DELETE', cookie: login.cookie });
  assert.equal(deletedComparison.response.status, 204);
  const deletedScenario = await request(`/simulations/${saved.data.simulation.id}`, { method: 'DELETE', cookie: login.cookie });
  assert.equal(deletedScenario.response.status, 204);

  const logout = await request('/auth/logout', { method: 'POST', cookie: login.cookie });
  assert.equal(logout.response.status, 204);
  const signedOut = await request('/simulations', { cookie: logout.cookie });
  assert.equal(signedOut.response.status, 401);
});

test('all public simulators calculate in hosted mode without requiring MongoDB', async () => {
  const previous = { hosted: process.env.FINCOACH_HOSTED, mongo: process.env.MONGODB_URI, netlify: process.env.NETLIFY, vercel: process.env.VERCEL };
  process.env.FINCOACH_HOSTED = 'true';
  delete process.env.MONGODB_URI;
  process.env.NETLIFY = 'false';
  process.env.VERCEL = '0';
  try {
    const targetDate = new Date();
    targetDate.setUTCMonth(targetDate.getUTCMonth() + 6);
    const goal = await request('/simulations/savings-goal', { method: 'POST', body: { target: 10000, currentSavings: 1000, monthlyContribution: 500, annualRate: 0, targetDate: targetDate.toISOString().slice(0, 10) } });
    assert.equal(goal.response.status, 200);
    assert.equal(goal.data.results.projectedAtTarget, 4000);
    const purchase = await request('/simulations/buy-vs-save', { method: 'POST', body: { itemPrice: 12000, availableSavings: 4000, monthlySavings: 2000, cardApr: 24, loanRate: 0, months: 4, cardFee: 100, loanFee: 500 } });
    assert.equal(purchase.response.status, 200);
    assert.equal(purchase.data.results.options.length, 3);
  } finally {
    for (const [key, value] of Object.entries({ FINCOACH_HOSTED: previous.hosted, MONGODB_URI: previous.mongo, NETLIFY: previous.netlify, VERCEL: previous.vercel })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
