import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import App from './App.jsx';

const account = { id: 'user-1', name: 'Demo Student', email: 'demo@example.test' };
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
    render(<App />);

    expect(await screen.findByRole('button', { name: `Account: ${account.name}` })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/me', { credentials: 'include' });
  });

  it('submits login credentials and exposes the password visibility toggle', async () => {
    const { calls } = installApi();
    render(<App />);
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
    const login = calls.find((call) => call.url === '/api/auth/login');
    expect(login).toBeTruthy();
    expect(JSON.parse(login.body)).toEqual({ email: account.email, password: 'learning123' });
  });

  it('submits a matching registration and keeps the new account signed in', async () => {
    const { calls } = installApi();
    render(<App />);
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

  it('persists a selected theme from Settings', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Dark' }));

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(JSON.parse(localStorage.getItem('fincoach-theme'))).toBe('dark');
  });

  it('saves account profile changes from Settings', async () => {
    const { calls } = installApi({ authenticated: true });
    render(<App />);
    expect(await screen.findByRole('button', { name: `Account: ${account.name}` })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
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
