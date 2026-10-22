const fail = (field, message) => { throw Object.assign(new Error(message), { field }); };
const positive = (value, field, label, allowZero = false) => {
  const n = Number(value);
  if (!Number.isFinite(n) || (allowZero ? n < 0 : n <= 0)) fail(field, `${label} must be a valid ${allowZero ? 'non-negative' : 'positive'} number.`);
  return n;
};
const bounded = (value, field, label, min, max, allowZero = false) => {
  const n = positive(value, field, label, allowZero);
  if (n < min || n > max) fail(field, `${label} must be between ${min} and ${max}.`);
  return n;
};

export function calculateInvestment(input) {
  const principal = positive(input.principal, 'principal', 'Starting amount');
  const years = bounded(input.years, 'years', 'Duration', 1, 60);
  const rate = bounded(input.rate, 'rate', 'Annual rate', 0, 100, true) / 100;
  const fdRate = bounded(input.fdRate ?? 6.5, 'fdRate', 'Assumed FD rate', 0, 100, true) / 100;
  const frequency = bounded(input.frequency ?? 1, 'frequency', 'Compounds per year', 1, 12);
  if (!Number.isInteger(frequency)) fail('frequency', 'Compounds per year must be a whole number.');
  const periods = years * frequency;
  const value = principal * (1 + rate / frequency) ** periods;
  const fdValue = principal * (1 + fdRate / frequency) ** periods;
  const chartSteps = Math.min(Math.ceil(years), 30);
  const chart = Array.from({ length: chartSteps + 1 }, (_, step) => { const time = years * step / chartSteps; return { period: `Year ${Number(time.toFixed(2))}`, value: principal * (1 + rate / frequency) ** (time * frequency), fdValue: principal * (1 + fdRate / frequency) ** (time * frequency) }; });
  return { finalValue: value, gain: value - principal, fdValue, differenceVsFd: value - fdValue, fdRate: fdRate * 100, principal, years, rate: rate * 100, frequency, chart, formula: 'A = P × (1 + r ÷ n)^(n × t)' };
}

export function calculateLoan(input) {
  const principal = positive(input.principal, 'principal', 'Loan amount');
  const annualRate = bounded(input.rate, 'rate', 'Annual interest rate', 0, 100, true);
  const months = bounded(input.months, 'months', 'Loan term in months', 1, 600);
  if (!Number.isInteger(months)) fail('months', 'Loan term must be a whole number of months.');
  const monthlyRate = annualRate / 1200;
  const emi = monthlyRate === 0 ? principal / months : principal * monthlyRate * (1 + monthlyRate) ** months / ((1 + monthlyRate) ** months - 1);
  let balance = principal;
  const schedule = [];
  for (let month = 1; month <= months; month += 1) {
    const interest = balance * monthlyRate;
    const payment = Math.min(emi, balance + interest);
    balance = Math.max(0, balance + interest - payment);
    schedule.push({ period: `Month ${month}`, balance, interest, payment });
  }
  return { emi, totalPaid: emi * months, totalInterest: emi * months - principal, principal, months, annualRate, schedule, formula: monthlyRate === 0 ? 'EMI = P ÷ n (zero-interest loan)' : 'EMI = P × i × (1 + i)^n ÷ ((1 + i)^n − 1)' };
}

export function calculateBudget(input) {
  const income = positive(input.income, 'income', 'Monthly income');
  const categories = Object.entries(input.categories ?? {}).map(([name, raw]) => ({ name, value: positive(raw, `category:${name}`, `${name} allocation`, true) }));
  if (!categories.length) fail('categories', 'Add at least one budget category.');
  const allocated = categories.reduce((sum, item) => sum + item.value, 0);
  return { income, allocated, remaining: income - allocated, savingsRate: (categories.find((x) => x.name.toLowerCase().includes('saving'))?.value ?? 0) / income * 100, overAllocated: allocated > income, categories, formula: 'Remaining = monthly income − sum of category allocations' };
}

export function calculateCard(input) {
  const balance = positive(input.balance, 'balance', 'Card balance');
  const apr = bounded(input.apr, 'apr', 'Annual percentage rate', 0, 100, true);
  const payment = positive(input.payment, 'payment', 'Monthly payment');
  const monthlyRate = apr / 1200;
  const schedule = [];
  let remaining = balance;
  let totalInterest = 0;
  for (let month = 1; month <= 600 && remaining > 0.005; month += 1) {
    const interest = remaining * monthlyRate;
    const due = remaining + interest;
    const paid = Math.min(payment, due);
    remaining = Math.max(0, due - paid);
    totalInterest += interest;
    schedule.push({ period: `Month ${month}`, balance: remaining, interest, payment: paid });
    if (payment <= interest && remaining > 0) fail('payment', 'Monthly payment must exceed the first month’s interest to reduce the balance.');
  }
  if (remaining > 0.005) fail('payment', 'This payment does not clear the balance within 600 months. Increase the payment.');
  const fullPaymentInterest = balance * monthlyRate;
  return { balance, apr, monthlyPayment: payment, months: schedule.length, totalInterest, totalPaid: balance + totalInterest, fullPaymentInterest, schedule, formula: 'Monthly interest = opening balance × APR ÷ 12; payment is applied after interest.' };
}

export function calculate(type, inputs) {
  if (type === 'investment') return calculateInvestment(inputs);
  if (type === 'loan') return calculateLoan(inputs);
  if (type === 'budget') return calculateBudget(inputs);
  if (type === 'credit-card') return calculateCard(inputs);
  fail('type', 'Choose a supported simulator.');
}
