import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App.jsx';
import { courses } from './learningContent.js';

describe('learning and workspace navigation', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('opens a selected course and its first learning module from Learn', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Learn' }));
    fireEvent.click(await screen.findByRole('button', { name: /Introduction to Personal Finance/ }));
    expect(screen.getByRole('heading', { name: 'Introduction to Personal Finance' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Understanding money/ }));
    expect(await screen.findByRole('heading', { name: 'Money as a tool' })).toBeTruthy();
  });

  it('opens every learning module from the course library', async () => {
    expect(courses.reduce((total, course) => total + course.modules.length, 0)).toBe(70);
    render(<App />);
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
  });

  it('opens a course and module from My progress, including the empty-progress path', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'My progress' }));
    expect(await screen.findByText(/No lessons completed yet/)).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: 'Open modules' })[0]);
    expect(await screen.findByRole('heading', { name: 'Introduction to Personal Finance' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Understanding money/ }));
    expect(await screen.findByRole('heading', { name: 'Money as a tool' })).toBeTruthy();
  });

  it('opens Overview from the Student workspace control', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Learn' }));
    await screen.findByRole('heading', { name: 'Learn the building blocks' });

    fireEvent.click(screen.getByRole('button', { name: 'Open Student workspace overview' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Overview' }).className).toContain('nav-active'));
  });
});
