const fail = (field, message) => { throw Object.assign(new Error(message), { field }); };
const MAX_AMOUNT = 1_000_000_000_000;
const positive = (value, field, label, allowZero = false) => {
  if (!['number', 'string'].includes(typeof value) || (typeof value === 'string' && !value.trim())) fail(field, `${label} must be a valid number.`);
  const n = Number(value);
  if (!Number.isFinite(n) || (allowZero ? n < 0 : n <= 0)) fail(field, `${label} must be a valid ${allowZero ? 'non-negative' : 'positive'} number.`);
  if (n > MAX_AMOUNT) fail(field, `${label} cannot exceed ₹${MAX_AMOUNT.toLocaleString('en-IN')}.`);
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
  const monthlyContribution = positive(input.monthlyContribution ?? 0, 'monthlyContribution', 'Monthly contribution', true);
  const annualIncrease = bounded(input.annualIncrease ?? 0, 'annualIncrease', 'Annual contribution increase', 0, 100, true) / 100;
  const inflation = bounded(input.inflation ?? 0, 'inflation', 'Inflation assumption', 0, 100, true) / 100;
  const months = years * 12;
  const completeMonths = Math.floor(months);
  const finalMonthFraction = months - completeMonths;
  const buildPath = (annualRate) => {
    const monthlyRate = (1 + annualRate / frequency) ** (frequency / 12) - 1;
    let balance = principal;
    let contributions = 0;
    const chart = [{ period: 'Today', value: balance, invested: balance }];
    for (let month = 1; month <= completeMonths; month += 1) {
      balance *= 1 + monthlyRate;
      const contribution = monthlyContribution * (1 + annualIncrease) ** Math.floor((month - 1) / 12);
      balance += contribution;
      contributions += contribution;
      if (month % 12 === 0 || month === months) chart.push({ period: `Year ${(month / 12).toFixed(month % 12 ? 1 : 0)}`, value: balance, invested: principal + contributions });
    }
    if (finalMonthFraction > 1e-10) {
      balance *= (1 + monthlyRate) ** finalMonthFraction;
      chart.push({ period: `Year ${Number(years.toFixed(2))}`, value: balance, invested: principal + contributions });
    }
    return { value: balance, chart };
  };
  const growth = buildPath(rate);
  const fdGrowth = buildPath(fdRate);
  const value = growth.value;
  const fdValue = fdGrowth.value;
  const totalInvested = growth.chart.at(-1).invested;
  const inflationAdjustedValue = value / (1 + inflation) ** years;
  return {
    finalValue: value, gain: value - totalInvested, totalInvested, fdValue, differenceVsFd: value - fdValue,
    inflationAdjustedValue, inflationRate: inflation * 100, monthlyContribution, annualIncrease: annualIncrease * 100,
    fdRate: fdRate * 100, principal, years, rate: rate * 100, frequency,
    chart: growth.chart.map((point, index) => ({ ...point, fdValue: fdGrowth.chart[index]?.value })),
    formula: monthlyContribution > 0
      ? 'Monthly balance = previous balance × (1 + effective monthly rate) + end-of-month contribution; annual contribution increases apply after each 12 months.'
      : 'A = P × (1 + r ÷ n)^(n × t)',
  };
}

