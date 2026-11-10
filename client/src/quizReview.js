import { courses } from '../../shared/learningContent.js';
import { courseAssessments } from '../../shared/courseAssessments.js';

export function getAttemptReview(attempt) {
  if (Array.isArray(attempt?.review) && attempt.review.length) {
    return attempt.review.map((item, index) => ({
      prompt: item.prompt,
      options: item.options,
      correctIndex: item.correctIndex,
      selectedIndex: attempt.kind === 'course-assessment'
        ? attempt.answers?.[index] ?? null
        : attempt.selectedAnswer ?? null,
      explanation: item.explanation,
    }));
  }

  if (attempt?.kind === 'course-assessment' || attempt?.assessmentId) {
    const assessment = courseAssessments.find((item) => item.id === attempt.assessmentId);
    if (!assessment) return [];
    return assessment.questions.map((question, index) => ({
      prompt: question.prompt,
      options: question.options,
      correctIndex: question.answer,
      selectedIndex: attempt.answers?.[index] ?? null,
      explanation: question.explanation,
    }));
  }

  const lesson = courses.flatMap((course) => course.modules).map((module) => module.lesson)
    .find((item) => item.id === attempt?.lessonId);
  if (!lesson) return [];
  return [{
    prompt: lesson.question,
    options: lesson.options,
    correctIndex: lesson.answer,
    selectedIndex: Number.isInteger(attempt.selectedAnswer) ? attempt.selectedAnswer : null,
    explanation: lesson.why,
  }];
}
