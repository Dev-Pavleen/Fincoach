export function createAuthRateLimiter({ limit = 10, windowMs = 15 * 60 * 1000, now = Date.now } = {}) {
  const attempts = new Map();

  return function authRateLimit(req, res, next) {
    if (req.method !== 'POST' || !['/register', '/login'].includes(req.path)) return next();

    const currentTime = now();
    const key = `${req.ip || req.socket?.remoteAddress || 'unknown'}:${req.path}`;
    let entry = attempts.get(key);
    if (!entry || currentTime >= entry.resetAt) {
      entry = { count: 0, resetAt: currentTime + windowMs };
      attempts.set(key, entry);
    }
    entry.count += 1;

    res.setHeader('RateLimit-Limit', String(limit));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, limit - entry.count)));
    res.setHeader('RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));
    if (attempts.size > 5000) {
      for (const [storedKey, storedEntry] of attempts) {
        if (currentTime >= storedEntry.resetAt) attempts.delete(storedKey);
      }
    }
    if (entry.count > limit) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((entry.resetAt - currentTime) / 1000))));
      return res.status(429).json({ error: 'Too many sign-in attempts. Wait a few minutes and try again.' });
    }
    return next();
  };
}
