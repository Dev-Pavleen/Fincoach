import test from 'node:test';
import assert from 'node:assert/strict';
import { books, courses } from '../../shared/learningContent.js';
import { courseAssessments } from '../../shared/courseAssessments.js';

test('learning library covers the eight courses and complete topic breadth', () => {
  const requiredModuleCounts = [6, 6, 9, 10, 12, 8, 8, 8];
  assert.equal(courses.length, 8);
  assert.equal(new Set(courses.map((course) => course.id)).size, courses.length);
  courses.forEach((course, index) => {
    assert.ok(course.modules.length >= requiredModuleCounts[index], `${course.title} is missing planned modules`);
    assert.equal(new Set(course.modules.map((module) => module.lesson.id)).size, course.modules.length);
    for (const module of course.modules) {
      const lesson = module.lesson;
      assert.ok(lesson.title && lesson.intro && lesson.explanation && lesson.example && lesson.takeaway);
      assert.ok(lesson.objectives.length >= 2);
      assert.ok(lesson.keyTerms.length >= 2);
      assert.ok(lesson.options.length >= 3);
      assert.ok(Number.isInteger(lesson.answer) && lesson.answer >= 0 && lesson.answer < lesson.options.length);
      assert.ok(lesson.why && lesson.activity && lesson.simulator);
    }
  });
  assert.ok(courses.reduce((total, course) => total + course.modules.length, 0) >= 67);
});

test('book recommendations are attributed and do not claim downloadable copies', () => {
  assert.ok(books.length >= 8);
  for (const book of books) {
    assert.ok(book.title && book.author && book.category && book.level && book.note);
    assert.doesNotMatch(book.note, /free pdf|download the book/i);
  }
});

test('every course has a distinct mixed-format assessment with complete grading guidance', () => {
  assert.equal(courseAssessments.length, courses.length);
  assert.equal(new Set(courseAssessments.map((assessment) => assessment.courseId)).size, courses.length);
  const allTypes = new Set(courseAssessments.flatMap((assessment) => assessment.questions.map((question) => question.type)));
  assert.deepEqual(allTypes, new Set(['multiple_choice', 'true_false', 'scenario', 'calculation']));
  for (const course of courses) {
    const assessment = courseAssessments.find((item) => item.courseId === course.id);
    assert.ok(assessment, `${course.title} is missing a course-end assessment`);
    assert.ok(assessment.questions.length >= 4, `${course.title} needs a varied question bank`);
    assert.ok(new Set(assessment.questions.map((question) => question.type)).size >= 3, `${course.title} needs multiple assessment formats`);
    assert.equal(new Set(assessment.questions.map((question) => question.id)).size, assessment.questions.length);
    for (const question of assessment.questions) {
      assert.ok(question.prompt && question.explanation && question.difficulty);
      assert.ok(question.options.length >= 2);
      assert.ok(Number.isInteger(question.answer) && question.answer >= 0 && question.answer < question.options.length);
    }
  }
});
