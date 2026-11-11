import { Calculator, CreditCard, Landmark, ShoppingBag, Target, Wallet } from 'lucide-react';

export const modules = [
  { id: 'investment', label: 'Investment & FD', icon: Landmark, caption: 'Explore growth over time', accent: 'mint' },
  { id: 'loan', label: 'Loan planner', icon: Calculator, caption: 'Understand your repayments', accent: 'blue' },
  { id: 'credit-card', label: 'Credit card', icon: CreditCard, caption: 'See how payments add up', accent: 'peach' },
  { id: 'budget', label: 'Monthly budget', icon: Wallet, caption: 'Make room for what matters', accent: 'lilac' },
  { id: 'savings-goal', label: 'Savings goals', icon: Target, caption: 'Plan toward a target date', accent: 'blue' },
  { id: 'buy-vs-save', label: 'Buy vs save', icon: ShoppingBag, caption: 'Compare purchase paths', accent: 'peach' },
];
export const titleFor = (id) => modules.find((item) => item.id === id)?.label ?? 'Investment & FD';
export const supportedModuleIds = new Set(modules.map((item) => item.id));
export const simulatorPath = (id) => `/simulators/${supportedModuleIds.has(id) ? id : 'investment'}`;