export function calculateLoan(input) {
  const principal = positive(input.principal, 'principal', 'Loan amount');
  const annualRate = bounded(input.rate, 'rate', 'Annual interest rate', 0, 100, true);
  const months = bounded(input.months, 'months', 'Loan term in months', 1, 600);
  if (!Number.isInteger(months)) fail('months', 'Loan term must be a whole number of months.');
  const extraMonthlyPayment = positive(input.extraMonthlyPayment ?? 0, 'extraMonthlyPayment', 'Extra monthly payment', true);
  const prepayment = positive(input.prepayment ?? 0, 'prepayment', 'One-time prepayment', true);
  const processingFee = positive(input.processingFee ?? 0, 'processingFee', 'Processing fee', true);
  const monthlyRate = annualRate / 1200;
  const emi = monthlyRate === 0 ? principal / months : principal * monthlyRate * (1 + monthlyRate) ** months / ((1 + monthlyRate) ** months - 1);
  const standardInterest = emi * months - principal;
  let balance = principal;
  const schedule = [];
  let totalInterest = 0;
  let totalPayments = processingFee;
  for (let month = 1; month <= months && balance > 0.005; month += 1) {
    const openingBalance = balance;
    const interest = openingBalance * monthlyRate;
    const due = openingBalance + interest;
    const regularPayment = Math.min(emi, due);
    const scheduledExtra = extraMonthlyPayment + (month === 1 ? prepayment : 0);
    const extraPayment = Math.min(scheduledExtra, Math.max(0, due - regularPayment));
    const payment = regularPayment + extraPayment;
    balance = Math.max(0, due - payment);
    totalInterest += interest;
    totalPayments += payment;
    schedule.push({ period: `Month ${month}`, openingBalance, balance, interest, payment, emi: regularPayment, principal: regularPayment - interest, extraPayment });
  }
  return { emi, totalPaid: totalPayments, totalInterest, interestSaved: Math.max(0, standardInterest - totalInterest), principal, months, monthsPaid: schedule.length, annualRate, extraMonthlyPayment, prepayment, processingFee, schedule, formula: monthlyRate === 0 ? 'EMI = P ÷ n (zero-interest loan); extra payments reduce principal sooner.' : 'EMI = P × i × (1 + i)^n ÷ ((1 + i)^n − 1); extra payments are applied after the regular EMI.' };
}

export function calculateBudget(input) {
  const income = positive(input.income, 'income', 'Monthly income');
  const entries = Object.entries(input.categories ?? {});
  if (entries.length > 100) fail('categories', 'Use no more than 100 budget categories.');
  const categories = entries.map(([name, raw]) => {
    if (!name.trim() || name.length > 40) fail('categories', 'Category names must contain 1 to 40 characters.');
    return { name, value: positive(raw, `category:${name}`, `${name} allocation`, true) };
  });
  if (!categories.length) fail('categories', 'Add at least one budget category.');
  const allocated = categories.reduce((sum, item) => sum + item.value, 0);
  return { income, allocated, remaining: income - allocated, savingsRate: (categories.find((x) => x.name.toLowerCase().includes('saving'))?.value ?? 0) / income * 100, overAllocated: allocated > income, categories, formula: 'Remaining = monthly income − sum of category allocations' };
}

export function calculateCard(input) {
  const balance = positive(input.balance, 'balance', 'Card balance');
  const apr = bounded(input.apr, 'apr', 'Annual percentage rate', 0, 100, true);
  const payment = positive(input.payment, 'payment', 'Monthly payment');
  const additionalMonthlyPayment = positive(input.additionalMonthlyPayment ?? 0, 'additionalMonthlyPayment', 'Additional monthly payment', true);
  const newSpending = positive(input.newSpending ?? 0, 'newSpending', 'New monthly spending', true);
  const monthlyRate = apr / 1200;
  const simulate = (monthlyPayment) => {
    const schedule = [];
    let remaining = balance;
    let totalInterest = 0;
    let totalPaid = 0;
    for (let month = 1; month <= 600 && remaining > 0.005; month += 1) {
      const opening = remaining + newSpending;
      const interest = opening * monthlyRate;
      const due = opening + interest;
      const paid = Math.min(monthlyPayment, due);
      remaining = Math.max(0, due - paid);
      totalInterest += interest;
      totalPaid += paid;
      schedule.push({ period: `Month ${month}`, openingBalance: opening, balance: remaining, interest, payment: paid, newSpending });
      if (paid <= interest + newSpending && remaining > 0) break;
    }
    return { schedule, remaining, totalInterest, totalPaid, months: remaining <= 0.005 ? schedule.length : null };
  };
  const baseline = simulate(payment);
  const acceleratedPayment = payment + additionalMonthlyPayment;
  const accelerated = simulate(acceleratedPayment);
  if (accelerated.months === null) {
    if (acceleratedPayment <= balance * monthlyRate + newSpending * (1 + monthlyRate)) fail('payment', 'Monthly payments must exceed new spending and accrued interest to reduce the balance.');
    fail('payment', 'This payment does not clear the balance within 600 months. Increase the payment.');
  }
  if (additionalMonthlyPayment === 0 && baseline.months === null) {
    if (payment <= balance * monthlyRate + newSpending * (1 + monthlyRate)) fail('payment', 'Monthly payment must exceed new spending and accrued interest to reduce the balance.');
    fail('payment', 'This payment does not clear the balance within 600 months. Increase the payment.');
  }
  const fullPaymentInterest = balance * monthlyRate;
  return {
    balance, apr, monthlyPayment: acceleratedPayment, baseMonthlyPayment: payment, additionalMonthlyPayment, newSpending,
    months: accelerated.months, totalInterest: accelerated.totalInterest, totalPaid: accelerated.totalPaid,
    baselineMonths: baseline.months, baselineInterest: baseline.totalInterest,
    interestSaved: baseline.months === null ? null : Math.max(0, baseline.totalInterest - accelerated.totalInterest),
    fullPaymentInterest, schedule: accelerated.schedule,
    formula: 'Each month, new spending is added to the opening balance, APR ÷ 12 interest is applied, then the fixed payment is subtracted. Issuer methods vary.',
  };
}

