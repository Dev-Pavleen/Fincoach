import test from 'node:test';
import assert from 'node:assert/strict';
import { alignReplayRows, calculate, calculateBudget, calculateBuyVsSave, calculateCard, calculateInvestment, calculateLoan, calculateSavingsGoal, investmentValueAt, monthEndAfterPeriods } from '../../shared/calculations.js';

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
  const partialMonth = calculateInvestment({ principal: 20000, years: 2.45, rate: 8, frequency: 1 });
  assert.ok(Math.abs(partialMonth.finalValue - (20000 * (1 + 0.08) ** 2.45)) < 1e-8);
  assert.equal(partialMonth.chart.at(-1).period, 'Year 2.45');
  assert.ok(Math.abs(investmentValueAt(partialMonth, 2.45) - partialMonth.finalValue) < 1e-8);
  const contributionTimeline = calculateInvestment({ principal: 1000, monthlyContribution: 100, years: 1.05, rate: 8, fdRate: 8 });
  assert.ok(Math.abs(investmentValueAt(contributionTimeline, 1.05) - contributionTimeline.finalValue) < 1e-8);
  const partialContributionMonth = calculateInvestment({ principal: 1000, monthlyContribution: 100, years: 1.05, rate: 0, fdRate: 0 });
  assert.equal(partialContributionMonth.totalInvested, 2200);
  assert.equal(partialContributionMonth.finalValue, 2200);
});

test('investment includes end-of-month contributions, annual increases, and inflation', () => {
  const result = calculateInvestment({ principal: 20000, monthlyContribution: 1000, years: 1, rate: 0, fdRate: 0, annualIncrease: 0, inflation: 10 });
  assert.equal(result.finalValue, 32000);
  assert.equal(result.totalInvested, 32000);
  assert.equal(result.gain, 0);
  assert.ok(Math.abs(result.inflationAdjustedValue - 32000 / 1.1) < 0.001);
  const raised = calculateInvestment({ principal: 1000, monthlyContribution: 100, years: 2, rate: 0, annualIncrease: 10 });
  assert.equal(raised.totalInvested, 3520);
  assert.equal(raised.finalValue, 3520);
});

test('loan supports zero interest and standard positive interest', () => {
  const zero = calculateLoan({ principal: 120000, rate: 0, months: 12 });
  assert.equal(zero.emi, 10000);
  assert.equal(zero.totalInterest, 0);
  const standard = calculateLoan({ principal: 500000, rate: 9, months: 60 });
  assert.ok(Math.abs(standard.emi - 10379.18) < 0.02);
  assert.ok(standard.totalInterest > 0);
});

test('loan extra payments reduce term and interest and include the processing fee in total cost', () => {
  const base = calculateLoan({ principal: 100000, rate: 12, months: 24 });
  const faster = calculateLoan({ principal: 100000, rate: 12, months: 24, extraMonthlyPayment: 2000, prepayment: 5000, processingFee: 750 });
  assert.ok(faster.monthsPaid < faster.months);
  assert.ok(faster.totalInterest < base.totalInterest);
  assert.ok(faster.interestSaved > 0);
  assert.ok(Math.abs(faster.totalPaid - faster.totalInterest - 100000 - 750) < 0.01);
  assert.equal(faster.schedule[0].openingBalance, 100000);
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
  assert.throws(() => calculateCard({ balance: 10000, apr: 12, payment: 100 }), /must exceed new spending and accrued interest/);
});

test('card payoff compares the base payment with an extra-payment plan', () => {
  const base = calculateCard({ balance: 12000, apr: 24, payment: 1000 });
  const faster = calculateCard({ balance: 12000, apr: 24, payment: 1000, additionalMonthlyPayment: 500, newSpending: 0 });
  assert.equal(faster.monthlyPayment, 1500);
  assert.ok(faster.months < base.months);
  assert.ok(faster.totalInterest < base.totalInterest);
  assert.ok(faster.interestSaved > 0);
});

test('savings goal estimates required monthly contributions and progress', () => {
  const targetDate = new Date();
  targetDate.setFullYear(targetDate.getFullYear() + 1);
  const result = calculateSavingsGoal({ target: 12000, currentSavings: 0, monthlyContribution: 500, annualRate: 0, targetDate: targetDate.toISOString().slice(0, 10) });
  assert.equal(result.estimatedMonths, 24);
  assert.equal(result.projectedAtTarget, 6000);
  assert.equal(result.targetReachedByDate, false);
  assert.equal(result.requiredMonthlyContribution, 1000);
  const now = new Date();
  const expectedCompletion = monthEndAfterPeriods(now, result.estimatedMonths);
  assert.equal(result.completionDate, expectedCompletion, 'completion date should match the month-end deposit schedule');
  assert.throws(() => calculateSavingsGoal({ target: 1000, currentSavings: 0, monthlyContribution: 100, targetDate: '2000-01-01' }), (error) => error.field === 'targetDate');
});

