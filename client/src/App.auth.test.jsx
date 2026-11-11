import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { renderApp } from './testUtils.jsx';

const account = { id: 'user-1', name: 'Demo Student', email: 'demo@example.test', createdAt: '2026-02-03T00:00:00.000Z' };
const emptyProgress = { progress: { completedLessons: [], quizAttempts: [], readingList: [] } };

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => structuredClone(body) };
}

function installApi({ authenticated = false } = {}) {
  const calls = [];
  const fetchMock = vi.fn(async (url, options = {}) => {
    calls.push({ url: String(url), ...options });
    if (url === '/api/auth/me') return authenticated ? response(200, { user: account }) : response(401, {});
    if (url === '/api/auth/login' || url === '/api/auth/register') return response(url.endsWith('register') ? 201 : 200, { user: account });
    if (url === '/api/simulations') return response(200, { simulations: [] });
    if (url === '/api/comparisons') return response(200, { comparisons: [] });
    if (url === '/api/learning/progress') return response(200, emptyProgress);
    if (url === '/api/auth/profile') return response(200, { user: { ...account, ...JSON.parse(options.body) } });
    return response(200, {});
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}

describe('account interface and session restoration', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('restores a valid server session after the app is loaded', async () => {
    const { fetchMock } = installApi({ authenticated: true });
    renderApp();

    expect(await screen.findByRole('button', { name: `Account: ${account.name}` })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/me', { credentials: 'include' });
  });

  it('explains an expired session and clears its remembered sign-in marker', async () => {
    localStorage.setItem('fincoach-session-active', JSON.stringify(true));
    installApi();
    renderApp();

    expect(await screen.findByText('Your session has expired. Sign in again to sync your account.')).toBeTruthy();
    expect(localStorage.getItem('fincoach-session-active')).toBeNull();
  });

  it('traps keyboard focus in the account dialog and closes it with Escape', () => {
    renderApp();
    const trigger = screen.getByRole('button', { name: 'Sign in or create an account' });
    trigger.focus();
    fireEvent.click(trigger);

    const closeButton = screen.getByRole('button', { name: 'Close account dialog' });
    const modeButton = screen.getByRole('button', { name: 'Create an account' });
    expect(document.activeElement).toBe(closeButton);
    modeButton.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(closeButton);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('clears local account state only after the server confirms logout', async () => {
    installApi({ authenticated: true });
    renderApp();
    fireEvent.click(await screen.findByRole('button', { name: `Account: ${account.name}` }));
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(await screen.findByText('Signed out')).toBeTruthy();
    expect(screen.queryByRole('button', { name: `Account: ${account.name}` })).toBeNull();
    expect(localStorage.getItem('fincoach-session-active')).toBeNull();
  });

  it('keeps the account visible when the logout API fails', async () => {
    const { fetchMock } = installApi({ authenticated: true });
    const originalFetch = fetchMock.getMockImplementation();
    fetchMock.mockImplementation((url, options) => String(url) === '/api/auth/logout' ? Promise.resolve(response(503, {})) : originalFetch(url, options));
    renderApp();
    fireEvent.click(await screen.findByRole('button', { name: `Account: ${account.name}` }));
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(await screen.findByText('Could not sign out right now. Please try again when the account service is available.')).toBeTruthy();
    expect(screen.getByRole('button', { name: `Account: ${account.name}` })).toBeTruthy();
    expect(localStorage.getItem('fincoach-session-active')).toBe('true');
  });

  it('submits login credentials and exposes the password visibility toggle', async () => {
    const { calls } = installApi();
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in or create an account' }));

    const password = screen.getByLabelText('Password');
    expect(password.type).toBe('password');
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(password.type).toBe('text');
    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(password.type).toBe('password');

    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: account.email } });
    fireEvent.change(password, { target: { value: 'learning123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('button', { name: `Account: ${account.name}` })).toBeTruthy();
    expect(JSON.parse(localStorage.getItem('fincoach-session-active'))).toBe(true);
    const login = calls.find((call) => call.url === '/api/auth/login');
    expect(login).toBeTruthy();
    expect(JSON.parse(login.body)).toEqual({ email: account.email, password: 'learning123' });
  });

  it('submits a matching registration and keeps the new account signed in', async () => {
    const { calls } = installApi();
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in or create an account' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create an account' }));
    expect(await screen.findByRole('heading', { name: 'Create your account' })).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: account.name } });
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: account.email } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'learning123' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'learning123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByRole('button', { name: `Account: ${account.name}` })).toBeTruthy();
    const registration = calls.find((call) => call.url === '/api/auth/register');
    expect(registration).toBeTruthy();
    expect(JSON.parse(registration.body)).toEqual({ name: account.name, confirmPassword: 'learning123', email: account.email, password: 'learning123' });
  });

  it('merges guest lesson and reading progress into a newly created account', async () => {
    localStorage.setItem('fincoach-lessons', JSON.stringify(['personal-finance.money-basics']));
    localStorage.setItem('fincoach-reading-list', JSON.stringify([{ title: 'The Psychology of Money', status: 'Reading' }]));
    const { calls } = installApi();
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in or create an account' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create an account' }));
    fireEvent.change(await screen.findByLabelText('Your name'), { target: { value: account.name } });
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: account.email } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'learning123' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'learning123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByRole('button', { name: `Account: ${account.name}` })).toBeTruthy();
    const progressUpdate = calls.find((call) => call.url === '/api/learning/progress' && call.method === 'PUT');
    expect(JSON.parse(progressUpdate.body)).toEqual({ completedLessons: ['personal-finance.money-basics'] });
    const readingUpdate = calls.find((call) => call.url === '/api/learning/reading-list');
    expect(JSON.parse(readingUpdate.body)).toEqual({ items: [{ title: 'The Psychology of Money', status: 'Reading' }] });
  });

  it('persists a selected theme from Settings', async () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Dark' }));

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(JSON.parse(localStorage.getItem('fincoach-theme'))).toBe('dark');
  });

  it('shows real learning, quiz and reading data in the Settings profile snapshot', async () => {
    localStorage.setItem('fincoach-lessons', JSON.stringify(['personal-finance.money-basics']));
    localStorage.setItem('fincoach-quiz-attempts', JSON.stringify([{ attemptId: 'attempt-1', score: 3, total: 4 }]));
    localStorage.setItem('fincoach-reading-list', JSON.stringify([{ title: 'The Psychology of Money', status: 'Reading' }]));
    installApi();
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

    expect(await screen.findByText('1/70')).toBeTruthy();
    expect(screen.getByText('0/8')).toBeTruthy();
    expect(screen.getByText('75%')).toBeTruthy();
    expect(screen.getByText('1', { selector: '.settings-learning-grid strong' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Full progress' }));
    expect(await screen.findByRole('heading', { name: 'My progress' })).toBeTruthy();
  });

  it('saves account profile changes from Settings', async () => {
    const { calls } = installApi({ authenticated: true });
    renderApp();
    expect(await screen.findByRole('button', { name: `Account: ${account.name}` })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(await screen.findByText('Account created 3 February 2026')).toBeTruthy();
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Updated Student' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'updated@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));

    expect(await screen.findByText('Profile updated')).toBeTruthy();
    const update = calls.find((call) => call.url === '/api/auth/profile');
    expect(update?.method).toBe('PATCH');
    expect(JSON.parse(update.body)).toEqual({ name: 'Updated Student', email: 'updated@example.test' });
    expect(await screen.findByRole('button', { name: 'Account: Updated Student' })).toBeTruthy();
  });
});
