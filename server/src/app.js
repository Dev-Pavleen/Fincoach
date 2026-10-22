import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { z } from 'zod';
import { calculate } from '../../shared/calculations.js';
import { createComparison, createScenario, deleteComparison, deleteScenario, findScenario, listComparisons, listScenarios, renameComparison, renameScenario } from './dataStore.js';
import { registerAuthRoutes, requireAuth } from './auth.js';

const supportedTypes = ['investment', 'loan', 'credit-card', 'budget'];
const router = express.Router();
registerAuthRoutes(router);
const snapshot = (record) => ({ id: String(record._id), type: record.type, title: record.title, inputs: record.inputs, assumptions: record.assumptions, results: record.results, schemaVersion: record.schemaVersion, createdAt: record.createdAt, updatedAt: record.updatedAt });
const fieldMessage = (error) => ({ error: error.message, field: error.field });

router.get('/health', (_req, res) => res.json({ status: 'ok' }));
router.post('/simulations/:type', (req, res) => {
  if (!supportedTypes.includes(req.params.type)) return res.status(404).json({ error: 'Unknown simulator.' });
  try { const result = calculate(req.params.type, req.body); return res.json({ type: req.params.type, inputs: req.body, results: result }); }
  catch (error) { return res.status(400).json(fieldMessage(error)); }
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
  res.json({ comparisons: records.map((item) => ({ id: String(item._id), title: item.title, scenarioA: item.scenarioA, scenarioB: item.scenarioB, createdAt: item.createdAt })) });
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
  const record = await createComparison({ userId: req.userId, title: parsed.data.title, scenarioA, scenarioB });
  res.status(201).json({ comparison: { id: String(record._id), title: record.title, scenarioA: record.scenarioA, scenarioB: record.scenarioB, createdAt: record.createdAt } });
});
router.patch('/comparisons/:id', requireAuth, async (req, res) => {
  const parsed = z.object({ title: z.string().trim().min(1).max(120) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter a comparison title up to 120 characters.' });
  if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(400).json({ error: 'Invalid comparison ID.' });
  const record = await renameComparison(req.params.id, req.userId, parsed.data.title);
  if (!record) return res.status(404).json({ error: 'Comparison not found.' });
  res.json({ comparison: { id: String(record._id), title: record.title, scenarioA: record.scenarioA, scenarioB: record.scenarioB, createdAt: record.createdAt } });
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
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });
  app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173', credentials: true }));
  app.use(express.json({ limit: '32kb' }));
  app.use(cookieParser());
  app.use('/api', router);
  app.use((error, _req, res, _next) => {
    if (error instanceof SyntaxError && 'body' in error) return res.status(400).json({ error: 'Request body must be valid JSON.' });
    console.error('Request failed:', error.message);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  });
  return app;
}