test('savings completion date counts eligible month ends when starting on a month end', () => {
  assert.equal(monthEndAfterPeriods(new Date('2026-07-31T00:00:00.000Z'), 0), '2026-07-31');
  assert.equal(monthEndAfterPeriods(new Date('2026-07-31T00:00:00.000Z'), 1), '2026-08-31');
  assert.equal(monthEndAfterPeriods(new Date('2026-07-31T00:00:00.000Z'), 2), '2026-09-30');
  assert.equal(monthEndAfterPeriods(new Date('2026-07-30T00:00:00.000Z'), 1), '2026-07-31');
  assert.throws(() => monthEndAfterPeriods(new Date('invalid'), 1), /valid/i);
});

test('savings projections count only month-end deposits on or before the target date', () => {
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const tomorrow = new Date(todayUtc + 86_400_000);
  const targetDate = tomorrow.toISOString().slice(0, 10);
  const monthEnd = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0);
  const expectedPeriods = monthEnd > todayUtc && monthEnd <= tomorrow.getTime() ? 1 : 0;
  const result = calculateSavingsGoal({ target: 10000, currentSavings: 1000, monthlyContribution: 100, annualRate: 0, targetDate });
  assert.equal(result.contributionPeriodsUntilTarget, expectedPeriods);
  assert.equal(result.projectedAtTarget, 1000 + expectedPeriods * 100);
  assert.equal(result.requiredMonthlyContribution, expectedPeriods ? 9000 / expectedPeriods : null);
});

test('replay chart rows match by period instead of decimated array position', () => {
  const left = [{ period: 'Today', balance: 1000 }, { period: 'Month 1', balance: 1100 }, { period: 'Month 2', balance: 1200 }, { period: 'Month 4', balance: 1400 }];
  const right = [{ period: 'Today', balance: 2000 }, { period: 'Month 1', balance: 2100 }, { period: 'Month 2', balance: 2200 }, { period: 'Month 3', balance: 2300 }, { period: 'Month 4', balance: 2400 }];
  const aligned = alignReplayRows(left, right, 'balance');
  assert.deepEqual(aligned.find((item) => item.period === 'Month 2'), { period: 'Month 2', A: 1200, B: 2200 });
  assert.deepEqual(aligned.find((item) => item.period === 'Month 3'), { period: 'Month 3', A: undefined, B: 2300 });
});

test('buy-versus-save comparison calculates time, fees, and financed costs', () => {
  const result = calculateBuyVsSave({ itemPrice: 12000, availableSavings: 4000, monthlySavings: 2000, cardApr: 24, loanRate: 0, months: 4, cardFee: 100, loanFee: 500 });
  assert.equal(result.options[0].monthsToPurchase, 4);
  assert.equal(result.options[0].totalCost, 12000);
  assert.equal(result.options[2].monthlyPayment, 3000);
  assert.equal(result.options[2].totalCost, 12500);
  assert.ok(result.options[1].totalCost > result.options[2].totalCost);
});

test('invalid and non-finite values are rejected with a field name', () => {
  assert.throws(() => calculateInvestment({ principal: -1, years: 5, rate: 8 }), (error) => error.field === 'principal');
  assert.throws(() => calculateLoan({ principal: 100, rate: 5, months: 'NaN' }), (error) => error.field === 'months');
  assert.throws(() => calculateInvestment({ principal: true, years: 5, rate: 8 }), (error) => error.field === 'principal');
  assert.throws(() => calculateLoan({ principal: [100], rate: 5, months: 12 }), (error) => error.field === 'principal');
  assert.throws(() => calculateBudget({ income: 100, categories: { Needs: [] } }), (error) => error.field === 'category:Needs');
  assert.throws(() => calculateInvestment({ principal: 1e13, years: 5, rate: 8 }), (error) => error.field === 'principal');
  assert.throws(() => calculate('investment', null), (error) => error.field === 'inputs');
  const tooManyCategories = Object.fromEntries(Array.from({ length: 101 }, (_, index) => [`Category ${index}`, 0]));
  assert.throws(() => calculateBudget({ income: 100, categories: tooManyCategories }), (error) => error.field === 'categories');
});
