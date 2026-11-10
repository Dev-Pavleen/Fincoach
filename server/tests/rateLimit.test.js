import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthRateLimiter } from '../src/rateLimit.js';

function callLimiter(limiter, { method = 'POST', path = '/login', ip = '127.0.0.1' } = {}) {
  const headers = {};
  let statusCode = 200;
  let payload;
  let nextCalled = false;
  const response = {
    setHeader(name, value) { headers[name] = value; },
    status(code) { statusCode = code; return this; },
    json(value) { payload = value; return this; },
  };
  limiter({ method, path, ip }, response, () => { nextCalled = true; });
  return { headers, statusCode, payload, nextCalled };
}

test('auth rate limiter caps login attempts per IP and route, then expires the window', () => {
  let currentTime = 1_000_000;
  const limiter = createAuthRateLimiter({ limit: 2, windowMs: 60_000, now: () => currentTime });
  assert.equal(callLimiter(limiter).nextCalled, true);
  assert.equal(callLimiter(limiter).nextCalled, true);
  const blocked = callLimiter(limiter);
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.payload.error, 'Too many sign-in attempts. Wait a few minutes and try again.');
  assert.equal(blocked.headers['Retry-After'], '60');
  assert.equal(callLimiter(limiter, { path: '/register' }).nextCalled, true);
  assert.equal(callLimiter(limiter, { ip: '192.0.2.10' }).nextCalled, true);
  assert.equal(callLimiter(limiter, { method: 'GET' }).nextCalled, true);
  currentTime += 60_001;
  assert.equal(callLimiter(limiter).nextCalled, true);
});
