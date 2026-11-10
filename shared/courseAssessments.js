const q = (id, type, prompt, options, answer, explanation, difficulty = 'Core') => ({ id, type, prompt, options, answer, explanation, difficulty });

// Assessment answer keys are shared for rendering and server-side grading.
export const courseAssessments = [
  { id: 'personal-finance-review-v1', courseId: 'personal-finance', title: 'Personal finance review', questions: [
    q('pf-cashflow', 'scenario', 'A monthly plan has ₹32,000 income and ₹29,500 in planned costs. What does the difference tell you?', ['₹2,500 is unallocated in this plan', 'The account balance has increased by ₹2,500', 'All unexpected costs are covered'], 0, 'It is the arithmetic difference between the entered plan values; it does not represent a bank transaction.'),
    q('pf-timeframe', 'true_false', 'A target date helps estimate a savings path, but it cannot guarantee that the target will be reached.', ['True', 'False'], 0, 'A date makes a goal easier to plan and review, while real costs and income can change.'),
    q('pf-goal-math', 'calculation', 'A ₹9,000 goal is due in 9 months. With no interest or starting savings, what monthly amount reaches the target?', ['₹900', '₹1,000', '₹1,100'], 1, '₹9,000 ÷ 9 months = ₹1,000 per month.'),
    q('pf-risk', 'multiple_choice', 'Which is a useful first step when making a personal money plan?', ['Separate known income and bills from uncertain future amounts', 'Assume every month will have identical costs', 'Treat a projection as a promise'], 0, 'Separating known values from uncertain assumptions makes a plan easier to review.'),
  ] },
  { id: 'budgeting-review-v1', courseId: 'budgeting', title: 'Budgeting review', questions: [
    q('bud-total', 'calculation', 'Income is ₹30,000. Planned costs are ₹12,000, ₹8,500, and ₹4,000. How much remains unallocated?', ['₹4,500', '₹5,500', '₹6,500'], 1, '₹30,000 − ₹24,500 = ₹5,500.'),
    q('bud-rule', 'true_false', 'One percentage-based budgeting rule is mandatory for every household.', ['True', 'False'], 1, 'Rules of thumb are discussion aids; a budget should reflect real obligations and priorities.'),
    q('bud-irregular', 'scenario', 'A yearly school fee is due in six months. What can make the monthly budget more useful?', ['Set aside a planned monthly amount for the upcoming fee', 'Ignore it because it is not due this month', 'Count the fee as monthly income'], 0, 'Planning for an irregular expense can make its timing visible.'),
    q('bud-over', 'multiple_choice', 'Your planned allocations exceed your entered income. What does the planner indicate?', ['A shortfall in the plan that needs review', 'A confirmed overdraft from a bank', 'That savings are guaranteed'], 0, 'The tool compares entered amounts; it does not access an account.'),
  ] },
  { id: 'banking-review-v1', courseId: 'banking', title: 'Banking fundamentals review', questions: [
    q('bank-terms', 'scenario', 'A bank advertises an attractive rate. What else should you compare before choosing an account?', ['Fees, access rules, eligibility, and current product terms', 'Only the color of the bank card', 'An old rate quoted in a social post'], 0, 'Product terms include more than the headline rate and can vary by provider.'),
    q('bank-otp', 'true_false', 'You should share a one-time password with a caller who says they are helping you receive money.', ['True', 'False'], 1, 'Keep authentication codes private and verify requests through an official channel.'),
    q('bank-interest', 'calculation', 'At a simple illustrative annual rate of 5%, what is one year’s interest on ₹10,000 before fees or tax?', ['₹50', '₹500', '₹5,000'], 1, '₹10,000 × 0.05 = ₹500. Real deposit products may use different terms and compounding.'),
    q('bank-verify', 'multiple_choice', 'Where is the best place to verify a specific account fee?', ['The provider’s current official schedule of charges', 'A generic simulator', 'An undated article'], 0, 'Fees can change; use the provider’s current official information.'),
  ] },
  { id: 'credit-debt-review-v1', courseId: 'credit-debt', title: 'Credit and debt review', questions: [
    q('credit-apr', 'calculation', 'Using FinCoach’s simplified APR ÷ 12 model, what monthly rate corresponds to a 24% APR?', ['1%', '2%', '12%'], 1, '24% ÷ 12 = 2% per month in this educational model.'),
    q('credit-minimum', 'scenario', 'A card payment barely covers the month’s interest. What is likely to happen to principal?', ['It may fall very slowly or not fall', 'It is automatically cleared', 'It becomes a savings balance'], 0, 'A payment must exceed the interest and other charges to reduce the balance.'),
    q('credit-emi', 'multiple_choice', 'Which details help compare two loan offers beyond the monthly EMI?', ['Total repayment, fees, term, and repayment conditions', 'Only the lender’s logo', 'Only the first payment date'], 0, 'The instalment alone does not show total borrowing cost or contract terms.'),
    q('credit-health', 'true_false', 'A credit report can contain information that should be checked and disputed through official processes.', ['True', 'False'], 0, 'Review unfamiliar information and use the bureau or provider’s verified dispute procedure.'),
  ] },
  { id: 'investing-review-v1', courseId: 'investing', title: 'Investment fundamentals review', questions: [
    q('invest-growth', 'calculation', 'At 10% annual compounding, what is the illustrative value of ₹1,000 after one year, before costs and tax?', ['₹1,010', '₹1,100', '₹2,000'], 1, '₹1,000 × (1 + 0.10) = ₹1,100.'),
    q('invest-returns', 'true_false', 'A higher assumed return in a calculator guarantees a higher realized investment return.', ['True', 'False'], 1, 'The input changes a mathematical projection; actual investment outcomes are uncertain.'),
    q('invest-diversify', 'multiple_choice', 'What is the main idea of diversification?', ['Spread exposure instead of relying on one holding', 'Guarantee that losses cannot happen', 'Select only the recent top performer'], 0, 'Diversification can spread exposure but cannot remove all risk.'),
    q('invest-horizon', 'scenario', 'Money may be needed for a fixed expense in three months. Which factor deserves attention before investing it in a volatile asset?', ['Whether a temporary loss or delayed access would disrupt the expense', 'Only the highest projected return', 'Whether a past chart rose smoothly'], 0, 'The timing and flexibility of the need matter alongside risk.'),
  ] },
  { id: 'tax-planning-india-review-v1', courseId: 'tax-planning-india', title: 'Tax planning review', questions: [
    q('tax-year', 'multiple_choice', 'Why should tax rates and thresholds be checked for the year being filed?', ['Rules and eligibility can change', 'Every year has identical rules forever', 'A simulator replaces official guidance'], 0, 'Tax provisions and individual eligibility are time-sensitive.'),
    q('tax-records', 'scenario', 'You are preparing to compare tax options. What should you do first?', ['Identify the relevant year and organize verified income and deduction records', 'Use an old example without checking its year', 'Choose based only on a headline rate'], 0, 'The relevant year and verified facts are needed for a meaningful comparison.'),
    q('tax-advice', 'true_false', 'A general learning app can determine a user’s personal tax liability without their complete facts and current rules.', ['True', 'False'], 1, 'Personal tax outcomes depend on current law, eligibility, and individual circumstances.'),
    q('tax-source', 'multiple_choice', 'Which source is most appropriate for confirming current filing instructions?', ['Current official tax department guidance or a qualified tax professional', 'An undated social media post', 'A prior-year worksheet assumed unchanged'], 0, 'Use current authoritative guidance and get qualified help for complex situations.'),
  ] },
  { id: 'financial-safety-review-v1', courseId: 'financial-safety', title: 'Financial safety review', questions: [
    q('safe-otp', 'true_false', 'A legitimate caller needs your OTP to send money into your account.', ['True', 'False'], 1, 'Do not share an OTP; verify activity through the official service independently.'),
    q('safe-urgent', 'scenario', 'An urgent message says your account will be blocked unless you open its link and enter credentials. What is safest?', ['Open the official app or site independently and verify the alert', 'Use the message link immediately', 'Reply with your password so support can check'], 0, 'Independent verification avoids trusting a potentially fraudulent link.'),
    q('safe-pin', 'multiple_choice', 'What should you do with a UPI PIN?', ['Keep it private; it authorizes transactions', 'Share it to receive a refund', 'Send it to a caller claiming to be support'], 0, 'A PIN is sensitive authentication information.'),
    q('safe-device', 'multiple_choice', 'You notice an unfamiliar transaction. What is a good next step?', ['Contact the provider using a verified official channel and preserve details', 'Post account credentials publicly', 'Wait for an unknown caller to contact you'], 0, 'Use verified support channels and keep relevant transaction details.'),
  ] },
  { id: 'advanced-planning-review-v1', courseId: 'advanced-planning', title: 'Advanced planning review', questions: [
    q('adv-goal-math', 'calculation', 'A goal needs ₹24,000 in 12 months. Ignoring interest and starting savings, what monthly contribution reaches it?', ['₹1,000', '₹2,000', '₹3,000'], 1, '₹24,000 ÷ 12 = ₹2,000 per month.'),
    q('adv-horizon', 'scenario', 'A goal date moves closer and the amount is not flexible. What should be reviewed?', ['The contribution needed, access to funds, and risk of a short-term loss', 'Only the most optimistic return', 'Nothing; earlier assumptions stay valid'], 0, 'A shorter horizon can change the acceptable uncertainty and required contribution.'),
    q('adv-review', 'true_false', 'A financial plan should be revisited when income, goals, costs, or timing assumptions change.', ['True', 'False'], 0, 'Reviewing changed circumstances keeps the plan aligned with current information.'),
    q('adv-replay', 'multiple_choice', 'What can Decision Replay establish?', ['How changed inputs alter a modelled outcome', 'Which investment will outperform', 'A guaranteed future balance'], 0, 'Replay explains sensitivity under selected assumptions, not future certainty.'),
  ] },
];

export const assessmentById = new Map(courseAssessments.map((assessment) => [assessment.id, assessment]));
