import test, { after } from 'node:test';
import assert from 'node:assert/strict';

const originalEnvironment = {
  hosted: process.env.FINCOACH_HOSTED,
  mongo: process.env.MONGODB_URI,
  secret: process.env.JWT_SECRET,
};
process.env.FINCOACH_HOSTED = 'true';
delete process.env.MONGODB_URI;
delete process.env.JWT_SECRET;
const { handler } = await import('../../netlify/functions/api.mjs');

after(() => {
  if (originalEnvironment.hosted === undefined) delete process.env.FINCOACH_HOSTED;
  else process.env.FINCOACH_HOSTED = originalEnvironment.hosted;
  if (originalEnvironment.mongo === undefined) delete process.env.MONGODB_URI;
  else process.env.MONGODB_URI = originalEnvironment.mongo;
  if (originalEnvironment.secret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalEnvironment.secret;
});

const callFunction = (path, method = 'GET', body) => handler({
  path,
  httpMethod: method,
  headers: { host: 'fincoach.netlify.app', 'content-type': 'application/json' },
  queryStringParameters: null,
  body: body === undefined ? null : JSON.stringify(body),
  isBase64Encoded: false,
}, {});

test('Netlify function serves public simulator results through its API adapter', async () => {
  const response = await callFunction('/api/simulations/investment', 'POST', { principal: 20000, years: 5, rate: 8 });
  assert.equal(response.statusCode, 200, response.body);
  const result = JSON.parse(response.body);
  assert.equal(result.type, 'investment');
  assert.ok(Math.abs(result.results.finalValue - 29386.56) < 0.02);
});

test('Netlify function returns both card payoff paths from the shared calculation engine', async () => {
  const response = await callFunction('/api/simulations/credit-card', 'POST', {
    balance: 12000, apr: 24, payment: 2000, minimumPaymentRate: 5, minimumPaymentFloor: 100,
  });
  assert.equal(response.statusCode, 200, response.body);
  const result = JSON.parse(response.body).results;
  assert.equal(result.minimumPaymentRate, 5);
  assert.equal(result.minimumSchedule[0].payment, 612);
  assert.equal(result.comparisonChart[0].higherPaymentBalance, result.schedule[0].balance);
});

test('Netlify function reports hosted account configuration without using local storage', async () => {
  const response = await callFunction('/api/health');
  assert.equal(response.statusCode, 503);
  assert.deepEqual(JSON.parse(response.body), { status: 'misconfigured', storage: 'unavailable' });
});
