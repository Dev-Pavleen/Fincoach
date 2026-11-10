const requestOptions = (body) => ({
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

/** Upload guest quiz history using the matching server grading endpoint. */
export async function migrateGuestQuizAttempts(attempts, fetchImpl = fetch) {
  const migrated = [];
  const failed = [];

  for (const attempt of attempts) {
    const isAssessment = attempt?.kind === 'course-assessment';
    const valid = attempt?.attemptId && (isAssessment
      ? attempt.assessmentId && Array.isArray(attempt.answers)
      : attempt.lessonId && Number.isInteger(attempt.selectedAnswer));
    if (!valid) {
      failed.push(attempt);
      continue;
    }

    const endpoint = isAssessment
      ? `/api/learning/assessments/${encodeURIComponent(attempt.assessmentId)}/attempts`
      : '/api/learning/attempts';
    const body = isAssessment
      ? { attemptId: attempt.attemptId, answers: attempt.answers }
      : { attemptId: attempt.attemptId, lessonId: attempt.lessonId, selectedAnswer: attempt.selectedAnswer };

    try {
      const response = await fetchImpl(endpoint, requestOptions(body));
      const result = response.ok ? await response.json() : null;
      if (!response.ok || !result?.attempt) {
        failed.push(attempt);
        continue;
      }
      migrated.push(result.attempt);
    } catch {
      failed.push(attempt);
    }
  }

  return { migrated, failed };
}
