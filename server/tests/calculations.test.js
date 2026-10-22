import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateBudget, calculateCard, calculateInvestment, calculateLoan } from '../../shared/calculations.js';

test('investment uses the disclosed compound growth formula', () => {
  const result = calculateInvestment({ principal: 20000, years: 5, rate: 8, frequency: 1 });
  assert.ok(Math.abs(result.finalValue - 29386.56) < 0.01);
  assert.ok(Math.abs(result.gain - 9386.56) < 0.01);
  assert.ok(result.fdValue < result.finalValue);
  assert.equal(result.chart.at(-1).value, result.finalValue);
  assert.equal(result.chart.at(-1).fdValue, result.fdValue);
});

test('fractional investment horizons keep the formula and chart on the same timeline', () => {
  const result = calculateInvestment({ principal: 20000, years: 2.5, rate: 8, frequency: 1 });
  const expected = 20000 * (1 + 0.08) ** 2.5;
  assert.ok(Math.abs(result.finalValue - expected) < 1e-8);
  assert.equal(result.chart.at(-1).value, result.finalValue);
  assert.equal(result.chart.at(-1).fdValue, result.fdValue);
});

test('loan supports zero interest and standard positive interest', () => {
  const zero = calculateLoan({ principal: 120000, rate: 0, months: 12 });
  assert.equal(zero.emi, 10000);
  assert.equal(zero.totalInterest, 0);
  const standard = calculateLoan({ principal: 500000, rate: 9, months: 60 });
  assert.ok(Math.abs(standard.emi - 10379.18) < 0.02);
  assert.ok(standard.totalInterest > 0);
});

test('budget reports balanced, remaining, and over-allocated amounts', () => {
  assert.equal(calculateBudget({ income: 100, categories: { Savings: 20, Needs: 80 } }).remaining, 0);
  assert.equal(calculateBudget({ income: 100, categories: { Needs: 120 } }).overAllocated, true);
  assert.equal(calculateBudget({ income: 100, categories: { Savings: 25 } }).savingsRate, 25);
});

test('credit-card schedule is reproducible and requires payments above interest', () => {
  const result = calculateCard({ balance: 10000, apr: 12, payment: 1000 });
  assert.equal(result.schedule[0].interest, 100);
  assert.equal(result.schedule[0].balance, 9100);
  assert.ok(result.months > 0 && result.totalInterest > 0);
  assert.throws(() => calculateCard({ balance: 10000, apr: 12, payment: 100 }), /must exceed the first month’s interest/);
});

test('invalid and non-finite values are rejected with a field name', () => {
  assert.throws(() => calculateInvestment({ principal: -1, years: 5, rate: 8 }), (error) => error.field === 'principal');
  assert.throws(() => calculateLoan({ principal: 100, rate: 5, months: 'NaN' }), (error) => error.field === 'months');
});
