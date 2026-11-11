import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import path from 'node:path';
import { z } from 'zod';
import { calculate } from '../../shared/calculations.js';
import { books, courses } from '../../shared/learningContent.js';
import { assessmentById } from '../../shared/courseAssessments.js';
import { appendComparisonVersion, connectMongo, createComparison, createScenario, deleteComparison, deleteScenario, findComparison, findScenario, getLearningProgress, hasMongoConnection, listComparisons, listScenarios, recordQuizAttempt, renameComparison, renameScenario, saveLearningProgress, saveReadingList } from './dataStore.js';
import { registerAuthRoutes, requireAuth } from './auth.js';
import { createAuthRateLimiter } from './rateLimit.js';

const supportedTypes = ['investment', 'loan', 'credit-card', 'budget', 'savings-goal', 'buy-vs-save'];
const knownLessonIds = new Set(courses.flatMap((course) => course.modules.map((item) => item.lesson.id)));
const isServerlessPlatform = () => process.env.FINCOACH_HOSTED === 'true' || process.env.VERCEL === '1' || process.env.NETLIFY === 'true';
const isHostedFunction = () => isServerlessPlatform() || process.env.NODE_ENV === 'production';
const builtClientIndex = path.resolve(process.cwd(), 'public/index.html');
const router = express.Router();
registerAuthRoutes(router);
const snapshot = (record) => ({ id: String(record._id), type: record.type, title: record.title, inputs: record.inputs, assumptions: record.assumptions, results: record.results, schemaVersion: record.schemaVersion, createdAt: record.createdAt, updatedAt: record.updatedAt });
const fieldMessage = (error) => ({ error: error.message, field: error.field });
const flattenInputs = (value, prefix = '') => Object.entries(value ?? {}).flatMap(([key, item]) => item && typeof item === 'object' && !Array.isArray(item) ? flattenInputs(item, `${prefix}${key}.`) : [[`${prefix}${key}`, item]]);
const replayDifferences = (baseline, variant) => {
  const left = Object.fromEntries(flattenInputs(baseline)); const right = Object.fromEntries(flattenInputs(variant));
  return [...new Set([...Object.keys(left), ...Object.keys(right)])].filter((key) => JSON.stringify(left[key]) !== JSON.stringify(right[key])).map((key) => ({
    key,
    label: key.split('.').map((part) => part.replace(/([A-Z])/g, ' $1').replace(/^./, (character) => character.toUpperCase())).join(' · '),
    a: left[key] ?? '—',
    b: right[key] ?? '—',
  }));
};
const comparisonView = (record) => {
  const versionRecords = record.versions?.length ? record.versions : [{ scenario: record.scenarioB, changes: replayDifferences(record.scenarioA.inputs, record.scenarioB.inputs), notes: '', createdAt: record.createdAt }];
  const versions = versionRecords.map((version, index) => ({ ...version, versionNumber: index + 1 }));
  return { id: String(record._id), title: record.title, scenarioA: record.scenarioA, scenarioB: record.scenarioB, versions, createdAt: record.createdAt, updatedAt: record.updatedAt };
};

router.get('/health', async (_req, res) => {
  if (!isHostedFunction()) return res.json({ status: 'ok', storage: hasMongoConnection() ? 'mongodb' : 'local' });
  if (!process.env.MONGODB_URI || !process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    return res.status(503).json({ status: 'misconfigured', storage: 'unavailable' });
  }
  try {
    await connectMongo();
    return res.json({ status: 'ok', storage: 'mongodb' });
  } catch (error) {
    console.error('Hosted account database health check failed:', error.message);
    return res.status(503).json({ status: 'unavailable', storage: 'mongodb' });
  }
});
router.post('/simulations/:type', (req, res) => {
  if (!supportedTypes.includes(req.params.type)) return res.status(404).json({ error: 'Unknown simulator.' });
  try { const result = calculate(req.params.type, req.body); return res.json({ type: req.params.type, inputs: req.body, results: result }); }
  catch (error) { return res.status(400).json(fieldMessage(error)); }
});

