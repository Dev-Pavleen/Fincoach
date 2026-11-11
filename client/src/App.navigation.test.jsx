import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderApp } from './testUtils.jsx';
import { courses } from './learningContent.js';

describe('learning and workspace navigation', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('opens a selected course and its first learning module from Learn', async () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Learn' }));
    fireEvent.click(await screen.findByRole('button', { name: /Introduction to Personal Finance/ }));
    expect(screen.getByRole('heading', { name: 'Introduction to Personal Finance' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Understanding money/ }));
    expect(await screen.findByRole('heading', { name: 'Money as a tool' })).toBeTruthy();
  });

  it('opens every learning module from the course library', async () => {
    expect(courses.reduce((total, course) => total + course.modules.length, 0)).toBe(70);
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Learn' }));

    for (const course of courses) {
      fireEvent.click(await screen.findByRole('button', { name: new RegExp(course.title) }));
      for (const module of course.modules) {
        const moduleButton = screen.getAllByRole('button').find((button) => button.classList.contains('course-module-row') && button.querySelector('strong')?.textContent === module.title);
        expect(moduleButton).toBeTruthy();
        fireEvent.click(moduleButton);
        expect(await screen.findByRole('heading', { name: module.lesson.title })).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: /Course modules/ }));
      }
      fireEvent.click(screen.getByRole('button', { name: /All courses/ }));
    }
  }, 20000);

  it('opens a course and module from My progress, including the empty-progress path', async () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'My progress' }));
    expect(await screen.findByText(/No lessons completed yet/)).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: 'Open modules' })[0]);
    expect(await screen.findByRole('heading', { name: 'Introduction to Personal Finance' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Understanding money/ }));
    expect(await screen.findByRole('heading', { name: 'Money as a tool' })).toBeTruthy();
  });

  it('saves a correct lesson check and restores progress after a reload', async () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Learn' }));
    fireEvent.click(await screen.findByRole('button', { name: /Introduction to Personal Finance/ }));
    fireEvent.click(screen.getByRole('button', { name: /Understanding money/ }));
    fireEvent.click(screen.getByRole('button', { name: 'It makes the goal easier to plan and review' }));
    expect(await screen.findByText(/Correct\./)).toBeTruthy();
    await waitFor(() => expect(JSON.parse(localStorage.getItem('fincoach-lessons') || '[]')).toContain('personal-finance.money-basics'));

    cleanup();
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'My progress' }));
    expect(await screen.findByText('1 of 7 lessons · 14%')).toBeTruthy();
  });

  it('opens Overview from the Student workspace control', async () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Learn' }));
    await screen.findByRole('heading', { name: 'Learn the building blocks' });

    fireEvent.click(screen.getByRole('button', { name: 'Open Student workspace overview' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Overview' }).className).toContain('nav-active'));
    expect(screen.getByRole('heading', { name: /Good choices start with a little curiosity/ })).toBeTruthy();
  });

  it('opens the Student workspace from its direct route', async () => {
    renderApp(['/workspace']);
    expect(await screen.findByRole('heading', { name: /Good choices start with a little curiosity/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Overview' }).className).toContain('nav-active');
  });

  it('keeps course and lesson navigation in the URL for direct links and refreshes', async () => {
    const course = courses[0];
    const lesson = course.modules[0];
    const courseUrl = `/learn/${course.id}`;
    const lessonUrl = `${courseUrl}/${lesson.id}`;

    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Learn' }));
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(course.title) }));
    await waitFor(() => expect(screen.getByTestId('route-path').textContent).toBe(courseUrl));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(lesson.title) }));
    expect(await screen.findByRole('heading', { name: lesson.lesson.title })).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('route-path').textContent).toBe(lessonUrl));

    cleanup();
    renderApp([lessonUrl]);
    expect(await screen.findByRole('heading', { name: lesson.lesson.title })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open Student workspace overview' }));
    expect(await screen.findByRole('heading', { name: /Good choices start with a little curiosity/ })).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('route-path').textContent).toBe('/workspace'));
  });

  it('updates the credit-card minimum-payment comparison when its assumptions change', async () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Simulators' }));
    fireEvent.click(screen.getByRole('button', { name: 'Credit card' }));

    const rate = screen.getByRole('spinbutton', { name: 'Illustrative minimum rate' });
    expect(screen.getByText('Repayment strategy comparison')).toBeTruthy();
    expect(screen.getAllByText(/5% of amount due or ₹100 floor/)).toHaveLength(2);
    fireEvent.change(rate, { target: { value: '10' } });
    expect(screen.getAllByText(/10% of amount due or ₹100 floor/)).toHaveLength(2);
    expect(screen.getByText('Compare repayment paths')).toBeTruthy();
  });

  it('recovers from malformed browser-saved learning data without breaking navigation', async () => {
    localStorage.setItem('fincoach-scenarios', '{"wrong":"shape"}');
    localStorage.setItem('fincoach-comparisons', 'null');
    localStorage.setItem('fincoach-lessons', '{"completed":true}');
    localStorage.setItem('fincoach-quiz-attempts', '[null, {"attemptId":"bad"}]');
    localStorage.setItem('fincoach-reading-list', '{"items":[]}');
    localStorage.setItem('fincoach-theme', '{"theme":"dark"}');
    localStorage.setItem('fincoach-last-lesson', '{"courseId":"not-a-course"}');

    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'My progress' }));
    expect(await screen.findByRole('heading', { name: 'My progress' })).toBeTruthy();
    expect(screen.getByText('0/70')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeTruthy();
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});
