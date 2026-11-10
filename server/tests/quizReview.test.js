import test from 'node:test';
import assert from 'node:assert/strict';
import { getAttemptReview } from '../../client/src/quizReview.js';

test('saved course assessments can be reviewed with choices and explanations', () => {
  const review = getAttemptReview({
    kind: 'course-assessment',
    assessmentId: 'personal-finance-review-v1',
    answers: [0, 1, 0, 2],
  });
  assert.equal(review.length, 4);
  assert.equal(review[1].selectedIndex, 1);
  assert.equal(review[1].correctIndex, 0);
  assert.match(review[1].explanation, /date/i);
});

test('saved lesson checks can be reviewed, and missing content is handled', () => {
  const review = getAttemptReview({ lessonId: 'personal-finance.money-basics', selectedAnswer: 1 });
  assert.equal(review.length, 1);
  assert.equal(review[0].selectedIndex, 1);
  assert.equal(review[0].correctIndex, 0);
  assert.ok(review[0].explanation);
  assert.deepEqual(getAttemptReview({ lessonId: 'removed.lesson', selectedAnswer: 0 }), []);
});

test('saved attempts use their immutable question snapshot after course content changes', () => {
  const review = getAttemptReview({
    kind: 'course-assessment',
    assessmentId: 'personal-finance-review-v1',
    answers: [1],
    review: [{ prompt: 'Question as asked at submission', options: ['Old correct', 'Selected'], correctIndex: 0, explanation: 'Original explanation' }],
  });
  assert.deepEqual(review, [{ prompt: 'Question as asked at submission', options: ['Old correct', 'Selected'], correctIndex: 0, selectedIndex: 1, explanation: 'Original explanation' }]);
});