router.get('/learning/progress', requireAuth, async (req, res) => {
  const progress = await getLearningProgress(req.userId);
  const quizAttempts = (progress.quizAttempts || [])
    .map((attempt, index) => ({ attempt, index, time: Date.parse(attempt.createdAt) || 0 }))
    .sort((left, right) => right.time - left.time || right.index - left.index)
    .map(({ attempt }) => attempt);
  res.json({ progress: { completedLessons: progress.completedLessons || [], quizAttempts, readingList: progress.readingList || [] } });
});
router.put('/learning/progress', requireAuth, async (req, res) => {
  const parsed = z.object({
    completedLessons: z.array(z.string().trim().min(1).max(120).regex(/^[a-zA-Z0-9._:-]+$/)).max(500),
  }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Check the completed lesson list.', details: parsed.error.flatten().fieldErrors });
  if (parsed.data.completedLessons.some((id) => !knownLessonIds.has(id))) {
    return res.status(400).json({ error: 'Completed lessons must match modules in the FinCoach learning library.', details: { completedLessons: ['Remove lesson IDs that are not in the current curriculum.'] } });
  }
  const completedLessons = [...new Set(parsed.data.completedLessons)];
  const progress = await saveLearningProgress(req.userId, completedLessons);
  res.json({ progress: { completedLessons: progress.completedLessons } });
});
router.post('/learning/attempts', requireAuth, async (req, res) => {
  const parsed = z.object({ attemptId: z.string().uuid(), lessonId: z.string().trim().min(1).max(120), selectedAnswer: z.number().int().min(0).max(20) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Check the quiz answer and try again.', details: parsed.error.flatten().fieldErrors });
  const lesson = courses.flatMap((course) => course.modules).map((item) => item.lesson).find((item) => item.id === parsed.data.lessonId);
  if (!lesson || parsed.data.selectedAnswer >= lesson.options.length) return res.status(404).json({ error: 'Quiz question not found.' });
  const isCorrect = parsed.data.selectedAnswer === lesson.answer;
  const attempt = {
    ...parsed.data,
    isCorrect,
    score: isCorrect ? 1 : 0,
    total: 1,
    review: [{ prompt: lesson.question, options: [...lesson.options], correctIndex: lesson.answer, explanation: lesson.why }],
    createdAt: new Date().toISOString(),
  };
  const stored = await recordQuizAttempt(req.userId, attempt);
  res.status(stored.duplicate ? 200 : 201).json({ attempt: stored.attempt, duplicate: stored.duplicate });
});
router.post('/learning/assessments/:assessmentId/attempts', requireAuth, async (req, res) => {
  const parsed = z.object({ attemptId: z.string().uuid(), answers: z.array(z.number().int().min(0).max(20)).max(30) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Check the assessment answers and try again.', details: parsed.error.flatten().fieldErrors });
  const assessment = assessmentById.get(req.params.assessmentId);
  if (!assessment) return res.status(404).json({ error: 'Course assessment not found.' });
  if (parsed.data.answers.length !== assessment.questions.length || parsed.data.answers.some((answer, index) => answer >= assessment.questions[index].options.length)) {
    return res.status(400).json({ error: 'Answer every question using one of its listed options.' });
  }
  const score = parsed.data.answers.reduce((total, answer, index) => total + Number(answer === assessment.questions[index].answer), 0);
  const attempt = {
    ...parsed.data,
    kind: 'course-assessment',
    assessmentId: assessment.id,
    courseId: assessment.courseId,
    title: assessment.title,
    score,
    total: assessment.questions.length,
    percentage: Math.round((score / assessment.questions.length) * 100),
    isCorrect: score === assessment.questions.length,
    review: assessment.questions.map((question) => ({ prompt: question.prompt, options: [...question.options], correctIndex: question.answer, explanation: question.explanation })),
    createdAt: new Date().toISOString(),
  };
  const stored = await recordQuizAttempt(req.userId, attempt);
  res.status(stored.duplicate ? 200 : 201).json({ attempt: stored.attempt, duplicate: stored.duplicate });
});
router.put('/learning/reading-list', requireAuth, async (req, res) => {
  const parsed = z.object({ items: z.array(z.object({ title: z.string().trim().min(1).max(200), status: z.enum(['Want to Read', 'Reading', 'Completed']) }).strict()).max(200) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Check the reading list entries.', details: parsed.error.flatten().fieldErrors });
  const knownTitles = new Set(books.map((book) => book.title));
  if (parsed.data.items.some((item) => !knownTitles.has(item.title))) return res.status(400).json({ error: 'That book is not in the FinCoach reading list.' });
  const items = [...new Map(parsed.data.items.map((item) => [item.title, item])).values()];
  const progress = await saveReadingList(req.userId, items);
  res.json({ readingList: progress.readingList || [] });
});

router.get('/simulations', requireAuth, async (req, res) => {
  const records = await listScenarios(req.userId);
  res.json({ simulations: records.map((item) => ({ ...item, id: String(item._id) })) });
});
router.post('/simulations', requireAuth, async (req, res) => {
  const schema = z.object({ type: z.enum(supportedTypes), title: z.string().trim().min(1).max(120).optional(), inputs: z.record(z.string(), z.unknown()) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Check the scenario details.', details: parsed.error.flatten().fieldErrors });
  try {
    const results = calculate(parsed.data.type, parsed.data.inputs);
    if (parsed.data.type === 'budget' && results.overAllocated) return res.status(400).json({ error: 'Budget allocations cannot exceed monthly income.', field: 'income' });
    const record = await createScenario({ userId: req.userId, ...parsed.data, title: parsed.data.title || `${parsed.data.type} scenario`, assumptions: { formula: results.formula, modelVersion: 1 }, results });
    return res.status(201).json({ simulation: snapshot(record) });
  } catch (error) { return res.status(400).json(fieldMessage(error)); }
});
router.get('/simulations/:id', requireAuth, async (req, res) => {
  if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(400).json({ error: 'Invalid scenario ID.' });
  const record = await findScenario(req.params.id, req.userId);
  if (!record) return res.status(404).json({ error: 'Scenario not found.' });
  res.json({ simulation: snapshot(record) });
});
router.patch('/simulations/:id', requireAuth, async (req, res) => {
  const parsed = z.object({ title: z.string().trim().min(1).max(120) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter a title up to 120 characters.' });
  if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(400).json({ error: 'Invalid scenario ID.' });
  const record = await renameScenario(req.params.id, req.userId, parsed.data.title);
  if (!record) return res.status(404).json({ error: 'Scenario not found.' });
  res.json({ simulation: snapshot(record) });
});
router.delete('/simulations/:id', requireAuth, async (req, res) => {
  if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(400).json({ error: 'Invalid scenario ID.' });
  const deleted = await deleteScenario(req.params.id, req.userId);
  if (!deleted) return res.status(404).json({ error: 'Scenario not found.' });
  res.status(204).end();
});
router.get('/comparisons', requireAuth, async (req, res) => {
  const records = await listComparisons(req.userId);
  res.json({ comparisons: records.map(comparisonView) });
});
router.post('/comparisons', requireAuth, async (req, res) => {
  const scenario = z.object({ type: z.enum(supportedTypes), inputs: z.record(z.string(), z.unknown()) });
  const parsed = z.object({ title: z.string().trim().min(1).max(120).optional(), scenarioA: scenario, scenarioB: scenario }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Both comparison snapshots are required.' });
  if (parsed.data.scenarioA.type !== parsed.data.scenarioB.type) return res.status(400).json({ error: 'Compare scenarios from the same simulator.' });
  let scenarioA; let scenarioB;
  try {
    scenarioA = { type: parsed.data.scenarioA.type, inputs: parsed.data.scenarioA.inputs, results: calculate(parsed.data.scenarioA.type, parsed.data.scenarioA.inputs) };
    scenarioB = { type: parsed.data.scenarioB.type, inputs: parsed.data.scenarioB.inputs, results: calculate(parsed.data.scenarioB.type, parsed.data.scenarioB.inputs) };
  } catch (error) { return res.status(400).json(fieldMessage(error)); }
  const initialVersion = { scenario: scenarioB, changes: replayDifferences(scenarioA.inputs, scenarioB.inputs), notes: '', createdAt: new Date().toISOString() };
  const record = await createComparison({ userId: req.userId, title: parsed.data.title, scenarioA, scenarioB, versions: [initialVersion] });
  res.status(201).json({ comparison: comparisonView(record) });
});
router.get('/comparisons/:id/versions', requireAuth, async (req, res) => {
  if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(400).json({ error: 'Invalid comparison ID.' });
  const record = await findComparison(req.params.id, req.userId);
  if (!record) return res.status(404).json({ error: 'Comparison not found.' });
  res.json({ comparison: comparisonView(record) });
});
router.post('/comparisons/:id/versions', requireAuth, async (req, res) => {
  if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(400).json({ error: 'Invalid comparison ID.' });
  const parsed = z.object({ inputs: z.record(z.string(), z.unknown()), notes: z.string().trim().max(500).optional().default('') }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Check the replay inputs and notes.', details: parsed.error.flatten().fieldErrors });
  const record = await findComparison(req.params.id, req.userId);
  if (!record) return res.status(404).json({ error: 'Comparison not found.' });
  const type = record.scenarioA.type;
  let results;
  try { results = calculate(type, parsed.data.inputs); }
  catch (error) { return res.status(400).json(fieldMessage(error)); }
  if (type === 'budget' && results.overAllocated) return res.status(400).json({ error: 'Budget allocations cannot exceed monthly income.', field: 'income' });
  const scenario = { type, inputs: parsed.data.inputs, results };
  const version = { scenario, changes: replayDifferences(record.scenarioA.inputs, scenario.inputs), notes: parsed.data.notes, createdAt: new Date().toISOString() };
  const initialVersion = { scenario: record.scenarioB, changes: replayDifferences(record.scenarioA.inputs, record.scenarioB.inputs), notes: '', createdAt: record.createdAt };
  const updated = await appendComparisonVersion(req.params.id, req.userId, version, initialVersion);
  if (!updated) return res.status(404).json({ error: 'Comparison not found.' });
  const view = comparisonView(updated);
  res.status(201).json({ comparison: view, version: view.versions.at(-1) });
});
router.patch('/comparisons/:id', requireAuth, async (req, res) => {
  const parsed = z.object({ title: z.string().trim().min(1).max(120) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter a comparison title up to 120 characters.' });
  if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(400).json({ error: 'Invalid comparison ID.' });
  const record = await renameComparison(req.params.id, req.userId, parsed.data.title);
  if (!record) return res.status(404).json({ error: 'Comparison not found.' });
  res.json({ comparison: comparisonView(record) });
});
router.delete('/comparisons/:id', requireAuth, async (req, res) => {
  if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(400).json({ error: 'Invalid comparison ID.' });
  const deleted = await deleteComparison(req.params.id, req.userId);
  if (!deleted) return res.status(404).json({ error: 'Comparison not found.' });
  res.status(204).end();
});

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (isServerlessPlatform()) app.set('trust proxy', 1);
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });
  const configuredClientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5176';
  app.use(cors({ origin(origin, callback) {
    const isLocalPreview = !isHostedFunction() && /^https?:\/\/(?:localhost|127\.0\.0\.1):\d+$/.test(origin || '');
    if (!origin || origin === configuredClientOrigin || isLocalPreview) return callback(null, origin || configuredClientOrigin);
    return callback(null, false);
  }, credentials: true }));
  app.use(express.json({ limit: '32kb' }));
  app.use(cookieParser());
  app.use('/api/auth', createAuthRateLimiter());
  app.use('/api', async (req, res, next) => {
    if (!isHostedFunction()) return next();
    const publicRequest = (req.method === 'GET' && req.path === '/health')
      || (req.method === 'POST' && new RegExp(`^/simulations/(?:${supportedTypes.join('|')})$`).test(req.path));
    if (publicRequest) return next();
    if (!process.env.MONGODB_URI || !process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
      return res.status(503).json({ error: 'Account service is not configured yet. Please try again later.' });
    }
    try { await connectMongo(); return next(); }
    catch (error) {
      console.error('Hosted account database connection failed:', error.message);
      return res.status(503).json({ error: 'Account service is temporarily unavailable. Please try again shortly.' });
    }
  });
  app.use('/api', router);
  app.use((req, res) => {
    if (req.path === '/api' || req.path.startsWith('/api/')) return res.status(404).json({ error: 'API route not found.' });
    if (process.env.VERCEL === '1' && req.method === 'GET') return res.sendFile(builtClientIndex, (error) => {
      if (error && !res.headersSent) res.status(404).send('FinCoach was not built. Redeploy the project and try again.');
    });
    return res.status(404).send('Not found');
  });
  app.use((error, _req, res, _next) => {
    if (error instanceof SyntaxError && 'body' in error) return res.status(400).json({ error: 'Request body must be valid JSON.' });
    console.error('Request failed:', error.message);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  });
  return app;
}
