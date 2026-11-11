# FinCoach calculation evidence

These examples were executed against `shared/calculations.js` on 11 November 2026. They are reproducible educational scenarios, not forecasts or financial advice. Display values are rounded to two decimal places; the calculation engine retains full precision internally.

## Investment growth

**Inputs:** principal ₹20,000; annual nominal rate 8%; annual compounding; five years; no monthly additions; inflation 0%.

**Formula:** `A = P × (1 + r ÷ n)^(n × t)`

**Result:** projected value ₹29,386.56; interest/gain ₹9,386.56; total invested ₹20,000. At the default comparison FD assumption of 6.5%, the model gives ₹27,401.73 (₹1,984.83 lower).

## Fixed-rate loan

**Inputs:** principal ₹500,000; annual rate 9%; term 60 months; no extra payments, prepayment, or fee.

**Formula:** `EMI = P × i × (1 + i)^n ÷ ((1 + i)^n − 1)`, where `i = 0.09 ÷ 12` and `n = 60`.

**Result:** monthly EMI ₹10,379.18; total interest ₹122,750.66; total paid ₹622,750.66. A zero-rate check with ₹120,000 over 12 months returns ₹10,000 per month and zero interest.

## Monthly budget

**Inputs:** income ₹50,000; needs ₹25,000; savings ₹10,000; wants ₹10,000.

**Formula:** `remaining = income − sum(allocations)`

**Result:** allocated ₹45,000; remaining ₹5,000; savings rate 20%; not over-allocated. Boundary check: allocating ₹120 against income ₹100 returns remaining −₹20 and `overAllocated: true`; the planner reports the overage instead of hiding it.

## Credit-card repayment

**Inputs:** opening balance ₹10,000; APR 12%; fixed monthly payment ₹1,000; no new spending; illustrative minimum 5% of amount due with ₹100 floor.

**Assumption/formula:** monthly rate is `APR ÷ 12 = 1%`; the model applies interest to the opening balance before payment. Month 1: ₹10,000 × 1% = ₹100 interest; ₹10,000 + ₹100 − ₹1,000 = ₹9,100 closing balance.

**Result:** fixed-payment scenario clears in 11 months with ₹589.85 interest and ₹10,589.85 paid. The illustrative minimum-payment scenario takes 62 months and accrues ₹2,217.77 interest. The estimated minimum is not an issuer rule; actual card terms and daily-balance methods vary. No fees or new purchases are included in this example.

## Savings goal

**Inputs:** target ₹12,000; current savings ₹2,000; monthly end-of-month contribution ₹1,000; assumed annual rate 0%; target date 30 November 2027.

**Formula:** `monthly balance = previous balance × (1 + annual rate ÷ 12) + end-of-month contribution`. Target-date projections count only month ends on or before the selected date.

**Result (as of 11 November 2026):** 13 eligible deposits by the target date; projected balance ₹15,000; target is reached by the date. The regular contribution schedule reaches the target in 10 deposits, estimated completion 31 August 2027. For this date and zero-rate example, the required contribution to reach exactly ₹12,000 by the target date is ₹769.23 per eligible deposit.

## Buy versus save

**Inputs:** item price ₹12,000; available savings ₹4,000; saving capacity ₹2,000/month; four-month financing term; card APR 24% and ₹100 card fee; personal-loan rate 0% and ₹500 loan fee.

**Assumptions:** financed options use fixed amortized payments plus the entered fee. Save-first assumes no interest and uses monthly savings until the price is available.

| Option | Monthly amount | Interest | Fee | Total cost | Time to purchase/pay off |
| --- | ---: | ---: | ---: | ---: | ---: |
| Save first | ₹2,000 saving capacity | ₹0.00 | ₹0.00 | ₹12,000.00 | 4 months to purchase |
| Credit-card EMI | ₹3,151.49 | ₹605.94 | ₹100.00 | ₹12,705.94 | 4 months to repay |
| Personal loan | ₹3,000.00 | ₹0.00 | ₹500.00 | ₹12,500.00 | 4 months to repay |

## Reproduce

From the repository root, run `node --input-type=module` and import the relevant function from `./shared/calculations.js`. Automated calculation examples and validation checks are in `server/tests/calculations.test.js`; `npm test` runs the complete API/calculation and client interaction suites.
