import { useEffect, useMemo, useState } from 'react';
import { Activity, ArrowDownRight, ArrowRight, ArrowUpRight, BadgeIndianRupee, BookOpen, Calculator, Check, ChevronDown, CircleHelp, Clock3, CreditCard, Download, Eye, EyeOff, Home, Landmark, Menu, Pencil, Plus, RotateCcw, Save, Search, Settings2, ShieldCheck, ShoppingBag, Sparkles, Target, Trash2, Wallet, X } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { calculate } from '../../shared/calculations.js';
import { courseAssessments } from '../../shared/courseAssessments.js';
import { books, courses, resources } from './learningContent.js';

const formatINR = (n, decimals = 0) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: decimals, minimumFractionDigits: decimals }).format(Number(n) || 0);
const initialInputs = {
  investment: { principal: '20000', years: '5', rate: '8', fdRate: '6.5', frequency: '1', monthlyContribution: '0', annualIncrease: '0', inflation: '0' },
  loan: { principal: '500000', rate: '9', months: '60', extraMonthlyPayment: '0', prepayment: '0', processingFee: '0' },
  'credit-card': { balance: '50000', apr: '36', payment: '5000', additionalMonthlyPayment: '0', newSpending: '0' },
  budget: { income: '45000', categories: { Needs: '20000', Wants: '7000', Savings: '8000', Investments: '6000', 'Emergency fund': '4000' } },
  'savings-goal': { goalName: 'Emergency fund', target: '100000', currentSavings: '20000', monthlyContribution: '5000', annualRate: '4', targetDate: (() => { const date = new Date(); date.setFullYear(date.getFullYear() + 1); return date.toISOString().slice(0, 10); })() },
  'buy-vs-save': { itemPrice: '60000', availableSavings: '10000', monthlySavings: '10000', cardApr: '36', loanRate: '14', months: '12', cardFee: '499', loanFee: '1000' },
};
const modules = [
  { id: 'investment', label: 'Investment & FD', icon: Landmark, caption: 'Explore growth over time', accent: 'mint' },
  { id: 'loan', label: 'Loan planner', icon: Calculator, caption: 'Understand your repayments', accent: 'blue' },
  { id: 'credit-card', label: 'Credit card', icon: CreditCard, caption: 'See how payments add up', accent: 'peach' },
  { id: 'budget', label: 'Monthly budget', icon: Wallet, caption: 'Make room for what matters', accent: 'lilac' },
  { id: 'savings-goal', label: 'Savings goals', icon: Target, caption: 'Plan toward a target date', accent: 'blue' },
  { id: 'buy-vs-save', label: 'Buy vs save', icon: ShoppingBag, caption: 'Compare purchase paths', accent: 'peach' },
];
const titleFor = (id) => modules.find((item) => item.id === id)?.label ?? 'Investment & FD';
const scenarioOutcome = (record) => {
  const result = record?.result ?? record?.results ?? {};
  if (record?.type === 'investment') return ['Illustrative value', formatINR(result.finalValue)];
  if (record?.type === 'loan') return ['Monthly EMI', formatINR(result.emi, 2)];
  if (record?.type === 'credit-card') return ['Total interest', formatINR(result.totalInterest)];
  if (record?.type === 'budget') return ['Monthly income', formatINR(result.income)];
  if (record?.type === 'savings-goal') return ['Projected savings', formatINR(result.projectedAtTarget)];
  if (record?.type === 'buy-vs-save') {
    const costs = result.options?.filter((option) => option.totalCost !== null).map((option) => option.totalCost) ?? [];
    return ['Lowest estimated cost', formatINR(costs.length ? Math.min(...costs) : 0)];
  }
  return ['Scenario', '—'];
};
const safeRead = () => { try { return JSON.parse(localStorage.getItem('fincoach-scenarios') || '[]'); } catch { return []; } };
const safeReadKey = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; } };

function PasswordInput({ className = 'auth-input', ...inputProps }) {
  const [visible, setVisible] = useState(false);
  return <span className="password-input-wrap">
    <input {...inputProps} className={className} type={visible ? 'text' : 'password'} />
    <button className="password-toggle" type="button" onClick={() => setVisible((shown) => !shown)} aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible} title={visible ? 'Hide password' : 'Show password'}>
      {visible ? <EyeOff aria-hidden="true" size={18}/> : <Eye aria-hidden="true" size={18}/>}
    </button>
  </span>;
}

