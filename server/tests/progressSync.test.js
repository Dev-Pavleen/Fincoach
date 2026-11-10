import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateGuestQuizAttempts } from '../../client/src/progressSync.js';

test('guest course and lesson quiz attempts use their matching server APIs', async () => {
  const calls = [];
  const attempts = [
    { attemptId: 'lesson-1', lessonId: 'budgeting.budget-basics', selectedAnswer: 1 },
    { attemptId: 'assessment-1', kind: 'course-assessment', assessmentId: 'budgeting-review-v1', answers: [0, 1, 2] },
  ];
  const result = await migrateGuestQuizAttempts(attempts, async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body), credentials: options.credentials });
    return { ok: true, json: async () => ({ attempt: { ...JSON.parse(options.body), score: 1 } }) };
  });

  assert.deepEqual(calls.map(({ url }) => url), [
    '/api/learning/attempts',
    '/api/learning/assessments/budgeting-review-v1/attempts',
  ]);
  assert.equal(calls[1].credentials, 'include');
  assert.deepEqual(calls[1].body.answers, [0, 1, 2]);
  assert.equal(result.migrated.length, 2);
  assert.deepEqual(result.failed, []);
});

test('guest attempts remain retryable when the upload fails or data is malformed', async () => {
  const good = { attemptId: 'assessment-1', kind: 'course-assessment', assessmentId: 'personal-finance-review-v1', answers: [0] };
  const malformed = { attemptId: 'lesson-1', lessonId: 'lesson-without-answer' };
  const result = await migrateGuestQuizAttempts([good, malformed], async () => ({ ok: false, json: async () => ({}) }));
  assert.deepEqual(result.migrated, []);
  assert.deepEqual(result.failed, [good, malformed]);
});