export function calculateSavingsGoal(input) {
  const target = positive(input.target, 'target', 'Savings target');
  const currentSavings = positive(input.currentSavings, 'currentSavings', 'Current savings', true);
  const monthlyContribution = positive(input.monthlyContribution, 'monthlyContribution', 'Monthly contribution', true);
  const annualRate = bounded(input.annualRate ?? 0, 'annualRate', 'Assumed annual interest rate', 0, 100, true);
  const targetDate = String(input.targetDate ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate) || Number.isNaN(Date.parse(`${targetDate}T00:00:00.000Z`))) fail('targetDate', 'Choose a valid target date.');
  const date = new Date(`${targetDate}T00:00:00.000Z`);
  if (date.toISOString().slice(0, 10) !== targetDate) fail('targetDate', 'Choose a valid target date.');
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  if (date.getTime() <= todayUtc) fail('targetDate', 'Target date must be in the future.');
  const calendarMonthsUntilTarget = (date.getUTCFullYear() - today.getUTCFullYear()) * 12 + date.getUTCMonth() - today.getUTCMonth();
  if (calendarMonthsUntilTarget > 600) fail('targetDate', 'Choose a target date within the next 50 years.');
  let contributionPeriodsUntilTarget = 0;
  for (let offset = 0; offset <= calendarMonthsUntilTarget; offset += 1) {
    const monthEnd = Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + offset + 1, 0);
    if (monthEnd > todayUtc && monthEnd <= date.getTime()) contributionPeriodsUntilTarget += 1;
  }
  const monthlyRate = annualRate / 1200;
  const targetReached = currentSavings >= target;
  const schedule = targetReached ? [{ period: 'Today', balance: currentSavings }] : [];
  let balance = currentSavings;
  if (!targetReached) {
    for (let month = 1; month <= 600; month += 1) {
      balance = balance * (1 + monthlyRate) + monthlyContribution;
      schedule.push({ period: `Month ${month}`, balance });
      if (balance >= target) break;
    }
  }
  const estimatedMonths = targetReached ? 0 : schedule.at(-1)?.balance >= target ? schedule.length : null;
  let projectedAtTarget = currentSavings;
  for (let month = 0; month < contributionPeriodsUntilTarget; month += 1) projectedAtTarget = projectedAtTarget * (1 + monthlyRate) + monthlyContribution;
  const growthFactor = (1 + monthlyRate) ** contributionPeriodsUntilTarget;
  const annuityFactor = monthlyRate === 0 ? contributionPeriodsUntilTarget : contributionPeriodsUntilTarget ? (growthFactor - 1) / monthlyRate : 0;
  const requiredMonthlyContribution = targetReached ? 0 : annuityFactor ? Math.max(0, (target - currentSavings * growthFactor) / annuityFactor) : null;
  const completionDate = estimatedMonths === null
    ? null
    : new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + estimatedMonths, 0)).toISOString().slice(0, 10);
  const chart = schedule.length > 80
    ? schedule.filter((_, index) => index === 0 || index === schedule.length - 1 || index % Math.ceil(schedule.length / 80) === 0)
    : schedule;
  return {
    target, currentSavings, monthlyContribution, annualRate, remaining: Math.max(0, target - currentSavings),
    progressPercent: Math.min(100, currentSavings / target * 100), monthsUntilTarget: Math.max(1, calendarMonthsUntilTarget), contributionPeriodsUntilTarget, estimatedMonths,
    projectedAtTarget, targetReachedByDate: projectedAtTarget >= target, requiredMonthlyContribution,
    completionDate, schedule, chart,
    formula: 'Monthly balance = previous balance × (1 + annual rate ÷ 12) + end-of-month contribution. The target-date projection includes deposits only when a month end falls on or before the selected date.',
  };
}