function App() {
  const [section, setSection] = useState('dashboard');
  const [module, setModule] = useState('investment');
  const [inputs, setInputs] = useState(initialInputs);
  const [history, setHistory] = useState(safeRead);
  const [comparisons, setComparisons] = useState(() => safeReadKey('fincoach-comparisons', []));
  const [completedLessons, setCompletedLessons] = useState(() => safeReadKey('fincoach-lessons', []));
  const [quizAttempts, setQuizAttempts] = useState(() => safeReadKey('fincoach-quiz-attempts', []));
  const [readingList, setReadingList] = useState(() => safeReadKey('fincoach-reading-list', []));
  const [theme, setTheme] = useState(() => safeReadKey('fincoach-theme', 'light'));
  const [active, setActive] = useState(null);
  const [scenarioA, setScenarioA] = useState(null);
  const [scenarioB, setScenarioB] = useState(null);
  const [replayComparisonId, setReplayComparisonId] = useState(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [calculated, setCalculated] = useState(true);
  const [formErrors, setFormErrors] = useState({});
  const [user, setUser] = useState(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const result = useMemo(() => { try { return calculate(module, inputs[module]); } catch { return null; } }, [module, inputs]);

  useEffect(() => { if (!user) localStorage.setItem('fincoach-scenarios', JSON.stringify(history)); }, [history, user]);
  useEffect(() => { if (!user) localStorage.setItem('fincoach-comparisons', JSON.stringify(comparisons)); }, [comparisons, user]);
  useEffect(() => { localStorage.setItem('fincoach-lessons', JSON.stringify(completedLessons)); }, [completedLessons]);
  useEffect(() => { if (!user) localStorage.setItem('fincoach-quiz-attempts', JSON.stringify(quizAttempts)); }, [quizAttempts, user]);
  useEffect(() => { if (!user) localStorage.setItem('fincoach-reading-list', JSON.stringify(readingList)); }, [readingList, user]);
  useEffect(() => { localStorage.setItem('fincoach-theme', JSON.stringify(theme)); document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => { if (!toast) return undefined; const timer = setTimeout(() => setToast(''), 2600); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => {
    let mounted = true;
    const restoreAccount = async () => {
      try {
        const accountResponse = await fetch('/api/auth/me', { credentials: 'include' });
        if (!accountResponse.ok) return;
        const account = await accountResponse.json();
        if (!account?.user || !mounted) return;
        setUser(account.user);
        const [simResponse, compareResponse, progressResponse] = await Promise.all([
          fetch('/api/simulations', { credentials: 'include' }),
          fetch('/api/comparisons', { credentials: 'include' }),
          fetch('/api/learning/progress', { credentials: 'include' }),
        ]);
        if (!mounted) return;
        if (simResponse.ok) { const body = await simResponse.json(); setHistory(body.simulations.map(normalizeRemote)); }
        if (compareResponse.ok) { const body = await compareResponse.json(); setComparisons(body.comparisons.map(normalizeComparison)); }
        if (progressResponse.ok) { const body = await progressResponse.json(); setCompletedLessons(body.progress.completedLessons || []); setQuizAttempts(body.progress.quizAttempts || []); setReadingList(body.progress.readingList || []); }
      } catch { /* A guest can keep using the local learning experience while offline. */ }
    };
    restoreAccount();
    return () => { mounted = false; };
  }, []);

  const update = (key, value) => {
    setInputs((current) => ({ ...current, [module]: { ...current[module], [key]: value } }));
    setFormErrors((current) => ({ ...current, [key]: '' })); setError(''); setCalculated(true);
  };
  const updateCategory = (key, value) => {
    setInputs((current) => ({ ...current, budget: { ...current.budget, categories: { ...current.budget.categories, [key]: value } } }));
    setFormErrors((current) => ({ ...current, [`category:${key}`]: '' })); setError(''); setCalculated(true);
  };
  const removeCategory = (key) => {
    setInputs((current) => { const categories = { ...current.budget.categories }; delete categories[key]; return { ...current, budget: { ...current.budget, categories } }; });
    setError(''); setCalculated(true);
  };
  const runSimulation = () => {
    try { calculate(module, inputs[module]); setFormErrors({}); setError(''); setCalculated(true); return true; }
    catch (caught) { setFormErrors({ [caught.field]: caught.message }); setError(caught.message); setCalculated(false); return false; }
  };
  const saveScenario = async (slot = 'scenario') => {
    if (!runSimulation()) return;
    if (module === 'budget' && calculate(module, inputs[module]).overAllocated) { setToast('Adjust allocations so they fit your income before saving.'); return; }
    let record = { id: crypto.randomUUID(), title: `${titleFor(module)} · ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`, type: module, inputs: structuredClone(inputs[module]), result: calculate(module, inputs[module]), createdAt: new Date().toISOString() };
    if (user) {
      try { const response = await fetch('/api/simulations', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: module, title: record.title, inputs: record.inputs }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Could not save to your account.'); record = normalizeRemote(body.simulation); }
      catch (caught) { setToast(caught.message); return; }
    }
    setHistory((current) => [record, ...current].slice(0, 50));
    if (slot === 'A') setScenarioA(record); if (slot === 'B') setScenarioB(record);
    setToast(slot === 'A' ? 'Baseline saved for Decision Replay' : slot === 'B' ? 'Variant saved for Decision Replay' : 'Scenario saved to your history');
  };
  const openRecord = (record) => { const normalized = normalizeRemote(record); setModule(normalized.type); setInputs((current) => ({ ...current, [normalized.type]: structuredClone(normalized.inputs) })); setSection('simulator'); setActive(normalized); setCalculated(true); setError(''); };
  const saveComparison = async (a, b) => {
    if (!a || !b || a.type !== b.type) return;
    const title = `${titleFor(a.type)} comparison · ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`;
    const scenarioA = { type: a.type, inputs: structuredClone(a.inputs), results: calculate(a.type, a.inputs) };
    const scenarioB = { type: b.type, inputs: structuredClone(b.inputs), results: calculate(b.type, b.inputs) };
    const draft = { title, scenarioA, scenarioB };
    if (user) {
      try { const response = await fetch('/api/comparisons', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) }); const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Could not save this comparison.'); const saved = normalizeComparison(body.comparison); setComparisons((current) => [saved, ...current]); setReplayComparisonId(saved.id); }
      catch (caught) { setToast(caught.message); return; }
    } else {
      const createdAt = new Date().toISOString();
      const saved = normalizeComparison({ ...draft, id: crypto.randomUUID(), createdAt, versions: [{ scenario: scenarioB, changes: inputDifferences(scenarioA.inputs, scenarioB.inputs), notes: '', createdAt }] });
      setComparisons((current) => [saved, ...current].slice(0, 50)); setReplayComparisonId(saved.id);
    }
    setToast('Comparison saved. You can replay it with new assumptions.');
  };
  const openComparison = (source) => { const record=normalizeComparison(source); const timestamp=record.createdAt??new Date().toISOString(); const latest=record.versions.at(-1); setScenarioA({...record.scenarioA,title:`${record.title} · Baseline`,createdAt:timestamp}); setScenarioB({...latest.scenario,title:`${record.title} · Version ${latest.versionNumber}`,createdAt:latest.createdAt??timestamp}); setReplayComparisonId(record.id); setSection('replay'); };
  const startReplayVersion = (source, version) => { const record=normalizeComparison(source); const selected=version??record.versions.at(-1); if(!selected?.scenario)return; setScenarioA({...record.scenarioA,title:`${record.title} · Baseline`,createdAt:record.createdAt}); setScenarioB({...selected.scenario,title:`${record.title} · Version ${selected.versionNumber}`,createdAt:selected.createdAt}); setReplayComparisonId(record.id); setModule(selected.scenario.type); setInputs((current)=>({...current,[selected.scenario.type]:structuredClone(selected.scenario.inputs)})); setActive({type:selected.scenario.type,inputs:structuredClone(selected.scenario.inputs),title:`${record.title} replay`}); setCalculated(true); setError(''); setSection('simulator'); };
  const saveReplayVersion = async () => {
    if(!replayComparisonId||!runSimulation())return;
    if(module==='budget'&&calculate(module,inputs[module]).overAllocated){setToast('Adjust allocations so they fit your income before saving.');return;}
    const current=comparisons.find((item)=>item.id===replayComparisonId); if(!current){setToast('This replay was not found in your saved history.');return;}
    const notes=window.prompt('Add an optional note about this replay:',''); if(notes===null)return;
    let updated;
    if(user){try{const response=await fetch(`/api/comparisons/${replayComparisonId}/versions`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({inputs:inputs[module],notes})});const body=await response.json();if(!response.ok)throw new Error(body.error||'Could not save this replay version.');updated=normalizeComparison(body.comparison);}catch(caught){setToast(caught.message);return;}}
    else {const scenario={type:module,inputs:structuredClone(inputs[module]),results:calculate(module,inputs[module])};const version={scenario,changes:inputDifferences(current.scenarioA.inputs,scenario.inputs),notes:notes.trim(),createdAt:new Date().toISOString(),versionNumber:current.versions.length+1};updated={...current,versions:[...current.versions,version]};}
    setComparisons((list)=>list.map((item)=>item.id===updated.id?updated:item));
    const latest=updated.versions.at(-1);setScenarioA({...updated.scenarioA,title:`${updated.title} · Baseline`});setScenarioB({...latest.scenario,title:`${updated.title} · Version ${latest.versionNumber}`,createdAt:latest.createdAt});setSection('replay');setToast(`Replay version ${latest.versionNumber} saved`);
  };
  const removeComparison = async (record) => { if (!window.confirm(`Delete “${record.title}”? This saved comparison cannot be recovered.`)) return; if (user && /^[a-f\d]{24}$/i.test(record.id)) { try { const response = await fetch(`/api/comparisons/${record.id}`, { method: 'DELETE', credentials: 'include' }); if (!response.ok) throw new Error('Could not delete this comparison.'); } catch (caught) { setToast(caught.message); return; } } setComparisons((current) => current.filter((item) => item.id !== record.id)); setToast('Comparison deleted'); };
  const renameComparison = async (record) => { const title = window.prompt('Rename comparison', record.title); if (!title?.trim() || title.trim() === record.title) return; if (user && /^[a-f\d]{24}$/i.test(record.id)) { try { const response = await fetch(`/api/comparisons/${record.id}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: title.trim() }) }); if (!response.ok) throw new Error('Could not rename this comparison.'); } catch (caught) { setToast(caught.message); return; } } setComparisons((current) => current.map((item) => item.id === record.id ? { ...item, title: title.trim() } : item)); };
  const removeRecord = async (id) => { if (user && /^[a-f\d]{24}$/i.test(id)) { try { const response = await fetch(`/api/simulations/${id}`, { method: 'DELETE', credentials: 'include' }); if (!response.ok) throw new Error('Could not delete this saved scenario.'); } catch (caught) { setToast(caught.message); return; } } setHistory((current) => current.filter((item) => item.id !== id)); if (scenarioA?.id === id) setScenarioA(null); if (scenarioB?.id === id) setScenarioB(null); };
  const duplicateRecord = async (record) => { let copy = { ...record, id: crypto.randomUUID(), title: `${record.title} copy`, createdAt: new Date().toISOString() }; if (user) { try { const response = await fetch('/api/simulations', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: record.type, title: copy.title, inputs: record.inputs }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Could not duplicate this scenario.'); copy = normalizeRemote(body.simulation); } catch (caught) { setToast(caught.message); return; } } setHistory((current) => [copy, ...current]); setToast('Scenario duplicated'); };
  const renameRecord = async (id, title) => { if (!title.trim()) return; if (user && /^[a-f\d]{24}$/i.test(id)) { try { const response = await fetch(`/api/simulations/${id}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: title.trim() }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Could not rename this scenario.'); } catch (caught) { setToast(caught.message); return; } } setHistory((current) => current.map((item) => item.id === id ? { ...item, title: title.trim() } : item)); setToast('Scenario renamed'); };
  const chooseSection = (next) => { setSection(next); setMobileOpen(false); setError(''); };
  const submitAuth = async (event) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); setAuthError('');
    if (authMode === 'register' && form.get('password') !== form.get('confirmPassword')) { setAuthError('Passwords do not match.'); return; }
    setAuthBusy(true);
    try {
      const response = await fetch(`/api/auth/${authMode === 'register' ? 'register' : 'login'}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...(authMode === 'register' ? { name: form.get('name'), confirmPassword: form.get('confirmPassword') } : {}), email: form.get('email'), password: form.get('password') }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const validationError = body.details?.confirmPassword?.[0] || body.details?.password?.[0];
        if (validationError) throw new Error(validationError);
        if (response.status === 503) {
          const healthResponse = await fetch('/api/health', { credentials: 'include' }).catch(() => null);
          const health = healthResponse?.ok || healthResponse?.status === 503
            ? await healthResponse.json().catch(() => null)
            : null;
          if (health?.status === 'misconfigured') {
            throw new Error('Account sign-in is not set up yet. Please contact the site owner.');
          }
          if (health?.status === 'unavailable' && health?.storage === 'mongodb') {
            throw new Error('Account sign-in is temporarily unavailable. Please try again later.');
          }
        }
        throw new Error(response.status >= 500 ? 'Account sign-in is temporarily unavailable. Please try again later.' : body.error || 'Please check your details and try again.');
      }
      if (!body.user) throw new Error('We couldn’t complete sign-in. Please try again.');
      setUser(body.user);
      const [list, compareList, progressResponse] = await Promise.all([fetch('/api/simulations', { credentials: 'include' }), fetch('/api/comparisons', { credentials: 'include' }), fetch('/api/learning/progress', { credentials: 'include' })]);
      if (list.ok) { const saved = await list.json(); setHistory(saved.simulations.map(normalizeRemote)); }
      if (compareList.ok) { const saved = await compareList.json(); setComparisons(saved.comparisons.map(normalizeComparison)); }
      if (progressResponse.ok) {
        const saved = await progressResponse.json();
        const accountLessons = saved.progress.completedLessons || [];
        const merged = authMode === 'register' ? [...new Set([...accountLessons, ...completedLessons])] : accountLessons;
        setCompletedLessons(merged);
        const accountAttempts = saved.progress.quizAttempts || [];
        const localAttempts = authMode === 'register' ? quizAttempts : [];
        const accountReading = saved.progress.readingList || [];
        const localReading = authMode === 'register' ? readingList : [];
        if (authMode === 'register' && merged.length !== accountLessons.length) {
          await fetch('/api/learning/progress', { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completedLessons: merged }) });
        }
        if (authMode === 'register') {
          const migrated = await Promise.all(localAttempts.map(async(item)=>{try{const response=await fetch('/api/learning/attempts',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({attemptId:item.attemptId,lessonId:item.lessonId,selectedAnswer:item.selectedAnswer})});if(!response.ok)return null;return (await response.json()).attempt;}catch{return null;}}));
          setQuizAttempts([...accountAttempts,...migrated.filter(Boolean).filter((item)=>!accountAttempts.some((existing)=>existing.attemptId===item.attemptId))]);
        } else setQuizAttempts(accountAttempts);
        if (authMode === 'register') {
          const mergedReading = [...accountReading];
          for (const item of localReading) { const index=mergedReading.findIndex((entry)=>entry.title===item.title); if(index<0)mergedReading.push(item); else mergedReading[index]=item; }
          setReadingList(mergedReading);
          if (mergedReading.length) await fetch('/api/learning/reading-list',{method:'PUT',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:mergedReading})});
        } else setReadingList(accountReading);
      }
      setAccountOpen(false); setToast(authMode === 'register' ? 'Your learning account is ready' : `Welcome back, ${body.user.name}`);
    } catch (caught) {
      if (caught instanceof TypeError) {
        setAuthError('We couldn’t connect just now. Check your internet connection and try again.');
      } else setAuthError(caught.message);
    } finally { setAuthBusy(false); }
  };
  const saveProfile = async (profile) => { try { const response = await fetch('/api/auth/profile', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profile) }); const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Could not update your profile.'); setUser(body.user); setToast('Profile updated'); return true; } catch (caught) { setToast(caught.message); return false; } };
  const changePassword = async (passwords) => { try { const response = await fetch('/api/auth/password', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(passwords) }); const body = await response.json(); if (!response.ok) throw new Error(body.details?.newPassword?.[0] || body.error || 'Could not update your password.'); setToast('Password updated'); return true; } catch (caught) { setToast(caught.message); return false; } };
  const deleteAccount = async (currentPassword) => { try { const response = await fetch('/api/auth/account', { method: 'DELETE', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword }) }); if (!response.ok) { const body = await response.json(); throw new Error(body.error || 'Could not delete this account.'); } setUser(null); setHistory(safeRead()); setComparisons(safeReadKey('fincoach-comparisons', [])); setCompletedLessons(safeReadKey('fincoach-lessons', [])); setQuizAttempts(safeReadKey('fincoach-quiz-attempts', [])); setReadingList(safeReadKey('fincoach-reading-list', [])); setToast('Account and account scenarios deleted'); return true; } catch (caught) { setToast(caught.message); return false; } };
  const signOut = async () => { try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }); } catch {} setUser(null); setHistory(safeRead()); setComparisons(safeReadKey('fincoach-comparisons', [])); setCompletedLessons(safeReadKey('fincoach-lessons', [])); setQuizAttempts(safeReadKey('fincoach-quiz-attempts', [])); setReadingList(safeReadKey('fincoach-reading-list', [])); setAccountOpen(false); setToast('Signed out'); };
  const clearHistory = async () => {
    if (!window.confirm(`Delete all ${history.length} saved ${history.length === 1 ? 'scenario' : 'scenarios'}? This cannot be undone.`)) return;
    if (user) {
      try {
        const ids = history.filter((item) => /^[a-f\d]{24}$/i.test(item.id)).map((item) => item.id);
        const responses = await Promise.all(ids.map((id) => fetch(`/api/simulations/${id}`, { method: 'DELETE', credentials: 'include' })));
        if (responses.some((response) => !response.ok)) throw new Error('Some scenarios could not be deleted. Please try again.');
      } catch (caught) { setToast(caught.message); return; }
    }
    setHistory([]); setScenarioA(null); setScenarioB(null); setToast('Saved scenarios deleted');
  };
  const completeLesson = async (id) => {
    const next = completedLessons.includes(id) ? completedLessons : [...completedLessons, id];
    setCompletedLessons(next);
    if (!user) return;
    try {
      const response = await fetch('/api/learning/progress', { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completedLessons: next }) });
      if (!response.ok) throw new Error('Progress could not sync');
    } catch {
      setToast('Lesson progress is saved in this browser; account sync is unavailable right now.');
    }
  };
  const submitQuizAttempt = async ({ lessonId, selectedAnswer, correctIndex }) => {
    const localAttempt = { attemptId: crypto.randomUUID(), lessonId, selectedAnswer, isCorrect: selectedAnswer === correctIndex, score: selectedAnswer === correctIndex ? 1 : 0, total: 1, createdAt: new Date().toISOString() };
    let savedAttempt = localAttempt;
    if (user) {
      try {
        const response = await fetch('/api/learning/attempts', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ attemptId: localAttempt.attemptId, lessonId, selectedAnswer }) });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Quiz attempt could not be saved.');
        savedAttempt = body.attempt;
      } catch (caught) { setToast(caught.message); return null; }
    }
    setQuizAttempts((current) => [savedAttempt, ...current.filter((item) => item.attemptId !== savedAttempt.attemptId)].slice(0, 200));
    return savedAttempt;
  };
  const submitCourseAssessment = async ({ assessmentId, answers }) => {
    const assessment = courseAssessments.find((item) => item.id === assessmentId);
    if (!assessment) return null;
    const score = answers.reduce((total, answer, index) => total + Number(answer === assessment.questions[index].answer), 0);
    const localAttempt = { attemptId: crypto.randomUUID(), kind: 'course-assessment', assessmentId, courseId: assessment.courseId, title: assessment.title, answers, score, total: assessment.questions.length, percentage: Math.round(score / assessment.questions.length * 100), isCorrect: score === assessment.questions.length, createdAt: new Date().toISOString() };
    let savedAttempt = localAttempt;
    if (user) {
      try {
        const response = await fetch(`/api/learning/assessments/${assessmentId}/attempts`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ attemptId: localAttempt.attemptId, answers }) });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Assessment could not be saved.');
        savedAttempt = body.attempt;
      } catch (caught) { setToast(caught.message); return null; }
    }
    setQuizAttempts((current) => [savedAttempt, ...current.filter((item) => item.attemptId !== savedAttempt.attemptId)].slice(0, 200));
    return savedAttempt;
  };
  const setBookReadingStatus = async (title, status) => {
    const next = status === 'Not added' ? readingList.filter((item)=>item.title!==title) : [...readingList.filter((item)=>item.title!==title),{title,status}];
    setReadingList(next);
    if (!user) return;
    try { const response=await fetch('/api/learning/reading-list',{method:'PUT',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:next})}); if(!response.ok)throw new Error('Reading progress could not be saved.'); }
    catch(caught){setToast(caught.message);}
  };
  const nav = [
    { label: 'Workspace', items: [{ id: 'dashboard', label: 'Overview', icon: Home }, { id: 'simulator', label: 'Simulators', icon: Activity }, { id: 'replay', label: 'Decision Replay', icon: RotateCcw }] },
    { label: 'Your space', items: [{ id: 'history', label: 'My history', icon: Clock3 }, { id: 'learn', label: 'Learn', icon: BookOpen }, { id: 'progress', label: 'My progress', icon: Check }] },
  ];

  return <div className="app-shell">
    <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
      <div className="brand"><div className="brand-mark"><BadgeIndianRupee size={20} /></div><div><strong>fincoach</strong><span>learn by trying</span></div><button className="mobile-close icon-button" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X size={18} /></button></div>
      <div className="workspace-switch"><div className="avatar">S</div><div><strong>Student workspace</strong><span>Personal learning</span></div><ChevronDown size={15} /></div>
      <nav aria-label="Main navigation">{nav.map((group) => <div className="nav-group" key={group.label}><div className="nav-label">{group.label}</div>{group.items.map(({ id, label, icon: Icon }) => <button className={`nav-item ${section === id ? 'nav-active' : ''}`} key={id} onClick={() => chooseSection(id)}><Icon size={17} strokeWidth={1.8} /><span>{label}</span>{id === 'replay' && (scenarioA || scenarioB) && <span className="nav-dot" />}</button>)}</div>)}</nav>
      <div className="sidebar-spacer" />
      <div className="sidebar-tip"><div className="tip-icon"><Sparkles size={16} /></div><strong>Small steps, clearer choices.</strong><p>Every simulation is a safe place to learn. No real money involved.</p><button onClick={() => chooseSection('learn')}>Explore the guide <ArrowRight size={13} /></button></div>
      <button className={`nav-item settings-link ${section === 'settings' ? 'nav-active' : ''}`} onClick={() => chooseSection('settings')}><Settings2 size={17} /><span>Settings</span></button>
      <button className="profile profile-button" onClick={() => { setAuthError(''); setAccountOpen(true); }}><div className="avatar avatar-dark">{user?.name?.slice(0,1).toUpperCase() ?? 'S'}</div><div><strong>{user?.name ?? 'Student'}</strong><span>{user ? user.email : 'Learning mode'}</span></div><ChevronDown size={16} /></button>
    </aside>
    {mobileOpen && <button className="mobile-scrim" onClick={() => setMobileOpen(false)} aria-label="Close navigation" />}

    <main className="main-area">
      <header className="topbar"><button className="mobile-menu icon-button" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={20} /></button><div className="breadcrumbs"><span>FinCoach</span><span className="crumb-slash">/</span><strong>{section === 'simulator' ? titleFor(module) : section === 'dashboard' ? 'Overview' : section === 'replay' ? 'Decision Replay' : section === 'history' ? 'My history' : section === 'progress' ? 'My progress' : section === 'settings' ? 'Settings' : 'Learn'}</strong></div><div className="topbar-right"><span className="safe-badge"><ShieldCheck size={14} /> Virtual practice</span><button className="top-avatar top-avatar-button" onClick={() => { setAuthError(''); setAccountOpen(true); }} aria-label={user ? `Account: ${user.name}` : 'Sign in or create an account'}>{user?.name?.slice(0,1).toUpperCase() ?? 'S'}</button></div></header>
      <div className="page-wrap">
        {section === 'dashboard' && <Dashboard history={history} completedLessons={completedLessons} chooseModule={(id) => { setModule(id); setFormErrors({}); setActive(null); setError(''); setCalculated(true); chooseSection('simulator'); }} openRecord={openRecord} setSection={chooseSection} />}
        {section === 'simulator' && <Simulator module={module} setModule={(id) => { setModule(id); setFormErrors({}); setActive(null); setError(''); setCalculated(true); }} inputs={inputs[module]} update={update} updateCategory={updateCategory} removeCategory={removeCategory} reset={() => { setInputs((current) => ({ ...current, [module]: structuredClone(initialInputs[module]) })); setFormErrors({}); setError(''); setActive(null); setCalculated(true); }} result={result} error={error} formErrors={formErrors} calculated={calculated} run={runSimulation} save={saveScenario} active={active} replayComparisonId={replayComparisonId} saveReplayVersion={saveReplayVersion} />}
        {section === 'replay' && <Replay history={history} comparisons={comparisons} a={scenarioA} b={scenarioB} setA={setScenarioA} setB={setScenarioB} openRecord={openRecord} remove={removeRecord} saveComparison={saveComparison} openComparison={openComparison} removeComparison={removeComparison} renameComparison={renameComparison} activeComparisonId={replayComparisonId} startReplayVersion={startReplayVersion} />}
        {section === 'history' && <History history={history} search={search} setSearch={setSearch} user={user} openRecord={openRecord} duplicate={duplicateRecord} remove={removeRecord} rename={renameRecord} />}
        {section === 'settings' && <Settings user={user} history={history} theme={theme} setTheme={setTheme} onAccount={() => { setAuthError(''); setAccountOpen(true); }} onClear={clearHistory} onProfileSave={saveProfile} onPasswordChange={changePassword} onDeleteAccount={deleteAccount} />}
        {section === 'learn' && <Learn completedLessons={completedLessons} quizAttempts={quizAttempts} submitQuizAttempt={submitQuizAttempt} submitCourseAssessment={submitCourseAssessment} completeLesson={completeLesson} chooseModule={chooseModule} readingList={readingList} setBookReadingStatus={setBookReadingStatus} />}
        {section === 'progress' && <CourseProgress completedLessons={completedLessons} quizAttempts={quizAttempts} readingList={readingList} history={history} user={user} setSection={chooseSection} />}
      </div>
    </main>
    {toast && <div className="toast" role="status"><Check size={16} />{toast}</div>}
    {accountOpen && <AccountDialog user={user} mode={authMode} setMode={(mode) => { setAuthMode(mode); setAuthError(''); }} error={authError} busy={authBusy} onSubmit={submitAuth} onClose={() => setAccountOpen(false)} onSignOut={signOut} />}
  </div>;
}

function normalizeRemote(record) { if (!record) return record; return { ...record, id: String(record.id ?? record._id), result: record.result ?? record.results, createdAt: record.createdAt ?? record.updatedAt ?? new Date().toISOString() }; }
function normalizeSnapshot(record) { return { ...record, result: record.result ?? record.results }; }
function normalizeComparison(record) {
  const scenarioA=normalizeSnapshot(record.scenarioA); const scenarioB=normalizeSnapshot(record.scenarioB);
  const versions=(record.versions?.length?record.versions:[{scenario:scenarioB,changes:[],notes:'',createdAt:record.createdAt}]).map((version,index)=>({...version,versionNumber:index+1,scenario:normalizeSnapshot(version.scenario)}));
  return { ...record, id: String(record.id ?? record._id), createdAt: record.createdAt ?? new Date().toISOString(), scenarioA, scenarioB, versions };
}
function Settings({ user, history, theme, setTheme, onAccount, onClear, onProfileSave, onPasswordChange, onDeleteAccount }) {
  const [name, setName] = useState(user?.name ?? ''); const [email, setEmail] = useState(user?.email ?? ''); const [profileError, setProfileError] = useState(''); const [passwordError, setPasswordError] = useState('');
  const [showDelete, setShowDelete] = useState(false); const [deleteError, setDeleteError] = useState('');
  useEffect(()=>{setName(user?.name??'');setEmail(user?.email??'');},[user?.name,user?.email]);
  const exportScenarios = () => {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), scenarios: history }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'fincoach-scenarios.json'; link.click(); URL.revokeObjectURL(url);
  };
  return <>
    <div className="page-title-row"><div><div className="eyebrow">YOUR PREFERENCES</div><h1>Settings</h1><p>Manage your account and saved learning scenarios.</p></div></div>
    <section className="settings-card"><div className="settings-card-head"><div className="settings-icon"><ShieldCheck size={18}/></div><div><span className="panel-kicker">ACCOUNT</span><h2>{user ? 'Your FinCoach account' : 'Learning mode'}</h2></div></div><p>{user ? 'Edit your account details. Your saved scenarios remain private to this account.' : 'You can use every simulator without an account. Create one to sync saved scenarios across sessions.'}</p>{user?<form className="settings-form-grid" onSubmit={async(event)=>{event.preventDefault();setProfileError('');if(!await onProfileSave({name:name.trim(),email:email.trim()}))setProfileError('Check the details and try again.');}}><label className="field"><span className="field-label">Name</span><input className="auth-input" value={name} onChange={e=>setName(e.target.value)} required maxLength="80"/></label><label className="field"><span className="field-label">Email</span><input className="auth-input" type="email" value={email} onChange={e=>setEmail(e.target.value)} required maxLength="254"/></label>{profileError&&<span className="auth-error" role="alert">{profileError}</span>}<button className="button button-outline" type="submit">Save profile <Check size={14}/></button><button className="button button-outline" type="button" onClick={onAccount}>Account details and sign out <ArrowRight size={14}/></button></form>:<button className="button button-outline" onClick={onAccount}>Sign in or create an account <ArrowRight size={14}/></button>}</section>
    <section className="settings-card"><div className="settings-card-head"><div className="settings-icon"><Sparkles size={17}/></div><div><span className="panel-kicker">APPEARANCE</span><h2>Display theme</h2></div></div><p>Choose the appearance that feels comfortable. Your choice is saved in this browser.</p><div className="settings-actions theme-options">{['light','dark','system'].map((option)=><button key={option} className={`button ${theme===option?'button-primary':'button-outline'}`} aria-pressed={theme===option} onClick={()=>setTheme(option)}>{option[0].toUpperCase()+option.slice(1)}</button>)}</div><p className="settings-subnote">Currency: INR · Indian Rupee</p></section>
    <section className="settings-card"><div className="settings-card-head"><div className="settings-icon"><Save size={17}/></div><div><span className="panel-kicker">SCENARIO DATA</span><h2>Your saved scenarios</h2></div><span className="quiet-count">{history.length} saved</span></div><p>{user ? 'Scenarios are stored with your account on this device’s FinCoach server.' : 'Scenarios are saved in this browser only. They will remain available after a refresh on this device.'}</p><div className="settings-actions"><button className="button button-outline" onClick={exportScenarios} disabled={!history.length}><Download size={14}/> Export scenarios</button><button className="button button-danger" onClick={onClear} disabled={!history.length}><Trash2 size={14}/> Delete all scenarios</button></div></section>
    {user&&<section className="settings-card"><div className="settings-card-head"><div className="settings-icon"><ShieldCheck size={17}/></div><div><span className="panel-kicker">PRIVACY & SECURITY</span><h2>Change password</h2></div></div><p>Use your current password to choose a new password. It must be at least 8 characters.</p><form className="settings-password-form" onSubmit={async(event)=>{event.preventDefault();setPasswordError('');const formNode=event.currentTarget;const form=new FormData(formNode);const ok=await onPasswordChange({currentPassword:form.get('currentPassword'),newPassword:form.get('newPassword')});if(ok)formNode.reset();else setPasswordError('Check your current password and new password, then try again.');}}><label className="field"><span className="field-label">Current password</span><PasswordInput name="currentPassword" minLength="8" maxLength="128" required autoComplete="current-password"/></label><label className="field"><span className="field-label">New password</span><PasswordInput name="newPassword" minLength="8" maxLength="128" required autoComplete="new-password"/></label>{passwordError&&<span className="auth-error" role="alert">{passwordError}</span>}<button className="button button-outline" type="submit">Update password <ArrowRight size={14}/></button></form><div className="delete-account-area"><button className="button button-danger" onClick={()=>{setShowDelete((value)=>!value);setDeleteError('');}}>{showDelete?'Cancel account deletion':'Delete account'} <Trash2 size={14}/></button>{showDelete&&<form className="delete-account-form" onSubmit={async(event)=>{event.preventDefault();if(!window.confirm('Permanently delete your account, scenarios, and saved comparisons? This cannot be undone.'))return;const password=new FormData(event.currentTarget).get('currentPassword');if(!await onDeleteAccount(password))setDeleteError('Account not deleted. Check the current password and try again.');}}><p>This removes your account and all server-saved learning records.</p><label className="field"><span className="field-label">Confirm with current password</span><PasswordInput name="currentPassword" minLength="8" required autoComplete="current-password"/></label>{deleteError&&<span className="auth-error" role="alert">{deleteError}</span>}<button className="button button-danger" type="submit">Permanently delete account</button></form>}</div></section>}
    <section className="settings-card"><div className="settings-card-head"><div className="settings-icon"><CircleHelp size={17}/></div><div><span className="panel-kicker">ABOUT FINCOACH</span><h2>Financial learning, not financial advice</h2></div></div><p>FinCoach helps students explore hypothetical outcomes using transparent assumptions. Version 1.0 · Currency: INR.</p><button className="text-link" onClick={()=>{onAccount();}}>Account and help <ArrowRight size={13}/></button></section>
    <div className="settings-note"><CircleHelp size={15}/><span>FinCoach is a learning tool. Account and scenario data are used only to keep your practice history available.</span></div>
  </>;
}
function AccountDialog({ user, mode, setMode, error, busy, onSubmit, onClose, onSignOut }) {
  return <div className="modal-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="account-dialog" role="dialog" aria-modal="true" aria-labelledby="account-title"><button className="modal-close icon-button" onClick={onClose} aria-label="Close account dialog"><X size={17}/></button>{user ? <><div className="account-modal-mark"><Check size={20}/></div><div className="panel-kicker">YOUR ACCOUNT</div><h2 id="account-title">Hi, {user.name}</h2><p className="account-intro">Your saved scenarios are synced to your account.</p><div className="account-email"><span>Email</span><strong>{user.email}</strong></div><button className="button button-outline account-submit" onClick={onSignOut}>Sign out</button></> : <><div className="account-modal-mark"><ShieldCheck size={20}/></div><div className="panel-kicker">SAVE YOUR PROGRESS</div><h2 id="account-title">{mode === 'register' ? 'Create your account' : 'Welcome back'}</h2><p className="account-intro">Keep your simulations with you across sessions.</p><form className="auth-form" onSubmit={onSubmit}>{mode === 'register' && <label className="field"><span className="field-label">Your name</span><input className="auth-input" name="name" autoComplete="name" required maxLength="80" /></label>}<label className="field"><span className="field-label">Email address</span><input className="auth-input" name="email" type="email" autoComplete="email" required maxLength="254" /></label><label className="field"><span className="field-label">Password</span><PasswordInput name="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} minLength="8" maxLength="128" required /></label>{mode === 'register' && <><p className="password-hint">Use at least 8 characters, including a letter and a number.</p><label className="field"><span className="field-label">Confirm password</span><PasswordInput name="confirmPassword" autoComplete="new-password" minLength="8" maxLength="128" required /></label></>}{error && <div className="auth-error" role="alert">{error}</div>}<button className="button button-primary account-submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'register' ? 'Create account' : 'Sign in'} <ArrowRight size={14}/></button></form><div className="auth-switch">{mode === 'register' ? 'Already have an account?' : 'New to FinCoach?'} <button onClick={() => setMode(mode === 'register' ? 'login' : 'register')}>{mode === 'register' ? 'Sign in' : 'Create an account'}</button></div><p className="auth-footnote">Your password is securely hashed. We only save the learning scenarios you choose.</p></>}</section></div>;
}

function Dashboard({ history, completedLessons, chooseModule, openRecord, setSection }) {
  const latest = history.slice(0, 3);
  const replayReady = modules.some(({id}) => history.filter((item) => item.type === id).length >= 2);
  const done = Number(history.length > 0) + Number(completedLessons.length > 0) + Number(replayReady);
  return <>
    <div className="welcome-row"><div><div className="eyebrow"><span className="eyebrow-dot" /> YOUR FINANCIAL LEARNING SPACE</div><h1>Good choices start<br className="desktop-only" /> with a little curiosity.</h1><p className="lead">Try out a money decision. See how the numbers move. Learn at your own pace.</p></div><div className="welcome-art" aria-hidden="true"><div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" /><div className="art-sun"><Sparkles size={25} /></div><div className="art-pill pill-a">Learn by doing</div><div className="art-pill pill-b">₹ + choices</div></div></div>
    <div className="section-heading"><div><h2>Pick up where you want to begin</h2><p>Six practical ways to explore everyday money decisions.</p></div><span className="quiet-count">{modules.length} learning tools</span></div>
    <div className="module-grid">{modules.map(({ id, label, caption, icon: Icon, accent }, index) => <button key={id} className={`module-card module-${accent}`} onClick={() => chooseModule(id)}><div className="module-card-top"><div className="module-icon"><Icon size={19} strokeWidth={1.8} /></div><span className="card-index">0{index + 1}</span></div><strong>{label}</strong><span className="module-caption">{caption}</span><span className="module-action">Explore <ArrowRight size={14} /></span><div className="card-watermark"><Icon size={64} strokeWidth={1} /></div></button>)}</div>
    <section className="getting-started"><div className="getting-heading"><div><span className="panel-kicker">GETTING STARTED</span><h2>Your learning checklist</h2><p>Small steps make the tools easier to explore.</p></div><strong>{done}/3 complete</strong></div><div className="progress-track"><span style={{width:`${done/3*100}%`}}/></div><div className="checklist-grid"><button onClick={()=>chooseModule('investment')}><Check size={15} className={history.length?'check-done':''}/><span><strong>Run your first simulation</strong><small>{history.length?'Scenario saved':'Choose any tool to begin'}</small></span><ArrowRight size={14}/></button><button onClick={()=>setSection('learn')}><Check size={15} className={completedLessons.length?'check-done':''}/><span><strong>Try a learning quiz</strong><small>{completedLessons.length?`${completedLessons.length} lesson${completedLessons.length===1?'':'s'} completed`:'Build confidence with a quick question'}</small></span><ArrowRight size={14}/></button><button onClick={()=>replayReady?setSection('replay'):chooseModule('investment')}><Check size={15} className={replayReady?'check-done':''}/><span><strong>Compare two choices</strong><small>{replayReady?'Ready to replay':'Save two of one simulator to compare'}</small></span><ArrowRight size={14}/></button></div></section>
    <div className="dashboard-lower"><section className="replay-banner"><div className="replay-banner-icon"><RotateCcw size={20} /></div><div className="replay-copy"><span className="mini-label">THE FINCOACH DIFFERENCE</span><h3>What if you chose differently?</h3><p>Replay a decision with a changed input. Compare both paths and see what made the difference.</p><button className="button button-dark" onClick={() => setSection('replay')}>Try Decision Replay <ArrowRight size={15} /></button></div><div className="replay-graphic" aria-hidden="true"><div className="graph-line graph-line-a"/><div className="graph-line graph-line-b"/><span className="graph-point point-a"/><span className="graph-point point-b"/><span className="graph-axis">TODAY <span>→</span> LATER</span></div></section>
    <section className="recent-card"><div className="recent-heading"><div><h3>Recently explored</h3><p>Your latest practice scenarios</p></div><button className="text-link" onClick={() => setSection('history')}>View all <ArrowRight size={14} /></button></div>{latest.length ? <div className="recent-list">{latest.map((item) => <button className="recent-row" key={item.id} onClick={() => openRecord(item)}><div className={`recent-icon ${item.type}`}><ModuleIcon type={item.type} /></div><div className="recent-title"><strong>{item.title}</strong><span>{titleFor(item.type)} · {new Date(item.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span></div><ArrowRight size={15} className="recent-arrow" /></button>)}</div> : <div className="empty-mini"><div className="empty-symbol"><Clock3 size={17} /></div><strong>Your story starts here</strong><span>Run a simulation and it’ll appear here.</span></div>}</section></div>
    <div className="disclosure-strip"><CircleHelp size={16} /><span>FinCoach is for learning, not financial advice. Results use assumptions you choose and do not predict actual outcomes.</span><button onClick={() => setSection('learn')}>How it works <ArrowRight size={13} /></button></div>
  </>;
}
function ModuleIcon({ type }) { const match = modules.find((item) => item.id === type); const Icon = match?.icon ?? Wallet; return <Icon size={17} />; }

function Simulator({ module, setModule, inputs, update, updateCategory, removeCategory, reset, result, error, formErrors, calculated, run, save, active, replayComparisonId, saveReplayVersion }) {
  const [newCategoryName, setNewCategoryName] = useState('');
  const isBudget = module === 'budget';
  const fields = {
    investment: [{ key: 'principal', label: 'Starting amount', prefix: '₹', suffix: 'INR', hint: 'A one-time amount to explore' }, { key: 'monthlyContribution', label: 'Monthly contribution', prefix: '₹', suffix: 'INR', hint: 'Deposited at each month end' }, { key: 'years', label: 'Time horizon', suffix: 'years', hint: 'How long you’ll let it grow' }, { key: 'rate', label: 'Investment rate', suffix: '%', hint: 'An illustrative assumption' }, { key: 'fdRate', label: 'FD comparison rate', suffix: '%', hint: 'Illustrative FD assumption' }, { key: 'frequency', label: 'Compounding', suffix: '× / year', hint: '1 = annual, 12 = monthly' }, { key: 'annualIncrease', label: 'Annual contribution increase', suffix: '%', hint: 'Increase monthly deposits each year' }, { key: 'inflation', label: 'Inflation assumption', suffix: '%', hint: 'Used for today’s value estimate' }],
    loan: [{ key: 'principal', label: 'Loan amount', prefix: '₹', suffix: 'INR', hint: 'The amount borrowed' }, { key: 'rate', label: 'Annual interest rate', suffix: '%', hint: 'Nominal annual rate' }, { key: 'months', label: 'Loan term', suffix: 'months', hint: 'Number of monthly payments' }, { key: 'extraMonthlyPayment', label: 'Extra monthly payment', prefix: '₹', suffix: 'INR', hint: 'Applied after the regular EMI' }, { key: 'prepayment', label: 'One-time prepayment', prefix: '₹', suffix: 'INR', hint: 'Applied with the first payment' }, { key: 'processingFee', label: 'Processing fee', prefix: '₹', suffix: 'INR', hint: 'One-time fee, not included in EMI' }],
    'credit-card': [{ key: 'balance', label: 'Card balance', prefix: '₹', suffix: 'INR', hint: 'Starting virtual balance' }, { key: 'apr', label: 'Annual percentage rate', suffix: '% APR', hint: 'Converted to APR ÷ 12 per month' }, { key: 'payment', label: 'Monthly payment', prefix: '₹', suffix: 'INR', hint: 'Base amount paid each month' }, { key: 'additionalMonthlyPayment', label: 'Additional monthly payment', prefix: '₹', suffix: 'INR', hint: 'Optional extra toward the balance' }, { key: 'newSpending', label: 'New monthly spending', prefix: '₹', suffix: 'INR', hint: 'Assumed at the start of each month' }],
    'savings-goal': [{ key: 'target', label: 'Target amount', prefix: '₹', suffix: 'INR', hint: 'Your savings goal' }, { key: 'currentSavings', label: 'Current savings', prefix: '₹', suffix: 'INR', hint: 'Amount already set aside' }, { key: 'monthlyContribution', label: 'Monthly contribution', prefix: '₹', suffix: 'INR', hint: 'Deposited at each month end' }, { key: 'annualRate', label: 'Assumed annual rate', suffix: '%', hint: 'Optional illustrative interest' }],
    'buy-vs-save': [{ key: 'itemPrice', label: 'Item price', prefix: '₹', suffix: 'INR', hint: 'Price of the item' }, { key: 'availableSavings', label: 'Available savings', prefix: '₹', suffix: 'INR', hint: 'Savings kept available today' }, { key: 'monthlySavings', label: 'Monthly savings capacity', prefix: '₹', suffix: 'INR', hint: 'Amount available to save monthly' }, { key: 'cardApr', label: 'Credit card APR', suffix: '%', hint: 'APR ÷ 12, fixed-rate example' }, { key: 'loanRate', label: 'Personal loan rate', suffix: '%', hint: 'Annual nominal rate' }, { key: 'months', label: 'Financing term', suffix: 'months', hint: 'Term for both borrowing examples' }, { key: 'cardFee', label: 'Card processing fee', prefix: '₹', suffix: 'INR', hint: 'One-time illustrative fee' }, { key: 'loanFee', label: 'Loan processing fee', prefix: '₹', suffix: 'INR', hint: 'One-time illustrative fee' }],
  };
  const categoryEntries = Object.entries(inputs.categories ?? {});
  const bestPurchase = result?.options?.filter((option) => option.totalCost !== null).sort((a, b) => a.totalCost - b.totalCost)[0];
  const metrics = module === 'investment' ? [{ label: 'Investment value', value: formatINR(result?.finalValue), note: 'At your assumed rate', icon: ArrowUpRight, tone: 'positive' }, { label: 'Total contributed', value: formatINR(result?.totalInvested), note: 'Starting amount + monthly deposits', icon: Wallet, tone: '' }, { label: 'FD comparison', value: formatINR(result?.fdValue), note: `At ${result?.fdRate}% assumed rate`, icon: Landmark, tone: '' }, { label: 'Inflation-adjusted estimate', value: formatINR(result?.inflationAdjustedValue), note: `At ${result?.inflationRate}% assumed inflation`, icon: Activity, tone: 'warm' }]
    : module === 'loan' ? [{ label: 'Monthly EMI', value: formatINR(result?.emi, 2), note: 'Before optional extra payments', icon: ArrowDownRight, tone: '' }, { label: 'Total interest', value: formatINR(result?.totalInterest), note: 'Cost of borrowing', icon: Activity, tone: 'warm' }, { label: 'Interest saved', value: formatINR(result?.interestSaved), note: `${result?.monthsPaid ?? '—'} months to repay`, icon: ArrowUpRight, tone: 'positive' }]
    : module === 'credit-card' ? [{ label: 'Time to clear', value: `${result?.months ?? '—'} months`, note: 'With base payment plus extra', icon: Clock3, tone: '' }, { label: 'Total interest', value: formatINR(result?.totalInterest), note: 'Under APR ÷ 12 assumptions', icon: Activity, tone: 'warm' }, { label: 'Interest saved', value: result?.interestSaved === null ? 'No payoff baseline' : formatINR(result?.interestSaved), note: 'Compared with the base payment', icon: ArrowUpRight, tone: 'positive' }]
    : module === 'savings-goal' ? [{ label: 'Amount remaining', value: formatINR(result?.remaining), note: `${(result?.progressPercent ?? 0).toFixed(0)}% saved so far`, icon: Target, tone: '' }, { label: 'Monthly amount needed', value: formatINR(result?.requiredMonthlyContribution), note: `To reach your goal by ${result?.monthsUntilTarget ?? '—'} months`, icon: ArrowUpRight, tone: 'positive' }]
    : module === 'buy-vs-save' ? [{ label: 'Lowest estimated cost', value: formatINR(bestPurchase?.totalCost), note: bestPurchase?.label ?? 'Compare the options', icon: ShoppingBag, tone: 'positive' }, { label: 'Lowest monthly payment', value: formatINR(Math.min(result?.options?.[1]?.monthlyPayment ?? Infinity, result?.options?.[2]?.monthlyPayment ?? Infinity)), note: 'For the financing options', icon: ArrowDownRight, tone: '' }]
    : [{ label: 'Allocated', value: formatINR(result?.allocated), note: 'Across your categories', icon: Wallet, tone: '' }, { label: 'Left to plan', value: formatINR(result?.remaining), note: result?.overAllocated ? 'Over your monthly income' : 'Unallocated from monthly income', icon: result?.overAllocated ? ArrowDownRight : ArrowUpRight, tone: result?.overAllocated ? 'warm' : 'positive' }];
  const chart = result?.chart ?? result?.schedule ?? [];
  const data = module === 'investment' ? chart : chart.filter((_, index) => index % Math.max(1, Math.ceil(chart.length / 40)) === 0);
  const resultLabel = module === 'investment' ? 'Estimated value' : module === 'loan' ? 'Remaining balance' : module === 'credit-card' ? 'Card balance' : module === 'savings-goal' ? 'Projected savings' : module === 'buy-vs-save' ? 'Estimated total cost' : 'Monthly allocation';
  return <>
    <div className="page-title-row"><div><div className="eyebrow">SIMULATION STUDIO</div><h1>Explore a scenario</h1><p>Change the assumptions and see what your choices could mean.</p></div><div className="active-save">{active && <span className="loaded-pill"><Check size={13} /> Opened from history</span>}<button className="button button-outline" onClick={() => save()}><Save size={15} /> Save scenario</button></div></div>
    <div className="sim-layout"><section className="sim-input-panel"><div className="panel-header"><div><span className="panel-kicker">CHOOSE A TOOL</span><h2>Set your assumptions</h2></div><Settings2 size={17} className="panel-muted-icon" /></div>
      <div className="module-tabs">{modules.map(({ id, label, icon: Icon }) => <button className={`module-tab ${module === id ? 'tab-selected' : ''}`} key={id} onClick={() => setModule(id)} aria-pressed={module === id}><Icon size={15} /><span>{id === 'budget' ? 'Budget' : label.replace(' planner', '')}</span></button>)}</div>
      <div className="sim-form" key={module}>{module === 'budget' ? <><NumberField label="Monthly income" value={inputs.income} prefix="₹" suffix="INR" hint="Virtual monthly income" onChange={(value) => update('income', value)} error={formErrors.income} /><div className="form-divider"/><div className="category-heading"><div><strong>Monthly allocations</strong><span>Split your income across categories</span></div><span className="category-total">{formatINR(categoryEntries.reduce((sum, [, v]) => sum + (Number(v) || 0), 0))}</span></div>{categoryEntries.map(([name, value]) => <div className="budget-category-row" key={name}><NumberField label={name} value={value} prefix="₹" compact hint="" onChange={(next) => updateCategory(name, next)} error={formErrors[`category:${name}`]} /><button className="icon-button" type="button" onClick={() => removeCategory(name)} aria-label={`Remove ${name} category`} title={`Remove ${name}`}><X size={15}/></button></div>)}<div className="add-category-row"><input className="auth-input" aria-label="New budget category" placeholder="Add a category" value={newCategoryName} maxLength={40} onChange={(event) => setNewCategoryName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); const name = newCategoryName.trim(); if (name && !Object.hasOwn(inputs.categories, name)) { updateCategory(name, '0'); setNewCategoryName(''); } } }} /><button className="button button-outline button-compact" type="button" disabled={!newCategoryName.trim() || Object.hasOwn(inputs.categories, newCategoryName.trim())} onClick={() => { const name = newCategoryName.trim(); if (name && !Object.hasOwn(inputs.categories, name)) { updateCategory(name, '0'); setNewCategoryName(''); } }}><Plus size={14}/> Add category</button></div>{newCategoryName.trim() && Object.hasOwn(inputs.categories, newCategoryName.trim()) && <span className="field-hint field-error-text">That category already exists.</span>}</> : module === 'savings-goal' ? <><TextField label="Goal name" value={inputs.goalName} maxLength="80" onChange={(value) => update('goalName', value)} /><DateField label="Target completion date" value={inputs.targetDate} onChange={(value) => update('targetDate', value)} error={formErrors.targetDate} />{fields[module].map((field) => <NumberField {...field} key={field.key} value={inputs[field.key]} onChange={(value) => update(field.key, value)} error={formErrors[field.key]} />)}</> : (fields[module] ?? []).map((field) => <NumberField {...field} key={field.key} value={inputs[field.key]} onChange={(value) => update(field.key, value)} error={formErrors[field.key]} />)}</div>
      <div className="sim-controls"><button className="button button-primary run-button" onClick={run}><Sparkles size={16} /> Update simulation <ArrowRight size={15} /></button><button className="text-link reset-inputs" onClick={reset}><RotateCcw size={13}/> Reset inputs</button></div>
      <div className="assumption-note"><ShieldCheck size={16} /><div><strong>Learning assumptions</strong><span>These numbers are illustrative. Real rates, terms, taxes and fees may differ.</span></div></div>
    </section>
    <section className="sim-results"><div className="results-heading"><div><span className="panel-kicker">YOUR SIMULATION</span><h2>{titleFor(module)}</h2></div><span className="live-indicator"><i /> {calculated ? 'Updated just now' : 'Needs attention'}</span></div>
      {!calculated && error && <div className="error-banner" role="alert"><CircleHelp size={17} /><div><strong>Check your assumptions</strong><span>{error}</span></div></div>}
      {calculated && result && <><div className="metric-grid">{metrics.map(({ label, value, note, icon: Icon, tone }) => <div className={`metric-card ${tone}`} key={label}><div className="metric-top"><span>{label}</span><Icon size={16} /></div><strong>{value}</strong><span>{note}</span></div>)}</div>
      {module === 'budget' && result.overAllocated && <div className="warning-banner"><ArrowDownRight size={16} /> Your allocations exceed monthly income by {formatINR(-result.remaining)}. Adjust them before saving.</div>}
      <div className="chart-panel"><div className="chart-heading"><div><h3>{module === 'budget' ? 'Where your money goes' : module === 'buy-vs-save' ? 'Compare estimated costs' : module === 'savings-goal' ? 'Progress toward your target' : 'How the balance changes'}</h3><p>{module === 'investment' ? 'Illustrative growth over your time horizon' : module === 'loan' ? 'Loan balance after each payment' : module === 'credit-card' ? 'Remaining balance with your chosen payment' : module === 'savings-goal' ? 'Projected monthly savings with end-of-month deposits' : module === 'buy-vs-save' ? 'Estimated total cost for each purchase path' : 'Your allocations compared with income'}</p></div><button className="chart-menu" aria-label="Chart information" title={result.formula}><CircleHelp size={17} /></button></div>
        <div className="chart-area">{module === 'budget' ? <BudgetBar result={result} /> : module === 'buy-vs-save' ? <PurchaseCostChart result={result} /> : <ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{ top: 10, right: 10, left: -14, bottom: 0 }}><defs><linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#81cfa6" stopOpacity={0.25}/><stop offset="95%" stopColor="#81cfa6" stopOpacity={0.01}/></linearGradient></defs><CartesianGrid stroke="#edf0ed" vertical={false} /><XAxis dataKey="period" tickLine={false} axisLine={false} tick={{ fill: '#89948e', fontSize: 10 }} interval="preserveStartEnd" /><YAxis tickLine={false} axisLine={false} tick={{ fill: '#89948e', fontSize: 10 }} tickFormatter={(v) => v >= 100000 ? `₹${(v/100000).toFixed(1)}L` : `₹${Math.round(v/1000)}k`} /><Tooltip formatter={(value) => formatINR(value, 2)} contentStyle={{ borderRadius: 10, border: '1px solid #e8ece8', fontSize: 12 }} /><Area type="monotone" dataKey={module === 'investment' ? 'value' : 'balance'} name={resultLabel} stroke="#3a9970" strokeWidth={2.5} fill="url(#chartFill)" activeDot={{ r: 4, fill: '#318f65', stroke: '#fff', strokeWidth: 2 }} />{module === 'investment' && <Area type="monotone" dataKey="fdValue" name="FD comparison" stroke="#8884c4" strokeWidth={2} fill="transparent" activeDot={{ r: 4, fill: '#8884c4', stroke: '#fff', strokeWidth: 2 }} />}</AreaChart></ResponsiveContainer>}</div>
        <div className="chart-footer"><span><i className="legend-dot" /> {resultLabel}{module === 'investment' && <><i className="legend-dot legend-indigo" /> FD comparison</>}</span><span>{result.formula}</span></div>
      </div>
      {module === 'savings-goal' && <GoalStatus result={result} />}
      {module === 'buy-vs-save' && <PurchaseOptionsTable result={result} />}
      {(module === 'loan' || module === 'credit-card') && <ScheduleTable result={result} card={module === 'credit-card'} />}
      <div className="breakdown-card"><div className="breakdown-heading"><div className="breakdown-icon"><BookOpen size={15} /></div><div><strong>What’s behind this result</strong><span>A transparent look at the assumptions</span></div></div><Breakdown module={module} result={result} inputs={inputs} /></div>
      <div className="result-actions">{replayComparisonId&&<button className="button button-primary" onClick={saveReplayVersion}><RotateCcw size={15}/> Save replay version</button>}<button className="button button-primary" onClick={() => save('A')}><Save size={15} /> Save as baseline</button><button className="button button-outline" onClick={() => save('B')}><Plus size={15} /> Save as variant</button><span className="result-hint">{replayComparisonId?'This creates an immutable version in your replay timeline.':'Then compare both in Decision Replay'}</span></div></>}
      {(!calculated || !result) && <div className="result-placeholder"><div className="placeholder-graphic"><Calculator size={24} /></div><strong>Your results will show here</strong><span>{error || 'Enter valid assumptions and update the simulation.'}</span></div>}
    </section></div>
    <div className="footnote"><CircleHelp size={14} /><span>Simulations are educational examples. FinCoach does not provide personalised financial advice.</span></div>
  </>;
}

function NumberField({ label, value, onChange, prefix, suffix, hint, error, compact }) {
  return <label className={`field ${compact ? 'field-compact' : ''} ${error ? 'field-error' : ''}`}><span className="field-label">{label}</span><span className="input-shell">{prefix && <span className="input-prefix">{prefix}</span>}<input type="number" inputMode="decimal" min="0" step="any" value={value ?? ''} onChange={(event) => onChange(event.target.value)} aria-label={label} aria-invalid={Boolean(error)} />{suffix && <span className="input-suffix">{suffix}</span>}</span>{error ? <span className="field-hint field-error-text">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}</label>;
}
function TextField({ label, value, onChange, maxLength }) {
  return <label className="field"><span className="field-label">{label}</span><input className="auth-input" type="text" value={value ?? ''} onChange={(event) => onChange(event.target.value)} maxLength={maxLength} aria-label={label}/></label>;
}
function DateField({ label, value, onChange, error }) {
  return <label className={`field ${error ? 'field-error' : ''}`}><span className="field-label">{label}</span><input className="auth-input" type="date" value={value ?? ''} onChange={(event) => onChange(event.target.value)} aria-label={label} aria-invalid={Boolean(error)}/>{error && <span className="field-hint field-error-text">{error}</span>}</label>;
}
function GoalStatus({ result }) {
  return <div className={`goal-status ${result.targetReachedByDate ? 'goal-on-track' : 'goal-behind'}`} role="status">
    <strong>{result.targetReachedByDate ? 'On track for the target date' : 'The current plan falls short of the target date'}</strong>
    <span>Projected savings by the target date: {formatINR(result.projectedAtTarget)}.</span>
    <span>{result.estimatedMonths === null ? 'At this contribution, the target is not reached within the 50-year projection.' : result.estimatedMonths === 0 ? 'Your current savings already meet the goal.' : `Estimated time at this contribution: ${result.estimatedMonths} months${result.completionDate ? ` (around ${result.completionDate})` : ''}.`}</span>
  </div>;
}
function PurchaseCostChart({ result }) {
  return <ResponsiveContainer width="100%" height="100%"><BarChart data={result.chart} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}><CartesianGrid stroke="#edf0ed" vertical={false}/><XAxis dataKey="period" tickLine={false} axisLine={false} tick={{ fill: '#89948e', fontSize: 10 }}/><YAxis tickLine={false} axisLine={false} tick={{ fill: '#89948e', fontSize: 10 }} tickFormatter={(value) => `₹${Math.round(value/1000)}k`}/><Tooltip formatter={(value) => formatINR(value, 2)} contentStyle={{ borderRadius: 10, border: '1px solid #e8ece8', fontSize: 12 }}/><Bar dataKey="cost" name="Estimated total cost" fill="#0466c8" radius={[5,5,0,0]}/></BarChart></ResponsiveContainer>;
}
function PurchaseOptionsTable({ result }) {
  const cheapest = Math.min(...result.options.filter((option) => option.totalCost !== null).map((option) => option.totalCost));
  return <div className="purchase-options"><h3>Compare the purchase paths</h3><div className="schedule-scroll"><table><thead><tr><th>Option</th><th>Total cost</th><th>Monthly amount</th><th>Interest</th><th>Time to purchase</th><th>Savings left</th></tr></thead><tbody>{result.options.map((option) => <tr key={option.id}><td>{option.label}</td><td>{option.totalCost === null ? 'Not reached' : formatINR(option.totalCost)}{option.totalCost === cheapest && <small> · lowest</small>}</td><td>{formatINR(option.monthlyPayment)}</td><td>{formatINR(option.totalInterest)}</td><td>{option.monthsToPurchase === null ? 'Not reached' : option.monthsToPurchase === 0 ? 'Now' : `${option.monthsToPurchase} months`}</td><td>{formatINR(option.remainingSavings)}</td></tr>)}</tbody></table></div><p>Financing assumes the full item price is borrowed, fixed monthly payments, and no extra charges beyond the listed processing fees. The save-first option assumes no interest.</p></div>;
}
function BudgetBar({ result }) { return <div className="budget-bars"><div className="budget-income-line"><span>Monthly income</span><strong>{formatINR(result.income)}</strong></div><div className="budget-bar-track">{result.categories.map((item, index) => <span key={item.name} title={`${item.name}: ${formatINR(item.value)}`} style={{ width: `${Math.max(0, Math.min(100, item.value / result.income * 100))}%`, background: ['#5ca982','#8c9ce5','#e9a973','#b39ad6','#77b9c1'][index % 5] }} />)}</div>{result.categories.map((item, index) => <div className="budget-legend-row" key={item.name}><span><i style={{ background: ['#5ca982','#8c9ce5','#e9a973','#b39ad6','#77b9c1'][index % 5] }}/>{item.name}</span><strong>{formatINR(item.value)} <small>{(item.value / result.income * 100).toFixed(0)}%</small></strong></div>)}</div>; }
function ScheduleTable({ result, card }) { return <details className="schedule-details"><summary>View month-by-month {card ? 'repayment' : 'amortization'} schedule <span>{result.schedule.length} payments</span></summary><div className="schedule-scroll"><table><thead><tr><th>Month</th><th>Opening balance</th>{card&&<th>New spending</th>}<th>{card?'Payment':'EMI'}</th><th>Interest</th>{!card&&<><th>Principal</th><th>Extra payment</th></>}<th>Closing balance</th></tr></thead><tbody>{result.schedule.map((row) => <tr key={row.period}><td>{row.period}</td><td>{formatINR(row.openingBalance)}</td>{card&&<td>{formatINR(row.newSpending)}</td>}<td>{formatINR(row.payment)}</td><td>{formatINR(row.interest)}</td>{!card&&<><td>{formatINR(row.principal)}</td><td>{formatINR(row.extraPayment)}</td></>}<td>{formatINR(row.balance)}</td></tr>)}</tbody></table></div></details>; }
function Breakdown({ module, result, inputs }) {
  const rows = module === 'investment' ? [['Starting amount', formatINR(result.principal)], ['Monthly contribution', formatINR(result.monthlyContribution)], ['Total contributed', formatINR(result.totalInvested)], ['Investment rate', `${result.rate}%`], ['FD comparison rate', `${result.fdRate}%`], ['Compounding', `${result.frequency} ${result.frequency === 1 ? 'time' : 'times'} per year`], ['Time horizon', `${result.years} years`], ['Annual contribution increase', `${result.annualIncrease}%`], ['Inflation-adjusted estimate', formatINR(result.inflationAdjustedValue)], ['Difference vs FD', formatINR(result.differenceVsFd)]]
    : module === 'loan' ? [['Loan principal', formatINR(result.principal)], ['Monthly rate', `${(result.annualRate / 12).toFixed(3)}%`], ['Scheduled term', `${result.months} months`], ['Actual payments', `${result.monthsPaid} months`], ['Extra monthly payment', formatINR(result.extraMonthlyPayment)], ['One-time prepayment', formatINR(result.prepayment)], ['Processing fee', formatINR(result.processingFee)], ['Total repayment including fee', formatINR(result.totalPaid)]]
    : module === 'credit-card' ? [['Opening balance', formatINR(result.balance)], ['Assumed APR', `${result.apr}% (APR ÷ 12 monthly)`], ['Base monthly payment', formatINR(result.baseMonthlyPayment)], ['Additional payment', formatINR(result.additionalMonthlyPayment)], ['New monthly spending', formatINR(result.newSpending)], ['Interest at the base payment', result.baselineMonths === null ? 'Does not clear the balance' : formatINR(result.baselineInterest)]]
    : module === 'savings-goal' ? [['Goal', inputs.goalName || 'Savings goal'], ['Target date', inputs.targetDate], ['Current savings', formatINR(result.currentSavings)], ['Monthly contribution', formatINR(result.monthlyContribution)], ['Assumed annual rate', `${result.annualRate}%`]]
    : module === 'buy-vs-save' ? [['Item price', formatINR(result.itemPrice)], ['Available savings', formatINR(result.availableSavings)], ['Monthly savings capacity', formatINR(result.monthlySavings)], ['Credit card APR', `${inputs.cardApr}%`], ['Personal loan rate', `${inputs.loanRate}%`], ['Financing term', `${inputs.months} months`]]
    : [['Monthly income', formatINR(result.income)], ['Allocated total', formatINR(result.allocated)], ['Unallocated amount', formatINR(result.remaining)], ['Savings rate', `${result.savingsRate.toFixed(1)}% of income`]];
  return <><div className="breakdown-rows">{rows.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div><p className="formula-note"><span>Calculation</span>{result.formula}</p></>;
}

function History({ history, search, setSearch, user, openRecord, duplicate, remove, rename }) {
  const [filter, setFilter] = useState('all'); const [sort, setSort] = useState('newest');
  const visible = history.filter((item) => (filter === 'all' || item.type === filter) && (item.title.toLowerCase().includes(search.toLowerCase()) || titleFor(item.type).toLowerCase().includes(search.toLowerCase()))).sort((a,b) => sort === 'name' ? a.title.localeCompare(b.title) : sort === 'oldest' ? new Date(a.createdAt)-new Date(b.createdAt) : new Date(b.createdAt)-new Date(a.createdAt));
  return <>
    <div className="page-title-row"><div><div className="eyebrow">YOUR LEARNING TRAIL</div><h1>My history</h1><p>Revisit, duplicate or compare the scenarios you’ve explored.</p></div><span className="history-count">{visible.length} of {history.length} {history.length === 1 ? 'scenario' : 'scenarios'}</span></div>
    <div className="history-toolbar"><label className="search-box"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search scenarios" aria-label="Search scenarios" /></label><label className="history-select-label">Type<select aria-label="Filter by simulator" value={filter} onChange={(event)=>setFilter(event.target.value)}><option value="all">All simulators</option>{modules.map(({id,label})=><option key={id} value={id}>{label}</option>)}</select></label><label className="history-select-label">Sort<select aria-label="Sort scenarios" value={sort} onChange={(event)=>setSort(event.target.value)}><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="name">Name</option></select></label><span className="local-note"><ShieldCheck size={14} /> {user ? 'Saved to your account' : 'Stored in this browser'}</span></div>
    {visible.length ? <div className="history-list">{visible.map((record) => <ScenarioRow key={record.id} record={record} open={() => openRecord(record)} duplicate={() => duplicate(record)} remove={() => remove(record.id)} rename={(title) => rename(record.id,title)} />)}</div> : <div className="history-empty"><div className="empty-symbol"><Search size={19} /></div><strong>{history.length ? 'No matching scenarios' : 'Nothing here yet'}</strong><span>{history.length ? 'Try a different search or filter.' : 'Your saved simulations will appear here.'}</span></div>}
  </>;
}
function ScenarioRow({ record, open, duplicate, remove, rename, onA, onB, selectedA, selectedB }) {
  const [editing, setEditing] = useState(false); const [draft, setDraft] = useState(record.title);
  const Icon = modules.find((item) => item.id === record.type)?.icon ?? Wallet;
  return <article className="scenario-row"><div className={`scenario-icon ${record.type}`}><Icon size={18} /></div>{editing ? <form className="scenario-rename" onSubmit={(event)=>{event.preventDefault();rename?.(draft);setEditing(false);}}><input aria-label="Scenario title" value={draft} onChange={(event)=>setDraft(event.target.value)} maxLength={120} autoFocus/><button className="icon-button" disabled={!draft.trim()} aria-label="Save scenario title"><Check size={15}/></button><button type="button" className="icon-button" onClick={()=>{setDraft(record.title);setEditing(false);}} aria-label="Cancel rename"><X size={15}/></button></form> : <button className="scenario-main" onClick={open}><strong>{record.title}</strong><span>{titleFor(record.type)} <i>·</i> {new Date(record.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span></button>}<div className="scenario-outcome"><span>{scenarioOutcome(record)[0]}</span><strong>{scenarioOutcome(record)[1]}</strong></div>
    {onA && <div className="compare-picks"><button className={selectedA ? 'pick-selected' : ''} onClick={onA}>{selectedA ? <Check size={12}/> : 'A'}</button><button className={selectedB ? 'pick-selected' : ''} onClick={onB}>{selectedB ? <Check size={12}/> : 'B'}</button></div>}
    {(duplicate || remove || rename) && <div className="scenario-actions">{rename && <button title="Rename scenario" aria-label="Rename scenario" onClick={()=>{setDraft(record.title);setEditing(true);}}><Pencil size={14}/></button>}{duplicate && <button title="Duplicate scenario" aria-label="Duplicate scenario" onClick={duplicate}><Plus size={15} /></button>}{remove && <button title="Delete scenario" aria-label="Delete scenario" onClick={remove}><X size={15} /></button>}</div>}</article>;
}

function Replay({ history, comparisons, a, b, setA, setB, openRecord, remove, saveComparison, openComparison, removeComparison, renameComparison, activeComparisonId, startReplayVersion }) {
  const [pickError, setPickError] = useState('');
  const activeComparison = comparisons.find((record) => record.id === activeComparisonId);
  const choose = (record, slot) => {
    const other = slot === 'A' ? b : a;
    if (other?.id === record.id) { setPickError('Choose two different saved scenarios to see what changed.'); return; }
    if (other && other.type !== record.type) { setPickError('Compare scenarios from the same simulator to see how the changed assumptions affect the outcome.'); return; }
    if (slot === 'A') setA(record); else setB(record); setPickError('');
  };
  const clear = (slot) => { if (slot === 'A') setA(null); else setB(null); };
  const compatible = a && b && a.type === b.type;
  return <>
    <div className="page-title-row replay-title"><div><div className="eyebrow">THE FINCOACH DIFFERENCE</div><h1>What if you chose differently?</h1><p>Compare two versions of a decision and see which assumptions changed the outcome.</p></div><div className="replay-badge"><RotateCcw size={18} /><span>Decision Replay</span></div></div>
    <div className="replay-instructions"><div className="step-chip"><span>1</span><div><strong>Choose a baseline</strong><small>Your starting point</small></div></div><ArrowRight size={15} /><div className="step-chip"><span>2</span><div><strong>Choose a variant</strong><small>A different set of assumptions</small></div></div><ArrowRight size={15} /><div className="step-chip"><span>3</span><div><strong>See what changed</strong><small>Inputs and outcomes side by side</small></div></div></div>
    {comparisons.length>0 && <section className="saved-comparisons"><div className="saved-comparisons-head"><div><span className="panel-kicker">YOUR REPLAY LIBRARY</span><h2>Saved comparisons</h2></div><span className="quiet-count">{comparisons.length} saved</span></div><div className="saved-comparison-list">{comparisons.map((record)=><article key={record.id} className="saved-comparison-row"><button className="saved-comparison-open" onClick={()=>openComparison(record)}><strong>{record.title}</strong><span>{titleFor(record.scenarioA.type)} · {new Date(record.createdAt).toLocaleDateString('en-IN',{dateStyle:'medium'})}</span></button><button className="icon-button" aria-label={`Rename ${record.title}`} title="Rename comparison" onClick={()=>renameComparison(record)}><Pencil size={14}/></button><button className="icon-button" aria-label={`Delete ${record.title}`} title="Delete comparison" onClick={()=>removeComparison(record)}><Trash2 size={14}/></button></article>)}</div></section>}
    {activeComparison && <section className="saved-comparisons replay-timeline" aria-labelledby="replay-timeline-title"><div className="saved-comparisons-head"><div><span className="panel-kicker">VERSION HISTORY</span><h2 id="replay-timeline-title">{activeComparison.title}</h2><p>Each saved replay is a snapshot. Your original baseline stays unchanged.</p></div><button className="button button-primary button-compact" onClick={()=>startReplayVersion(activeComparison, activeComparison.versions.at(-1))}><RotateCcw size={14}/> Replay latest</button></div><ol className="replay-version-list">{activeComparison.versions.map((version,index)=>{const number=version.versionNumber??index+1;const item={...version.scenario,id:`${activeComparison.id}-version-${number}`,title:`${activeComparison.title} · Version ${number}`,createdAt:version.createdAt??activeComparison.createdAt};return <li key={`${activeComparison.id}-${number}`} className="replay-version-item"><div className="replay-version-marker">{number}</div><div className="replay-version-content"><div className="replay-version-heading"><strong>Version {number}</strong><time>{version.createdAt?new Date(version.createdAt).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}):'Saved comparison'}</time></div>{version.notes&&<p className="replay-version-note">{version.notes}</p>}<p className="replay-version-changes">{version.changes?.length?version.changes.map((change)=>`${change.label}: ${String(change.a)} → ${String(change.b)}`).join(' · '):'Matches the baseline inputs'}</p><div className="replay-version-actions"><button className="button button-outline button-compact" onClick={()=>setA(item)}>Use as A</button><button className="button button-outline button-compact" onClick={()=>setB(item)}>Use as B</button><button className="text-link" onClick={()=>startReplayVersion(activeComparison,version)}>Edit assumptions <ArrowRight size={13}/></button></div></div></li>})}</ol></section>}
    {pickError && <div className="error-banner" role="alert"><CircleHelp size={17}/><div><strong>Choose comparable scenarios</strong><span>{pickError}</span></div><button className="icon-button" onClick={() => setPickError('')} aria-label="Dismiss"><X size={15}/></button></div>}
    <section className="replay-picker"><div className="picker-heading"><div><h2>Your saved scenarios</h2><p>Select two from the same simulator below.</p></div><span className="quiet-count">{history.length} saved</span></div>{history.length ? <div className="picker-list">{history.map((record) => <ScenarioRow key={record.id} record={record} open={() => openRecord(record)} onA={() => choose(record, 'A')} onB={() => choose(record, 'B')} selectedA={a?.id === record.id} selectedB={b?.id === record.id} />)}</div> : <div className="history-empty compact-empty"><div className="empty-symbol"><RotateCcw size={18}/></div><strong>Save a scenario to start a replay</strong><span>Run any simulator and save it as a baseline or variant.</span><button className="button button-primary" onClick={() => openRecord({ type:'investment', inputs:{ principal:'20000',years:'5',rate:'8',frequency:'1' }, result:calculate('investment',{principal:'20000',years:'5',rate:'8',frequency:'1'}), title:'Example scenario',createdAt:new Date().toISOString() })}>Open a simulator <ArrowRight size={14}/></button></div>}</section>
    {(a || b) && <section className="compare-board"><div className="compare-heading"><div><span className="panel-kicker">SIDE-BY-SIDE</span><h2>Your two paths</h2></div><div className="compare-heading-actions">{compatible&&<button className="button button-outline button-compact" onClick={()=>saveComparison(a,b)}><Save size={13}/> Save comparison</button>}<button className="text-link" onClick={() => { clear('A'); clear('B'); }}>Clear selection <X size={14}/></button></div></div><div className="compare-cards"><CompareCard slot="A" record={a} empty={!a} clear={() => clear('A')} /><div className="compare-vs">VS</div><CompareCard slot="B" record={b} empty={!b} clear={() => clear('B')} /></div>
      {compatible && <><div className="difference-heading"><div><h3>What changed</h3><p>Differences in the assumptions you selected</p></div><span className="changed-count">{inputDifferences(a.inputs,b.inputs).length} inputs changed</span></div><div className="difference-list">{inputDifferences(a.inputs,b.inputs).length ? inputDifferences(a.inputs,b.inputs).map((item) => <div className="difference-row" key={item.label}><span>{item.label}</span><strong>{String(item.a)} <ArrowRight size={13}/> {String(item.b)}</strong></div>) : <div className="same-state"><Check size={15}/> Both scenarios use the same inputs.</div>}</div><ReplayChart a={a} b={b}/><ReplayOutcomes a={a} b={b}/></>}
      {a && b && !compatible && <div className="error-banner"><CircleHelp size={17}/><div><strong>These scenarios use different simulators</strong><span>Choose two scenarios of the same type to compare their results.</span></div></div>}
    </section>}
    <div className="replay-disclosure"><ShieldCheck size={16}/><span>Replay shows how different assumptions affect a simulation. It does not predict what will happen in real life.</span></div>
  </>;
}
function CompareCard({ slot, record, empty, clear }) {
  const [outcomeLabel, outcomeValue] = scenarioOutcome(record);
  return <div className={`compare-card compare-${slot.toLowerCase()} ${empty ? 'compare-empty' : ''}`}><div className="compare-card-top"><span className={`slot-label slot-${slot.toLowerCase()}`}>SCENARIO {slot}</span>{record && <button className="icon-button" title="Remove selection" onClick={clear}><X size={15}/></button>}</div>{record ? <><strong className="compare-name">{record.title}</strong><span className="compare-type">{titleFor(record.type)} · {new Date(record.createdAt).toLocaleDateString('en-IN',{dateStyle:'medium'})}</span><div className="compare-output"><span>{outcomeLabel}</span><strong>{outcomeValue}</strong></div></> : <div className="compare-empty-content"><div className="empty-symbol">{slot}</div><strong>Select a saved scenario</strong><span>Pick one from the list above.</span></div>}</div>;
}
function inputDifferences(a, b) {
  const flatten = (value, prefix = '') => Object.entries(value ?? {}).flatMap(([key, item]) => item && typeof item === 'object' && !Array.isArray(item) ? flatten(item, `${prefix}${key}.`) : [[`${prefix}${key}`, item]]);
  const left = Object.fromEntries(flatten(a)); const right = Object.fromEntries(flatten(b));
  return [...new Set([...Object.keys(left), ...Object.keys(right)])].filter((key) => String(left[key] ?? '') !== String(right[key] ?? '')).map((key) => ({ label: key.split('.').map((part) => part.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())).join(' · '), a: left[key] ?? '—', b: right[key] ?? '—' }));
}
function ReplayChart({ a, b }) {
  const left = calculate(a.type, a.inputs); const right = calculate(b.type, b.inputs);
  if (a.type === 'budget') {
    const names = [...new Set([...left.categories.map((x) => x.name), ...right.categories.map((x) => x.name)])];
    const data = names.map((name) => ({ name, A: left.categories.find((x) => x.name === name)?.value ?? 0, B: right.categories.find((x) => x.name === name)?.value ?? 0 }));
    return <div className="replay-chart-panel"><div className="replay-chart-heading"><div><strong>Allocation comparison</strong><span>Planned monthly amount by category</span></div><span className="replay-chart-legend"><i className="legend-dot"/> A <i className="legend-dot legend-indigo"/> B</span></div><div className="replay-chart-area"><ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{top:8,right:6,left:-15,bottom:0}}><CartesianGrid stroke="#edf0ed" vertical={false}/><XAxis dataKey="name" tickLine={false} axisLine={false} tick={{fill:'#89948e',fontSize:9}}/><YAxis tickLine={false} axisLine={false} tick={{fill:'#89948e',fontSize:9}}/><Tooltip formatter={(value)=>formatINR(value)} contentStyle={{borderRadius:9,border:'1px solid #e8ece8',fontSize:11}}/><Bar dataKey="A" fill="#62aa7c" radius={[3,3,0,0]}/><Bar dataKey="B" fill="#9290c9" radius={[3,3,0,0]}/></BarChart></ResponsiveContainer></div></div>;
  }
  if (a.type === 'investment') {
    const horizon = Math.max(left.years, right.years);
    const steps = Math.min(60, Math.max(1, Math.ceil(horizon * 2)));
    const valueAt = (result, year) => {
      if (year > result.years + 1e-9) return undefined;
      const months = Math.round(year * 12);
      const monthlyRate = (1 + result.rate / 100 / result.frequency) ** (result.frequency / 12) - 1;
      let balance = result.principal;
      for (let month = 1; month <= months; month += 1) {
        balance *= 1 + monthlyRate;
        balance += result.monthlyContribution * (1 + result.annualIncrease / 100) ** Math.floor((month - 1) / 12);
      }
      return balance;
    };
    const data = Array.from({ length: steps + 1 }, (_, index) => {
      const year = horizon * index / steps;
      return { period: `Year ${Number(year.toFixed(2))}`, A: valueAt(left, year), B: valueAt(right, year) };
    });
    return <div className="replay-chart-panel"><div className="replay-chart-heading"><div><strong>Growth path comparison</strong><span>Compared over the same time horizon</span></div><span className="replay-chart-legend"><i className="legend-dot"/> A <i className="legend-dot legend-indigo"/> B</span></div><div className="replay-chart-area"><ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{top:8,right:8,left:-14,bottom:0}}><CartesianGrid stroke="#edf0ed" vertical={false}/><XAxis dataKey="period" tickLine={false} axisLine={false} tick={{fill:'#89948e',fontSize:9}} interval="preserveStartEnd"/><YAxis tickLine={false} axisLine={false} tick={{fill:'#89948e',fontSize:9}} tickFormatter={(v)=>v>=100000?`₹${(v/100000).toFixed(1)}L`:`₹${Math.round(v/1000)}k`}/><Tooltip formatter={(value)=>formatINR(value,2)} contentStyle={{borderRadius:9,border:'1px solid #e8ece8',fontSize:11}}/><Line dataKey="A" name="Scenario A" connectNulls type="monotone" stroke="#4e9c6e" strokeWidth={2.3} dot={false}/><Line dataKey="B" name="Scenario B" connectNulls type="monotone" stroke="#8785bd" strokeWidth={2.3} dot={false}/></LineChart></ResponsiveContainer></div></div>;
  }
  const key = a.type === 'buy-vs-save' ? 'cost' : a.type === 'investment' ? 'value' : 'balance';
  const leftRows = left.chart ?? left.schedule; const rightRows = right.chart ?? right.schedule;
  const data = Array.from({length:Math.max(leftRows.length,rightRows.length)},(_,index)=>({period:(leftRows[index] ?? rightRows[index])?.period ?? `Step ${index+1}`,A:leftRows[index]?.[key],B:rightRows[index]?.[key]}));
  return <div className="replay-chart-panel"><div className="replay-chart-heading"><div><strong>{a.type === 'investment' ? 'Growth path comparison' : a.type === 'buy-vs-save' ? 'Estimated cost comparison' : a.type === 'savings-goal' ? 'Savings path comparison' : 'Balance path comparison'}</strong><span>How each scenario changes over time</span></div><span className="replay-chart-legend"><i className="legend-dot"/> A <i className="legend-dot legend-indigo"/> B</span></div><div className="replay-chart-area"><ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{top:8,right:8,left:-14,bottom:0}}><CartesianGrid stroke="#edf0ed" vertical={false}/><XAxis dataKey="period" tickLine={false} axisLine={false} tick={{fill:'#89948e',fontSize:9}} interval="preserveStartEnd"/><YAxis tickLine={false} axisLine={false} tick={{fill:'#89948e',fontSize:9}} tickFormatter={(v)=>v>=100000?`₹${(v/100000).toFixed(1)}L`:`₹${Math.round(v/1000)}k`}/><Tooltip formatter={(value)=>formatINR(value,2)} contentStyle={{borderRadius:9,border:'1px solid #e8ece8',fontSize:11}}/><Line dataKey="A" name="Scenario A" connectNulls type="monotone" stroke="#4e9c6e" strokeWidth={2.3} dot={false}/><Line dataKey="B" name="Scenario B" connectNulls type="monotone" stroke="#8785bd" strokeWidth={2.3} dot={false}/></LineChart></ResponsiveContainer></div></div>;
}
function ReplayOutcomes({ a, b }) {
  const key = a.type === 'investment' ? 'finalValue' : a.type === 'loan' || a.type === 'credit-card' ? 'totalInterest' : a.type === 'savings-goal' ? 'projectedAtTarget' : 'remaining';
  const label = a.type === 'investment' ? 'Estimated future value' : a.type === 'loan' ? 'Total interest paid' : a.type === 'credit-card' ? 'Total interest' : a.type === 'savings-goal' ? 'Projected savings at target date' : a.type === 'buy-vs-save' ? 'Lowest estimated purchase cost' : 'Unallocated amount';
  const lowestCost = (record) => Math.min(...record.result.options.filter((option) => option.totalCost !== null).map((option) => option.totalCost));
  const av = a.type === 'buy-vs-save' ? lowestCost(a) : a.result[key]; const bv = b.type === 'buy-vs-save' ? lowestCost(b) : b.result[key]; const diff = bv - av;
  return <div className="outcome-difference"><div><span className="panel-kicker">OUTCOME DIFFERENCE</span><strong>{label}</strong></div><div className="outcome-values"><span>{formatINR(av)} <small>A</small></span><ArrowRight size={15}/><span>{formatINR(bv)} <small>B</small></span></div><div className={`outcome-delta ${diff === 0 ? '' : diff > 0 ? 'delta-up' : 'delta-down'}`}>{diff === 0 ? 'No change' : `${diff > 0 ? '+' : '−'}${formatINR(Math.abs(diff))}`}<span> in Scenario B</span></div><p>This difference comes from the assumptions shown above. It describes this calculation only.</p></div>;
}

function Learn({ completedLessons, quizAttempts, submitQuizAttempt, submitCourseAssessment, completeLesson, chooseModule, readingList, setBookReadingStatus }) {
  const [openCourse, setOpenCourse] = useState(null);
  const [openLesson, setOpenLesson] = useState(null);
  const [openAssessment, setOpenAssessment] = useState(null);
  const [resumeTarget,setResumeTarget]=useState(()=>safeReadKey('fincoach-last-lesson',null));
  const [searchText, setSearchText] = useState('');
  const [level, setLevel] = useState('All levels');
  const [bookSearch, setBookSearch] = useState('');
  const [resourceSearch,setResourceSearch]=useState('');
  const filteredCourses = courses.filter((course) => (level === 'All levels' || course.level === level) && `${course.title} ${course.description} ${course.category}`.toLowerCase().includes(searchText.toLowerCase()));
  const selectedCourse = courses.find((course) => course.id === openCourse);
  const selectedAssessment = courseAssessments.find((assessment) => assessment.id === openAssessment);
  const selectedIndex = selectedCourse?.modules.findIndex((item) => item.id === openLesson) ?? -1;
  const selectedLesson = selectedCourse?.modules[selectedIndex]?.lesson;
  const openCourseLesson=(courseId,lessonId)=>{const target={courseId,lessonId};setResumeTarget(target);localStorage.setItem('fincoach-last-lesson',JSON.stringify(target));setOpenCourse(courseId);setOpenLesson(lessonId);};
  const resumeCourse=()=>{if(resumeTarget)openCourseLesson(resumeTarget.courseId,resumeTarget.lessonId);};
  const resumeCourseInfo=courses.find((course)=>course.id===resumeTarget?.courseId);
  const resumeLessonInfo=resumeCourseInfo?.modules.find((item)=>item.id===resumeTarget?.lessonId)?.lesson;
  const filteredBooks = books.filter((book) => `${book.title} ${book.author} ${book.category}`.toLowerCase().includes(bookSearch.toLowerCase()));
  const filteredResources=resources.filter((resource)=>`${resource.title} ${resource.publisher} ${resource.category}`.toLowerCase().includes(resourceSearch.toLowerCase()));
  const lessons = [
    { n: '01', title: 'Growth and compounding', icon: Landmark, copy: 'Compounding means earning returns on both your original amount and previous returns. A small rate difference can add up over a long horizon.', example: 'FinCoach shows the assumed rate and compounding frequency so you can see how each one changes the estimate.', question:'What does annual compounding do?', options:['Adds returns only to the original amount','Adds returns to the original amount and accumulated returns','Guarantees a positive return'], answer:1 },
    { n: '02', title: 'Borrowing and EMI', icon: Calculator, copy: 'A fixed EMI combines principal repayment and interest. Early payments usually include a larger interest share because the outstanding balance is higher.', example: 'The loan planner includes a month-by-month balance and separates total interest from the amount borrowed.', question:'What usually happens to the interest share as a fixed-rate loan balance falls?', options:['It tends to fall','It stays exactly the same','It becomes a fee'], answer:0 },
    { n: '03', title: 'Card balances and payments', icon: CreditCard, copy: 'When a balance remains, interest can add to what you owe. Paying more than the interest helps reduce the balance over time.', example: 'This learning model assumes APR ÷ 12, interest before payment, no fees and no new spending. Issuer rules vary.', question:'In this simplified model, when is monthly interest added?', options:['After the payment','Before the payment','Only once per year'], answer:1 },
    { n: '04', title: 'A budget is a plan', icon: Wallet, copy: 'A budget gives your income a set of jobs. Comparing planned allocations with income helps reveal money you can assign or categories to adjust.', example: 'FinCoach uses virtual amounts only. It does not connect to a bank account or track actual spending.', question:'What does an over-allocated budget indicate?', options:['Planned spending is greater than income','Savings are guaranteed','The income is invested automatically'], answer:0 },
  ];
  const allCourseLessonIds=new Set(courses.flatMap((course)=>course.modules.map((item)=>item.lesson.id)));
  const completed=completedLessons.filter((id)=>allCourseLessonIds.has(id)).length;
  const totalCourseLessons=allCourseLessonIds.size;
  if (selectedAssessment) return <><div className="page-title-row"><div><div className="eyebrow">COURSE-END ASSESSMENT</div><h1>{selectedAssessment.title}</h1><p>Answer every question, then review your score and the explanation for each answer.</p></div><div className="learn-mark"><BookOpen size={21}/></div></div><CourseAssessment assessment={selectedAssessment} onBack={()=>setOpenAssessment(null)} onSubmit={submitCourseAssessment}/></>;
  if (selectedCourse && !selectedLesson) {
    const assessment=courseAssessments.find((item)=>item.courseId===selectedCourse.id);
    return <><div className="page-title-row"><div><div className="eyebrow">{selectedCourse.category} · {selectedCourse.level}</div><h1>{selectedCourse.title}</h1><p>{selectedCourse.description}</p></div><div className="learn-mark"><BookOpen size={21}/></div></div><section className="course-detail"><button className="text-link" onClick={()=>{setOpenCourse(null);setOpenLesson(null);}}>← All courses</button>{assessment&&<div className="course-assessment-launch"><div><span className="panel-kicker">COURSE-END CHECK</span><strong>{assessment.title}</strong><small>{assessment.questions.length} questions · mixed formats · explanations included</small></div><button className="button button-primary" onClick={()=>setOpenAssessment(assessment.id)}>Start assessment <ArrowRight size={14}/></button></div>}<div className="course-module-list">{selectedCourse.modules.map((item,index)=><button key={item.id} className="course-module-row" onClick={()=>openCourseLesson(selectedCourse.id,item.id)}><span className="course-module-number">{String(index+1).padStart(2,'0')}</span><span><strong>{item.title}</strong><small>{item.lesson.intro}</small></span><span>{completedLessons.includes(item.lesson.id)?'✓ Done':'Read →'}</span></button>)}</div></section></>;
  }
  return <><div className="page-title-row"><div><div className="eyebrow">A LITTLE FINANCIAL CLARITY</div><h1>{selectedLesson ? selectedLesson.title : selectedCourse ? selectedCourse.title : 'Learn the building blocks'}</h1><p>{selectedLesson ? selectedLesson.intro : selectedCourse ? selectedCourse.description : 'Short, practical courses and quick quizzes to help make sense of everyday financial choices.'}</p></div><div className="learn-mark"><BookOpen size={21}/></div></div><div className="learn-progress"><div><span className="panel-kicker">YOUR LEARNING PROGRESS</span><strong>{completed} of {totalCourseLessons} course lessons complete</strong></div><div className="progress-track"><span style={{width:`${completed/totalCourseLessons*100}%`}}/></div></div><div className="learn-intro"><Sparkles size={17}/><p>Try a simulator as you read. Change one assumption at a time and notice how the result moves.</p></div>
  {!selectedCourse&&!selectedLesson&&resumeLessonInfo&&<button className="continue-learning-card" onClick={resumeCourse}><span className="panel-kicker">CONTINUE LEARNING</span><strong>{resumeLessonInfo.title}</strong><small>{resumeCourseInfo.title}</small><ArrowRight size={16}/></button>}
  {selectedLesson ? <CourseLesson lesson={selectedLesson} completed={completedLessons.includes(selectedLesson.id)} attempts={quizAttempts.filter((attempt)=>attempt.lessonId===selectedLesson.id)} onAttempt={(selectedAnswer)=>submitQuizAttempt({lessonId:selectedLesson.id,selectedAnswer,correctIndex:selectedLesson.answer})} onComplete={()=>completeLesson(selectedLesson.id)} onBack={()=>setOpenLesson(null)} onNavigate={(delta)=>openCourseLesson(selectedCourse.id,selectedCourse.modules[selectedIndex+delta]?.id)} canPrevious={selectedIndex>0} canNext={selectedIndex<selectedCourse.modules.length-1} onOpenSimulator={()=>chooseModule(selectedLesson.simulator || 'budget')} /> : selectedCourse ? <section className="course-detail"><button className="text-link" onClick={()=>{setOpenCourse(null);setOpenLesson(null);}}>← All courses</button><div className="course-module-list">{selectedCourse.modules.map((item,index)=><button key={item.id} className="course-module-row" onClick={()=>openCourseLesson(selectedCourse.id,item.id)}><span className="course-module-number">{String(index+1).padStart(2,'0')}</span><span><strong>{item.title}</strong><small>{item.lesson.intro}</small></span><span>{completedLessons.includes(item.lesson.id)?'✓ Done':'Read →'}</span></button>)}</div></section> : <><section className="course-library"><div className="library-toolbar"><label className="search-box"><Search size={15}/><input aria-label="Search courses" value={searchText} onChange={(e)=>setSearchText(e.target.value)} placeholder="Search courses" /></label><select aria-label="Filter course level" value={level} onChange={(e)=>setLevel(e.target.value)}><option>All levels</option><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></div><div className="course-grid">{filteredCourses.map((course)=><button className="course-card" key={course.id} onClick={()=>setOpenCourse(course.id)}><span className="panel-kicker">{course.category} · {course.level}</span><strong>{course.title}</strong><p>{course.description}</p><span className="course-card-bottom">{course.modules.length} lessons · {course.minutes} min <ArrowRight size={14}/></span></button>)}</div>{filteredCourses.length===0&&<div className="empty-state">No courses match that search.</div>}</section><section className="book-library"><div className="section-heading"><div><span className="panel-kicker">KEEP EXPLORING</span><h2>Suggested reading</h2><p>Book recommendations for further learning. Availability and editions vary.</p></div></div><label className="search-box"><Search size={15}/><input aria-label="Search books" value={bookSearch} onChange={(e)=>setBookSearch(e.target.value)} placeholder="Search books or authors" /></label><div className="book-grid">{filteredBooks.map((book)=><article className="book-card" key={book.title}><span className="panel-kicker">{book.category} · {book.level}</span><strong>{book.title}</strong><small>{book.author}</small><p>{book.note}</p><label className="book-status-label">Reading status<select aria-label={`Reading status for ${book.title}`} value={readingList.find((item)=>item.title===book.title)?.status||'Not added'} onChange={(event)=>setBookReadingStatus(book.title,event.target.value)}><option>Not added</option><option>Want to Read</option><option>Reading</option><option>Completed</option></select></label></article>)}</div></section><section className="resource-library"><div className="section-heading"><div><span className="panel-kicker">TRUSTED MATERIAL</span><h2>Articles and official resources</h2><p>External financial education from Indian regulators and public services.</p></div></div><label className="search-box"><Search size={15}/><input aria-label="Search resources" value={resourceSearch} onChange={(e)=>setResourceSearch(e.target.value)} placeholder="Search official resources" /></label><div className="resource-grid">{filteredResources.map((resource)=><article className="resource-card" key={resource.id}><span className="panel-kicker">{resource.category} · {resource.level}</span><strong>{resource.title}</strong><small>{resource.publisher}</small><p>{resource.description}</p><a href={resource.url} target="_blank" rel="noreferrer">Open official resource <ArrowRight size={13}/></a></article>)}</div></section><div className="lesson-grid">{lessons.map((lesson)=><LessonCard key={lesson.n} lesson={lesson} complete={completedLessons.includes(lesson.n)} onComplete={()=>completeLesson(lesson.n)} />)}</div></>}
  <section className="help-faq"><span className="panel-kicker">HELP AND FAQs</span><h2>About these learning tools</h2><details><summary>Are the results financial advice?</summary><p>No. FinCoach uses hypothetical values to explain formulas and trade-offs; it does not recommend a product or predict returns.</p></details><details><summary>Does FinCoach connect to my bank or charge money?</summary><p>No. The simulators use only values you type. There are no bank connections, transactions, or fees.</p></details><details><summary>Where is my practice history stored?</summary><p>Guest scenarios and lesson progress stay in this browser. When signed in, learning progress is saved to your account server.</p></details></section><div className="learn-footer"><ShieldCheck size={16}/><span>Learning content is general education. It is not personalised financial, tax or legal advice.</span></div></>;
}
function CourseAssessment({assessment,onBack,onSubmit}) {
  const [answers,setAnswers]=useState(()=>Array(assessment.questions.length).fill(null));
  const [result,setResult]=useState(null); const [busy,setBusy]=useState(false); const [error,setError]=useState('');
  const submit=async()=>{if(answers.some((answer)=>answer===null)){setError('Choose one answer for every question before submitting.');return;}setError('');setBusy(true);try{const attempt=await onSubmit({assessmentId:assessment.id,answers});if(attempt)setResult(attempt);else setError('Your result could not be saved. Please try again.');}finally{setBusy(false);}};
  const retry=()=>{setAnswers(Array(assessment.questions.length).fill(null));setResult(null);setError('');};
  return <section className="course-assessment"><div className="assessment-toolbar"><button className="text-link" onClick={onBack}>← Course modules</button><span>{assessment.questions.length} questions · one answer each</span></div>{assessment.questions.map((question,index)=><fieldset className="assessment-question" key={question.id}><legend><span className="assessment-number">{String(index+1).padStart(2,'0')}</span><span className="assessment-kind">{question.type.replace('_',' ')} · {question.difficulty}</span><strong>{question.prompt}</strong></legend><div className="course-options">{question.options.map((option,optionIndex)=>{const selected=answers[index]===optionIndex;const correct=result&&optionIndex===question.answer;const wrong=result&&selected&&!correct;return <button type="button" key={option} disabled={Boolean(result)||busy} aria-pressed={selected} className={`${selected?'assessment-selected':''} ${correct?'quiz-correct':''} ${wrong?'quiz-wrong':''}`} onClick={()=>{setAnswers((current)=>current.map((answer,questionIndex)=>questionIndex===index?optionIndex:answer));setError('');}}>{option}</button>;})}</div>{result&&<p className={answers[index]===question.answer?'quiz-feedback-ok':'quiz-feedback'} role="status">{answers[index]===question.answer?'Correct. ':'Review. '}{question.explanation}</p>}</fieldset>)}{error&&<div className="error-banner" role="alert">{error}</div>}{result?<div className="assessment-result"><strong>Score: {result.score}/{result.total} · {result.percentage}%</strong><span>{result.score===result.total?'Excellent work — all answers are correct.':result.score>=Math.ceil(result.total*0.7)?'Good understanding. Review any missed explanations.':'Review the lessons and try again when ready.'}</span><div className="assessment-result-actions"><button className="button button-primary" onClick={retry}>Try again <RotateCcw size={14}/></button><button className="button button-outline" onClick={onBack}>Back to course</button></div></div>:<div className="assessment-submit"><button className="button button-primary" onClick={submit} disabled={busy}>{busy?'Saving result…':'Submit assessment'} <ArrowRight size={14}/></button></div>}</section>;
}

function CourseLesson({lesson,completed,attempts,onAttempt,onComplete,onBack,onNavigate,canPrevious,canNext,onOpenSimulator}) {
  const [choice,setChoice]=useState(null); const [submitting,setSubmitting]=useState(false);
  const answer=async(index)=>{setChoice(index);setSubmitting(true);try{const record=await onAttempt(index);if(record?.isCorrect)onComplete();}finally{setSubmitting(false);}};
  const latest=attempts?.[0];
  return <section className="course-lesson"><button className="text-link" onClick={onBack}>← Course modules</button><div className="lesson-reading"><span className="panel-kicker">LESSON · {completed?'COMPLETED':'IN PROGRESS'}</span><p>{lesson.intro}</p><div className="lesson-objectives"><strong>Learning objectives</strong><ul>{lesson.objectives.map((objective)=><li key={objective}>{objective}</li>)}</ul></div><p>{lesson.explanation}</p><h3>Example</h3><p>{lesson.example}</p><h3>Key ideas and terms</h3><ul>{lesson.keyTerms.map((term)=><li key={term}>{term}</li>)}</ul><div className="lesson-callout"><strong>Common mistake</strong><p>{lesson.commonMistake}</p><strong>Takeaway</strong><p>{lesson.takeaway}</p><strong>Try it</strong><p>{lesson.activity}</p></div><strong className="course-question">Knowledge check: {lesson.question}</strong><div className="course-options">{lesson.options.map((option,index)=><button key={option} disabled={submitting||completed} className={choice===index?index===lesson.answer?'quiz-correct':'quiz-wrong':''} onClick={()=>answer(index)}>{option}</button>)}</div>{choice!==null&&<p className={choice===lesson.answer?'quiz-feedback-ok':'quiz-feedback'} role="status">{choice===lesson.answer?`Correct. ${lesson.why}`:'Not quite. Review the explanation and try again.'}</p>}{latest&&<p className="lesson-attempt-summary">Your last saved attempt: {latest.score}/{latest.total} · {new Date(latest.createdAt).toLocaleString()}</p>}<div className="lesson-navigation"><button className="button button-outline" disabled={!canPrevious} onClick={()=>onNavigate(-1)}>← Previous lesson</button><button className="button button-outline" onClick={onOpenSimulator}>Related simulator <ArrowRight size={14}/></button><button className="button button-outline" disabled={!canNext} onClick={()=>onNavigate(1)}>Next lesson →</button></div></div></section>;
}
function CourseProgress({completedLessons,quizAttempts,readingList,history,user,setSection}) {
  const lessonIds=new Set(courses.flatMap((course)=>course.modules.map((item)=>item.lesson.id)));
  const completedCourseLessons=completedLessons.filter((id)=>lessonIds.has(id)).length;
  const totalLessons=lessonIds.size;
  const correct=quizAttempts.reduce((sum,attempt)=>sum+(attempt.score||0),0);
  const attempted=quizAttempts.length;
  const totalQuestions=quizAttempts.reduce((sum,attempt)=>sum+(attempt.total||1),0);
  const average=totalQuestions?Math.round(correct/totalQuestions*100):0;
  const badges=[{label:'First lesson',earned:completedCourseLessons>=1,detail:'Complete one learning lesson'},{label:'Curious learner',earned:completedCourseLessons>=5,detail:'Complete five learning lessons'},{label:'Quiz practice',earned:attempted>=3,detail:'Save three quiz attempts'},{label:'Scenario explorer',earned:history.length>=3,detail:'Save three scenarios'}];
  return <><div className="page-title-row"><div><div className="eyebrow">YOUR LEARNING ACTIVITY</div><h1>My progress</h1><p>{user?'Progress and quiz history saved to your account.':'Progress and quiz history saved in this browser.'}</p></div></div><div className="progress-summary-grid"><article><span>Lessons complete</span><strong>{completedCourseLessons}/{totalLessons}</strong></article><article><span>Quiz attempts</span><strong>{attempted}</strong></article><article><span>Correct answers</span><strong>{attempted?`${correct}/${totalQuestions}`:'—'}</strong></article><article><span>Average score</span><strong>{attempted?`${average}%`:'—'}</strong></article></div><section className="progress-courses"><h2>Course progress</h2>{courses.map((course)=>{const done=course.modules.filter((item)=>completedLessons.includes(item.lesson.id)).length;return <article className="progress-course-row" key={course.id}><div><strong>{course.title}</strong><span>{done} of {course.modules.length} lessons · {Math.round(done/course.modules.length*100)}%</span></div><div className="progress-track"><span style={{width:`${done/course.modules.length*100}%`}}/></div></article>;})}</section><section className="progress-courses"><h2>Achievements</h2><div className="achievement-grid">{badges.map((badge)=><article className={badge.earned?'achievement-earned':'achievement-locked'} key={badge.label}><strong>{badge.earned?'✓':'○'} {badge.label}</strong><span>{badge.detail}</span></article>)}</div></section><section className="progress-courses"><h2>Recent quiz attempts</h2>{quizAttempts.length?<div className="attempt-list">{quizAttempts.slice(0,12).map((attempt)=><article className="attempt-row" key={attempt.attemptId}><span><strong>{attempt.title||courses.flatMap((course)=>course.modules).find((item)=>item.lesson.id===attempt.lessonId)?.lesson.title||attempt.lessonId}</strong><small>{new Date(attempt.createdAt).toLocaleString()}</small></span><b>{attempt.score}/{attempt.total} · {attempt.percentage??Math.round(attempt.score/attempt.total*100)}% · {attempt.isCorrect?'Complete':'Review'}</b></article>)}</div>:<div className="history-empty"><strong>No quiz attempts yet</strong><span>Study a course and try a knowledge check to see results here.</span><button className="text-link" onClick={()=>setSection('learn')}>Browse courses →</button></div>}</section><section className="progress-courses"><h2>Reading list</h2>{readingList.length?<div className="attempt-list">{readingList.map((item)=><article className="attempt-row" key={item.title}><span><strong>{item.title}</strong><small>{books.find((book)=>book.title===item.title)?.author}</small></span><b>{item.status}</b></article>)}</div>:<div className="history-empty"><strong>No books saved yet</strong><span>Add a book to your reading list from the Learn page.</span><button className="text-link" onClick={()=>setSection('learn')}>Explore books →</button></div>}</section></>;
}
function LessonCard({ lesson, complete, onComplete }) {
  const [choice, setChoice] = useState(null); const {n,title,icon:Icon,copy,example,question,options,answer}=lesson;
  return <article className="lesson-card"><div className="lesson-top"><span>{complete?'COMPLETE':`${n} / 04`}</span><div><Icon size={18}/></div></div><h2>{title}</h2><p>{copy}</p><div className="lesson-example"><span>IN FINCOACH</span><p>{example}</p></div><div className="lesson-quiz"><strong>{question}</strong>{options.map((option,index)=><button key={option} disabled={complete} className={choice===index?index===answer?'quiz-correct':'quiz-wrong':''} onClick={()=>{setChoice(index);if(index===answer)onComplete();}}>{option}</button>)}{choice!==null&&<span className={choice===answer?'quiz-feedback-ok':'quiz-feedback'} role="status">{choice===answer?'Correct — lesson complete.':'Not quite. Try another answer.'}</span>}</div></article>;
}

export default App;
