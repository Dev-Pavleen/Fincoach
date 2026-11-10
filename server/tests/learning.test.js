import test from 'node:test';
import assert from 'node:assert/strict';
import { books, courses } from '../../shared/learningContent.js';

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
