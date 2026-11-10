import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import App from './App.jsx';

describe('Decision Replay interface', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }));
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('compares a baseline and changed variant and saves the replay timeline', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Simulators' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save as baseline' }));

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Investment rate' }), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save as variant' }));
    fireEvent.click(screen.getByRole('button', { name: 'Decision Replay' }));

    expect(await screen.findByText('1 inputs changed')).toBeTruthy();
    expect(screen.getByText('Rate')).toBeTruthy();
    const changedValues = document.querySelector('.difference-row strong');
    expect(changedValues?.textContent.replace(/\s/g, '')).toBe('810');

    fireEvent.click(screen.getByRole('button', { name: 'Save comparison' }));
    expect(await screen.findByText('VERSION HISTORY')).toBeTruthy();
    expect(screen.getByText('Version 1')).toBeTruthy();
    expect(JSON.parse(localStorage.getItem('fincoach-comparisons') || '[]')).toHaveLength(1);
  });
});