export function calculateBuyVsSave(input) {
  const itemPrice = positive(input.itemPrice, 'itemPrice', 'Item price');
  const availableSavings = positive(input.availableSavings, 'availableSavings', 'Available savings', true);
  const monthlySavings = positive(input.monthlySavings, 'monthlySavings', 'Monthly savings capacity', true);
  const cardApr = bounded(input.cardApr, 'cardApr', 'Credit card APR', 0, 100, true);
  const loanRate = bounded(input.loanRate, 'loanRate', 'Personal loan rate', 0, 100, true);
  const months = bounded(input.months, 'months', 'Financing term in months', 1, 600);
  if (!Number.isInteger(months)) fail('months', 'Financing term must be a whole number of months.');
  const cardFee = positive(input.cardFee ?? 0, 'cardFee', 'Credit card fee', true);
  const loanFee = positive(input.loanFee ?? 0, 'loanFee', 'Personal loan fee', true);
  const paymentFor = (annualRate) => {
    const monthlyRate = annualRate / 1200;
    return monthlyRate === 0 ? itemPrice / months : itemPrice * monthlyRate / (1 - (1 + monthlyRate) ** -months);
  };
  const monthsToSave = availableSavings >= itemPrice ? 0 : monthlySavings > 0 ? Math.ceil((itemPrice - availableSavings) / monthlySavings) : null;
  const saveFirstTotal = monthsToSave === null ? null : itemPrice;
  const cardPayment = paymentFor(cardApr);
  const loanPayment = paymentFor(loanRate);
  const options = [
    { id: 'save-first', label: 'Save first', totalCost: saveFirstTotal, monthlyPayment: monthlySavings, totalInterest: 0, monthsToPurchase: monthsToSave, monthsToRepay: 0, remainingSavings: monthsToSave === null ? availableSavings : Math.max(0, availableSavings + monthsToSave * monthlySavings - itemPrice), fee: 0 },
    { id: 'card-emi', label: 'Credit card EMI', totalCost: cardPayment * months + cardFee, monthlyPayment: cardPayment, totalInterest: cardPayment * months - itemPrice, monthsToPurchase: 0, monthsToRepay: months, remainingSavings: availableSavings, fee: cardFee },
    { id: 'personal-loan', label: 'Personal loan', totalCost: loanPayment * months + loanFee, monthlyPayment: loanPayment, totalInterest: loanPayment * months - itemPrice, monthsToPurchase: 0, monthsToRepay: months, remainingSavings: availableSavings, fee: loanFee },
  ];
  const financedCost = Math.min(options[1].totalCost, options[2].totalCost);
  return {
    itemPrice, availableSavings, monthlySavings, months, options,
    chart: options.filter((item) => item.totalCost !== null).map((item) => ({ period: item.label, cost: item.totalCost })),
    costDifference: saveFirstTotal === null ? null : financedCost - saveFirstTotal,
    formula: 'Financing uses a fixed-rate amortizing payment; save-first assumes no interest and monthly deposits until the item price is reached.',
  };
}

export function calculate(type, inputs) {
  if (!inputs || typeof inputs !== 'object' || Array.isArray(inputs)) fail('inputs', 'Enter simulator inputs as a valid object.');
  if (type === 'investment') return calculateInvestment(inputs);
  if (type === 'loan') return calculateLoan(inputs);
  if (type === 'budget') return calculateBudget(inputs);
  if (type === 'credit-card') return calculateCard(inputs);
  if (type === 'savings-goal') return calculateSavingsGoal(inputs);
  if (type === 'buy-vs-save') return calculateBuyVsSave(inputs);
  fail('type', 'Choose a supported simulator.');
}
