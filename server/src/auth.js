import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { createUser, deleteUserAndOwnedData, findUserByEmail, findUserById, updateUserPassword, updateUserProfile } from './dataStore.js';

const emailSchema = z.string().trim().email().max(254);
const passwordInputSchema = z.string().min(8, 'Password must be at least 8 characters.').max(128, 'Password cannot exceed 128 characters.');
const bcryptSafePassword = (schema) => schema.refine((password) => Buffer.byteLength(password, 'utf8') <= 72, 'Password cannot exceed 72 UTF-8 bytes.');
const passwordSchema = bcryptSafePassword(passwordInputSchema.regex(/^(?=.*[A-Za-z])(?=.*\d).+$/, 'Password must include at least one letter and one number.'));
const loginCredentials = z.object({ email: emailSchema, password: bcryptSafePassword(passwordInputSchema) });
const registration = z.object({ email: emailSchema, password: passwordSchema,
  name: z.string().trim().min(1).max(80),
  confirmPassword: z.string().min(1, 'Confirm your password.'),
}).refine((data) => data.password === data.confirmPassword, {
  path: ['confirmPassword'],
  message: 'Passwords do not match.',
});
const cookieName = 'fincoach_session';
const cookieOptions = () => ({ httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' || process.env.FINCOACH_HOSTED === 'true' || process.env.NETLIFY === 'true' || process.env.VERCEL === '1', path: '/', maxAge: 1000 * 60 * 60 * 24 * 7 });
const safeUser = (user) => ({
  id: String(user._id),
  name: user.name,
  email: user.email,
  createdAt: user.createdAt ? new Date(user.createdAt).toISOString() : null,
});

export function requireAuth(req, res, next) {
  const token = req.cookies?.[cookieName];
  if (!token) return res.status(401).json({ error: 'Sign in to access saved scenarios.' });
  try { req.userId = jwt.verify(token, process.env.JWT_SECRET).sub; return next(); }
  catch { res.clearCookie(cookieName, cookieOptions()); return res.status(401).json({ error: 'Your session has expired. Please sign in again.' }); }
}

export function registerAuthRoutes(router) {
  router.post('/auth/register', async (req, res) => {
    const parsed = registration.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Check your details.', details: parsed.error.flatten().fieldErrors });
    const { name, email: submittedEmail, password } = parsed.data;
    const email = submittedEmail.toLowerCase();
    if (await findUserByEmail(email)) return res.status(409).json({ error: 'An account with this email already exists.' });
    try {
      const user = await createUser({ name, email, passwordHash: await bcrypt.hash(password, 12) });
      if (!user) return res.status(409).json({ error: 'An account with this email already exists.' });
      res.cookie(cookieName, jwt.sign({}, process.env.JWT_SECRET, { subject: String(user._id), expiresIn: '7d' }), cookieOptions());
      return res.status(201).json({ user: safeUser(user) });
    } catch (error) {
      // A concurrent registration can win after the pre-check but before Mongo's unique index.
      if (error.code === 11000 || error.codeName === 'DuplicateKey') return res.status(409).json({ error: 'An account with this email already exists.' });
      throw error;
    }
  });
  router.post('/auth/login', async (req, res) => {
    const parsed = loginCredentials.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Enter a valid email and password.' });
    const user = await findUserByEmail(parsed.data.email.toLowerCase(), true);
    if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) return res.status(401).json({ error: 'Email or password is incorrect.' });
    res.cookie(cookieName, jwt.sign({}, process.env.JWT_SECRET, { subject: String(user._id), expiresIn: '7d' }), cookieOptions());
    res.json({ user: safeUser(user) });
  });
  router.post('/auth/logout', (_req, res) => { res.clearCookie(cookieName, cookieOptions()); res.status(204).end(); });
  router.get('/auth/me', requireAuth, async (req, res) => { const user = await findUserById(req.userId); if (!user) return res.status(401).json({ error: 'Account not found.' }); res.json({ user: safeUser(user) }); });
  router.patch('/auth/profile', requireAuth, async (req, res) => {
    const parsed = z.object({ name: z.string().trim().min(1).max(80), email: z.string().trim().email().max(254) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Enter a valid name and email address.' });
    try {
      const user = await updateUserProfile(req.userId, { name: parsed.data.name, email: parsed.data.email.toLowerCase() });
      if (!user) return res.status(409).json({ error: 'That email is already in use or the account no longer exists.' });
      res.json({ user: safeUser(user) });
    } catch (error) { if (error.code === 11000) return res.status(409).json({ error: 'That email is already in use.' }); throw error; }
  });
  router.patch('/auth/password', requireAuth, async (req, res) => {
    const parsed = z.object({ currentPassword: bcryptSafePassword(passwordInputSchema), newPassword: passwordSchema }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Check your password details.', details: parsed.error.flatten().fieldErrors });
    const user = await findUserById(req.userId, true);
    if (!user || !(await bcrypt.compare(parsed.data.currentPassword, user.passwordHash))) return res.status(401).json({ error: 'Current password is incorrect.' });
    await updateUserPassword(req.userId, await bcrypt.hash(parsed.data.newPassword, 12));
    res.json({ message: 'Password updated.' });
  });
  router.delete('/auth/account', requireAuth, async (req, res) => {
    const parsed = z.object({ currentPassword: bcryptSafePassword(passwordInputSchema) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Enter your current password to delete your account.' });
    const user = await findUserById(req.userId, true);
    if (!user || !(await bcrypt.compare(parsed.data.currentPassword, user.passwordHash))) return res.status(401).json({ error: 'Current password is incorrect.' });
    await deleteUserAndOwnedData(req.userId);
    res.clearCookie(cookieName, cookieOptions()).status(204).end();
  });
}
