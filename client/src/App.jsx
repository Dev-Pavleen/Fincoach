import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Activity, ArrowDownRight, ArrowRight, ArrowUpRight, BadgeIndianRupee, BookOpen, Calculator, Check, ChevronDown, CircleHelp, Clock3, CreditCard, Download, Eye, EyeOff, Home, Landmark, Menu, Pencil, Plus, RotateCcw, Save, Search, Settings2, ShieldCheck, ShoppingBag, Sparkles, Target, Trash2, Wallet, X } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { alignReplayRows, calculate, investmentValueAt } from '../../shared/calculations.js';
import { courseAssessments } from '../../shared/courseAssessments.js';
import { books, courses } from './learningContent.js';
import { formatINR } from './format.js';
import { modules, supportedModuleIds, titleFor, simulatorPath } from './simulatorCatalog.js';
import { Simulator } from './features/simulators/SimulatorPage.jsx';
import { Learn } from './features/learning/LearningCenter.jsx';
import { migrateGuestQuizAttempts } from './progressSync.js';
import { getAttemptReview } from './quizReview.js';
import './quizReview.css';
import './dashboard.css';

const initialInputs = {
  investment: { principal: '20000', years: '5', rate: '8', fdRate: '6.5', frequency: '1', monthlyContribution: '0', annualIncrease: '0', inflation: '0' },
  loan: { principal: '500000', rate: '9', months: '60', extraMonthlyPayment: '0', prepayment: '0', processingFee: '0' },
  'credit-card': { balance: '50000', apr: '36', payment: '5000', additionalMonthlyPayment: '0', minimumPaymentRate: '5', minimumPaymentFloor: '100', newSpending: '0' },
  budget: { income: '45000', categories: { Needs: '20000', Wants: '7000', Savings: '8000', Investments: '6000', 'Emergency fund': '4000' } },
  'savings-goal': { goalName: 'Emergency fund', target: '100000', currentSavings: '20000', monthlyContribution: '5000', annualRate: '4', targetDate: (() => { const date = new Date(); date.setFullYear(date.getFullYear() + 1); return date.toISOString().slice(0, 10); })() },
  'buy-vs-save': { itemPrice: '60000', availableSavings: '10000', monthlySavings: '10000', cardApr: '36', loanRate: '14', months: '12', cardFee: '499', loanFee: '1000' },
};
const courseLessonIds = new Set(courses.flatMap((course) => course.modules.map((item) => item.lesson.id)));
const sectionPaths = { dashboard: '/workspace', replay: '/replay', history: '/history', learn: '/learn', progress: '/progress', settings: '/settings' };
const decodePathPart = (part) => { try { return decodeURIComponent(part); } catch { return ''; } };
function routeFromPath(pathname) {
  const parts = pathname.split('/').filter(Boolean).map(decodePathPart);
  if (!parts.length) return { section: 'dashboard', module: 'investment', learningTarget: null };
  if (parts[0] === 'simulators') return { section: 'simulator', module: supportedModuleIds.has(parts[1]) ? parts[1] : 'investment', learningTarget: null };
  if (parts[0] === 'workspace') return { section: 'dashboard', module: null, learningTarget: null };
  if (parts[0] === 'learn') {
    const course = courses.find((item) => item.id === parts[1]);
    const lesson = course?.modules.find((item) => item.id === parts[2]);
    return { section: 'learn', module: null, learningTarget: course ? { courseId: course.id, ...(lesson ? { lessonId: lesson.id } : {}) } : null };
  }
  const section = Object.keys(sectionPaths).find((key) => sectionPaths[key] === `/${parts[0]}`);
  return section ? { section, module: null, learningTarget: null } : { section: 'dashboard', module: 'investment', learningTarget: null };
}
const coursePath = (courseId) => `/learn/${encodeURIComponent(courseId)}`;
const lessonPath = (courseId, lessonId) => `${coursePath(courseId)}/${encodeURIComponent(lessonId)}`;
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isSnapshot = (value) => isRecord(value) && supportedModuleIds.has(value.type) && isRecord(value.inputs);
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
const safeReadArray = (key) => {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value : [];
  } catch { return []; }
};
const safeReadKey = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; } };
const setSessionMarker = (active) => { try { if (active) localStorage.setItem('fincoach-session-active', JSON.stringify(true)); else localStorage.removeItem('fincoach-session-active'); } catch { /* Authentication remains server-owned if browser storage is unavailable. */ } };
const safeRead = () => safeReadArray('fincoach-scenarios').filter((item) =>
  isRecord(item) && typeof item.id === 'string' && isSnapshot(item) && isRecord(item.result ?? item.results));
const safeReadComparisons = () => safeReadArray('fincoach-comparisons')
  .filter((item) => isRecord(item) && typeof item.id === 'string' && isSnapshot(item.scenarioA) && isSnapshot(item.scenarioB) && item.scenarioA.type === item.scenarioB.type)
  .map((item) => ({ ...item, versions: Array.isArray(item.versions) ? item.versions.filter((version) => isRecord(version) && isSnapshot(version.scenario) && version.scenario.type === item.scenarioA.type) : [] }));
const safeReadLessons = () => safeReadArray('fincoach-lessons').filter((id) => typeof id === 'string' && courseLessonIds.has(id));
const safeReadAttempts = (key = 'fincoach-quiz-attempts') => safeReadArray(key).filter((attempt) =>
  isRecord(attempt) && typeof attempt.attemptId === 'string' && Number.isFinite(attempt.score) && Number.isFinite(attempt.total) && attempt.total > 0);
const safeReadReadingList = () => safeReadArray('fincoach-reading-list').filter((item) =>
  isRecord(item) && typeof item.title === 'string' && ['Want to Read', 'Reading', 'Completed'].includes(item.status));
const safeReadLastLesson = () => {
  const target = safeReadKey('fincoach-last-lesson', null);
  if (!isRecord(target)) return null;
  const course = courses.find((item) => item.id === target.courseId);
  return course?.modules.some((item) => item.id === target.lessonId) ? { courseId: target.courseId, lessonId: target.lessonId } : null;
};
const safeReadTheme = () => {
  const value = safeReadKey('fincoach-theme', 'light');
  return ['light', 'dark', 'system'].includes(value) ? value : 'light';
};
const newestAttempts = (items) => [...items].sort((left, right) => {
  const leftTime = Date.parse(left?.createdAt ?? '');
  const rightTime = Date.parse(right?.createdAt ?? '');
  return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
});

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
  const location = useLocation();
  const navigate = useNavigate();
  const initialRoute = routeFromPath(location.pathname);
  const [section, setSection] = useState(initialRoute.section);
  const [module, setModule] = useState(initialRoute.module ?? 'investment');
  const [inputs, setInputs] = useState(initialInputs);
  const [history, setHistory] = useState(safeRead);
  const [comparisons, setComparisons] = useState(safeReadComparisons);
  const [completedLessons, setCompletedLessons] = useState(safeReadLessons);
  const [quizAttempts, setQuizAttempts] = useState(safeReadAttempts);
  const [readingList, setReadingList] = useState(safeReadReadingList);
  const [theme, setTheme] = useState(safeReadTheme);
  const [active, setActive] = useState(null);
  const [scenarioA, setScenarioA] = useState(null);
  const [scenarioB, setScenarioB] = useState(null);
  const [replayComparisonId, setReplayComparisonId] = useState(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [calculated, setCalculated] = useState(true);
  const [calculationBusy, setCalculationBusy] = useState(false);
  const [calculationFeedback, setCalculationFeedback] = useState('');
  const [serverCalculation, setServerCalculation] = useState(null);
  const [learningTarget, setLearningTarget] = useState(initialRoute.learningTarget);
  const [formErrors, setFormErrors] = useState({});
  const [user, setUser] = useState(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const inputFingerprint = JSON.stringify(inputs[module]);
  const localResult = useMemo(() => { try { return calculate(module, inputs[module]); } catch { return null; } }, [module, inputs]);
  const result = serverCalculation?.module === module && serverCalculation.inputFingerprint === inputFingerprint ? serverCalculation.result : localResult;

  useEffect(() => {
    const route = routeFromPath(location.pathname);
    setSection(route.section);
    if (route.module) setModule(route.module);
    setLearningTarget(route.learningTarget);
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => { if (!user) localStorage.setItem('fincoach-scenarios', JSON.stringify(history)); }, [history, user]);
  useEffect(() => { if (!user) localStorage.setItem('fincoach-comparisons', JSON.stringify(comparisons)); }, [comparisons, user]);
  useEffect(() => { if (!user) localStorage.setItem('fincoach-lessons', JSON.stringify(completedLessons)); }, [completedLessons, user]);
  useEffect(() => { if (!user) localStorage.setItem('fincoach-quiz-attempts', JSON.stringify(quizAttempts)); }, [quizAttempts, user]);
  useEffect(() => { if (!user) localStorage.setItem('fincoach-reading-list', JSON.stringify(readingList)); }, [readingList, user]);
  useEffect(() => { localStorage.setItem('fincoach-theme', JSON.stringify(theme)); document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => { if (!toast) return undefined; const timer = setTimeout(() => setToast(''), 2600); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => {
    if (!accountOpen) return undefined;
    const dialog = document.querySelector('.account-dialog');
    const previousFocus = document.activeElement;
    const focusable = () => [...(dialog?.querySelectorAll('button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])') ?? [])].filter((element) => element.getAttribute('aria-hidden') !== 'true');
    focusable()[0]?.focus();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); setAccountOpen(false); setAuthError(''); return; }
      if (event.key !== 'Tab') return;
      const elements = focusable();
      if (!elements.length) { event.preventDefault(); return; }
      const first = elements[0]; const last = elements.at(-1);
      if (event.shiftKey && (document.activeElement === first || !dialog?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialog?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [accountOpen, authMode]);
  useEffect(() => {
    let mounted = true;
    const restoreAccount = async () => {
      try {
        const accountResponse = await fetch('/api/auth/me', { credentials: 'include' });
        if (!accountResponse.ok) {
          if (accountResponse.status === 401 && safeReadKey('fincoach-session-active', false)) {
            setSessionMarker(false);
            setToast('Your session has expired. Sign in again to sync your account.');
          }
          return;
        }
        const account = await accountResponse.json();
        if (!account?.user || !mounted) return;
        setSessionMarker(true);
        setUser(account.user);
        const [simResponse, compareResponse, progressResponse] = await Promise.all([
          fetch('/api/simulations', { credentials: 'include' }),
          fetch('/api/comparisons', { credentials: 'include' }),
          fetch('/api/learning/progress', { credentials: 'include' }),
        ]);
        if (!mounted) return;
        if (simResponse.ok) { const body = await simResponse.json(); setHistory(body.simulations.map(normalizeRemote)); }
        if (compareResponse.ok) { const body = await compareResponse.json(); setComparisons(body.comparisons.map(normalizeComparison)); }
        if (progressResponse.ok) { const body = await progressResponse.json(); setCompletedLessons(Array.isArray(body.progress.completedLessons) ? body.progress.completedLessons.filter((id) => courseLessonIds.has(id)) : []); setQuizAttempts(newestAttempts([...(Array.isArray(body.progress.quizAttempts) ? body.progress.quizAttempts : []), ...safeReadAttempts('fincoach-pending-quiz-attempts')])); setReadingList(Array.isArray(body.progress.readingList) ? body.progress.readingList : []); }
      } catch { /* A guest can keep using the local learning experience while offline. */ }
    };
    restoreAccount();
    return () => { mounted = false; };
  }, []);

  const update = (key, value) => {
    setInputs((current) => ({ ...current, [module]: { ...current[module], [key]: value } }));
    setFormErrors((current) => ({ ...current, [key]: '' })); setError(''); setCalculated(true); setCalculationFeedback('');
  };
  const updateCategory = (key, value) => {
    setInputs((current) => ({ ...current, budget: { ...current.budget, categories: { ...current.budget.categories, [key]: value } } }));
    setFormErrors((current) => ({ ...current, [`category:${key}`]: '' })); setError(''); setCalculated(true); setCalculationFeedback('');
  };
  const removeCategory = (key) => {
    setInputs((current) => { const categories = { ...current.budget.categories }; delete categories[key]; return { ...current, budget: { ...current.budget, categories } }; });
    setError(''); setCalculated(true);
  };
  const runSimulation = () => {
    try { calculate(module, inputs[module]); setFormErrors({}); setError(''); setCalculated(true); return true; }
    catch (caught) { setFormErrors({ [caught.field]: caught.message }); setError(caught.message); setCalculated(false); return false; }
  };
  const updateSimulation = async () => {
    if (!runSimulation()) return;
    const inputSnapshot = structuredClone(inputs[module]);
    const fingerprint = JSON.stringify(inputSnapshot);
    setCalculationBusy(true); setCalculationFeedback('Recalculating with the FinCoach API…');
    try {
      const response = await fetch(`/api/simulations/${module}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(inputSnapshot) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.results) throw new Error(body.error || 'The calculation service is unavailable.');
      setServerCalculation({ module, inputFingerprint: fingerprint, result: body.results });
      setCalculationFeedback('Updated and checked by the FinCoach calculation service.');
    } catch {
      setServerCalculation({ module, inputFingerprint: fingerprint, result: calculate(module, inputSnapshot) });
      setCalculationFeedback('Updated locally. The calculation service could not be reached.');
    } finally { setCalculationBusy(false); }
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
  const openRecord = (record) => { const normalized = normalizeRemote(record); setModule(normalized.type); setInputs((current) => ({ ...current, [normalized.type]: structuredClone(normalized.inputs) })); setSection('simulator'); navigate(simulatorPath(normalized.type)); setActive(normalized); setCalculated(true); setError(''); setCalculationFeedback(''); };
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
  const openComparison = (source) => { const record=normalizeComparison(source); const timestamp=record.createdAt??new Date().toISOString(); const latest=record.versions.at(-1); setScenarioA({...record.scenarioA,title:`${record.title} · Baseline`,createdAt:timestamp}); setScenarioB({...latest.scenario,title:`${record.title} · Version ${latest.versionNumber}`,createdAt:latest.createdAt??timestamp}); setReplayComparisonId(record.id); setSection('replay'); navigate('/replay'); };
  const startReplayVersion = (source, version) => { const record=normalizeComparison(source); const selected=version??record.versions.at(-1); if(!selected?.scenario)return; setScenarioA({...record.scenarioA,title:`${record.title} · Baseline`,createdAt:record.createdAt}); setScenarioB({...selected.scenario,title:`${record.title} · Version ${selected.versionNumber}`,createdAt:selected.createdAt}); setReplayComparisonId(record.id); setModule(selected.scenario.type); setInputs((current)=>({...current,[selected.scenario.type]:structuredClone(selected.scenario.inputs)})); setActive({type:selected.scenario.type,inputs:structuredClone(selected.scenario.inputs),title:`${record.title} replay`}); setCalculated(true); setError(''); setCalculationFeedback(''); setSection('simulator'); navigate(simulatorPath(selected.scenario.type)); };
  const saveReplayVersion = async () => {
    if(!replayComparisonId||!runSimulation())return;
    if(module==='budget'&&calculate(module,inputs[module]).overAllocated){setToast('Adjust allocations so they fit your income before saving.');return;}
    const current=comparisons.find((item)=>item.id===replayComparisonId); if(!current){setToast('This replay was not found in your saved history.');return;}
    const notes=window.prompt('Add an optional note about this replay:',''); if(notes===null)return;
    let updated;
    if(user){try{const response=await fetch(`/api/comparisons/${replayComparisonId}/versions`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({inputs:inputs[module],notes})});const body=await response.json();if(!response.ok)throw new Error(body.error||'Could not save this replay version.');updated=normalizeComparison(body.comparison);}catch(caught){setToast(caught.message);return;}}
    else {const scenario={type:module,inputs:structuredClone(inputs[module]),results:calculate(module,inputs[module])};const version={scenario,changes:inputDifferences(current.scenarioA.inputs,scenario.inputs),notes:notes.trim(),createdAt:new Date().toISOString(),versionNumber:current.versions.length+1};updated={...current,versions:[...current.versions,version]};}
    setComparisons((list)=>list.map((item)=>item.id===updated.id?updated:item));
    const latest=updated.versions.at(-1);setScenarioA({...updated.scenarioA,title:`${updated.title} · Baseline`});setScenarioB({...latest.scenario,title:`${updated.title} · Version ${latest.versionNumber}`,createdAt:latest.createdAt});setSection('replay');navigate('/replay');setToast(`Replay version ${latest.versionNumber} saved`);
  };
  const removeComparison = async (record) => { if (!window.confirm(`Delete “${record.title}”? This saved comparison cannot be recovered.`)) return; if (user && /^[a-f\d]{24}$/i.test(record.id)) { try { const response = await fetch(`/api/comparisons/${record.id}`, { method: 'DELETE', credentials: 'include' }); if (!response.ok) throw new Error('Could not delete this comparison.'); } catch (caught) { setToast(caught.message); return; } } setComparisons((current) => current.filter((item) => item.id !== record.id)); setToast('Comparison deleted'); };
  const renameComparison = async (record) => { const title = window.prompt('Rename comparison', record.title); if (!title?.trim() || title.trim() === record.title) return; if (user && /^[a-f\d]{24}$/i.test(record.id)) { try { const response = await fetch(`/api/comparisons/${record.id}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: title.trim() }) }); if (!response.ok) throw new Error('Could not rename this comparison.'); } catch (caught) { setToast(caught.message); return; } } setComparisons((current) => current.map((item) => item.id === record.id ? { ...item, title: title.trim() } : item)); };
  const removeRecord = async (id) => { if (user && /^[a-f\d]{24}$/i.test(id)) { try { const response = await fetch(`/api/simulations/${id}`, { method: 'DELETE', credentials: 'include' }); if (!response.ok) throw new Error('Could not delete this saved scenario.'); } catch (caught) { setToast(caught.message); return; } } setHistory((current) => current.filter((item) => item.id !== id)); if (scenarioA?.id === id) setScenarioA(null); if (scenarioB?.id === id) setScenarioB(null); };
  const duplicateRecord = async (record) => { let copy = { ...record, id: crypto.randomUUID(), title: `${record.title} copy`, createdAt: new Date().toISOString() }; if (user) { try { const response = await fetch('/api/simulations', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: record.type, title: copy.title, inputs: record.inputs }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Could not duplicate this scenario.'); copy = normalizeRemote(body.simulation); } catch (caught) { setToast(caught.message); return; } } setHistory((current) => [copy, ...current]); setToast('Scenario duplicated'); };
  const renameRecord = async (id, title) => { if (!title.trim()) return; if (user && /^[a-f\d]{24}$/i.test(id)) { try { const response = await fetch(`/api/simulations/${id}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: title.trim() }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Could not rename this scenario.'); } catch (caught) { setToast(caught.message); return; } } setHistory((current) => current.map((item) => item.id === id ? { ...item, title: title.trim() } : item)); setToast('Scenario renamed'); };
  const chooseSection = (next) => { setSection(next); setMobileOpen(false); setError(''); setLearningTarget(null); navigate(next === 'simulator' ? simulatorPath(module) : sectionPaths[next] ?? '/'); };
  const navigateToCourse = (courseId) => { setSection('learn'); setMobileOpen(false); setError(''); setLearningTarget({ courseId }); navigate(coursePath(courseId)); };
  const navigateToLesson = (courseId, lessonId) => { setSection('learn'); setMobileOpen(false); setError(''); setLearningTarget({ courseId, lessonId }); navigate(lessonPath(courseId, lessonId)); };
  const chooseModule = (id) => { setModule(id); setFormErrors({}); setActive(null); setError(''); setCalculated(true); setCalculationFeedback(''); setSection('simulator'); setMobileOpen(false); setLearningTarget(null); navigate(simulatorPath(id)); };
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
      setSessionMarker(true);
      if (authMode === 'register' && quizAttempts.length) {
        const pending = safeReadAttempts('fincoach-pending-quiz-attempts');
        localStorage.setItem('fincoach-pending-quiz-attempts', JSON.stringify([...new Map([...pending, ...quizAttempts].map((item) => [item.attemptId, item])).values()]));
      }
      setUser(body.user);
      const refreshResults = await Promise.allSettled([fetch('/api/simulations', { credentials: 'include' }), fetch('/api/comparisons', { credentials: 'include' }), fetch('/api/learning/progress', { credentials: 'include' })]);
      const [listResult, compareResult, progressResult] = refreshResults;
      const list = listResult.status === 'fulfilled' ? listResult.value : null;
      const compareList = compareResult.status === 'fulfilled' ? compareResult.value : null;
      const progressResponse = progressResult.status === 'fulfilled' ? progressResult.value : null;
      let accountDataNeedsRefresh = refreshResults.some((item) => item.status === 'rejected');
      if (list?.ok) { const saved = await list.json(); setHistory(saved.simulations.map(normalizeRemote)); } else accountDataNeedsRefresh = true;
      if (compareList?.ok) { const saved = await compareList.json(); setComparisons(saved.comparisons.map(normalizeComparison)); } else accountDataNeedsRefresh = true;
      if (progressResponse?.ok) {
        const saved = await progressResponse.json();
        const accountLessons = saved.progress.completedLessons || [];
        const merged = authMode === 'register' ? [...new Set([...accountLessons, ...completedLessons])] : accountLessons;
        setCompletedLessons(merged);
        const accountAttempts = saved.progress.quizAttempts || [];
        const pendingAttempts = safeReadAttempts('fincoach-pending-quiz-attempts');
        const localAttempts = authMode === 'register' ? [...quizAttempts, ...pendingAttempts] : pendingAttempts;
        const accountReading = saved.progress.readingList || [];
        const localReading = authMode === 'register' ? readingList : [];
        if (authMode === 'register' && merged.length !== accountLessons.length) {
          await fetch('/api/learning/progress', { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completedLessons: merged }) });
        }
        if (localAttempts.length) {
          const { migrated, failed } = await migrateGuestQuizAttempts(localAttempts);
          localStorage.setItem('fincoach-pending-quiz-attempts', JSON.stringify(failed));
          const mergedAttempts = newestAttempts([...migrated, ...failed, ...accountAttempts]);
          setQuizAttempts([...new Map(mergedAttempts.map((item) => [item.attemptId, item])).values()]);
          if (failed.length) setToast('Some quiz attempts are waiting to sync; they remain saved in this browser.');
        } else setQuizAttempts(newestAttempts(accountAttempts));
        if (authMode === 'register') {
          const mergedReading = [...accountReading];
          for (const item of localReading) { const index=mergedReading.findIndex((entry)=>entry.title===item.title); if(index<0)mergedReading.push(item); else mergedReading[index]=item; }
          setReadingList(mergedReading);
          if (mergedReading.length) await fetch('/api/learning/reading-list',{method:'PUT',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:mergedReading})});
        } else setReadingList(accountReading);
      } else {
        accountDataNeedsRefresh = true;
        setQuizAttempts(newestAttempts([...quizAttempts, ...safeReadAttempts('fincoach-pending-quiz-attempts')]));
      }
      setAccountOpen(false);
      setToast(accountDataNeedsRefresh ? 'Signed in; some account data could not refresh yet.' : authMode === 'register' ? 'Your learning account is ready' : `Welcome back, ${body.user.name}`);
    } catch (caught) {
      if (caught instanceof TypeError) {
        setAuthError('We couldn’t connect just now. Check your internet connection and try again.');
      } else setAuthError(caught.message);
    } finally { setAuthBusy(false); }
  };
  const saveProfile = async (profile) => { try { const response = await fetch('/api/auth/profile', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profile) }); const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Could not update your profile.'); setUser(body.user); setToast('Profile updated'); return true; } catch (caught) { setToast(caught.message); return false; } };
  const changePassword = async (passwords) => { try { const response = await fetch('/api/auth/password', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(passwords) }); const body = await response.json(); if (!response.ok) throw new Error(body.details?.newPassword?.[0] || body.error || 'Could not update your password.'); setToast('Password updated'); return true; } catch (caught) { setToast(caught.message); return false; } };
  const deleteAccount = async (currentPassword) => { try { const response = await fetch('/api/auth/account', { method: 'DELETE', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword }) }); if (!response.ok) { const body = await response.json(); throw new Error(body.error || 'Could not delete this account.'); } setSessionMarker(false); setUser(null); setHistory(safeRead()); setComparisons(safeReadComparisons()); setCompletedLessons(safeReadLessons()); setQuizAttempts(safeReadAttempts()); setReadingList(safeReadReadingList()); setToast('Account and account scenarios deleted'); return true; } catch (caught) { setToast(caught.message); return false; } };
  const signOut = async () => {
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      if (!response.ok) throw new Error('The account service did not confirm sign-out.');
    } catch {
      setToast('Could not sign out right now. Please try again when the account service is available.');
      return;
    }
    setSessionMarker(false); setUser(null); setHistory(safeRead()); setComparisons(safeReadComparisons()); setCompletedLessons(safeReadLessons()); setQuizAttempts(safeReadAttempts()); setReadingList(safeReadReadingList()); setAccountOpen(false); setToast('Signed out');
  };
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
      <button className="workspace-switch" type="button" aria-current={section === 'dashboard' ? 'page' : undefined} onClick={() => chooseSection('dashboard')} aria-label="Open Student workspace overview"><div className="avatar">S</div><div><strong>Student workspace</strong><span>Personal learning</span></div><ChevronDown size={15} /></button>
      <nav aria-label="Main navigation">{nav.map((group) => <div className="nav-group" key={group.label}><div className="nav-label">{group.label}</div>{group.items.map(({ id, label, icon: Icon }) => <button type="button" className={`nav-item ${section === id ? 'nav-active' : ''}`} key={id} aria-current={section === id ? 'page' : undefined} onClick={() => chooseSection(id)}><Icon size={17} strokeWidth={1.8} /><span>{label}</span>{id === 'replay' && (scenarioA || scenarioB) && <span className="nav-dot" />}</button>)}</div>)}</nav>
      <div className="sidebar-spacer" />
      <div className="sidebar-tip"><div className="tip-icon"><Sparkles size={16} /></div><strong>Small steps, clearer choices.</strong><p>Every simulation is a safe place to learn. No real money involved.</p><button onClick={() => chooseSection('learn')}>Explore the guide <ArrowRight size={13} /></button></div>
      <button type="button" className={`nav-item settings-link ${section === 'settings' ? 'nav-active' : ''}`} aria-current={section === 'settings' ? 'page' : undefined} onClick={() => chooseSection('settings')}><Settings2 size={17} /><span>Settings</span></button>
      <button className="profile profile-button" onClick={() => { setAuthError(''); setAccountOpen(true); }}><div className="avatar avatar-dark">{user?.name?.slice(0,1).toUpperCase() ?? 'S'}</div><div><strong>{user?.name ?? 'Student'}</strong><span>{user ? user.email : 'Learning mode'}</span></div><ChevronDown size={16} /></button>
    </aside>
    {mobileOpen && <button className="mobile-scrim" onClick={() => setMobileOpen(false)} aria-label="Close navigation" />}

    <main className="main-area">
      <header className="topbar"><button className="mobile-menu icon-button" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={20} /></button><div className="breadcrumbs"><span>FinCoach</span><span className="crumb-slash">/</span><strong>{section === 'simulator' ? titleFor(module) : section === 'dashboard' ? 'Overview' : section === 'replay' ? 'Decision Replay' : section === 'history' ? 'My history' : section === 'progress' ? 'My progress' : section === 'settings' ? 'Settings' : 'Learn'}</strong></div><div className="topbar-right"><span className="safe-badge"><ShieldCheck size={14} /> Virtual practice</span><button className="top-avatar top-avatar-button" onClick={() => { setAuthError(''); setAccountOpen(true); }} aria-label={user ? `Account: ${user.name}` : 'Sign in or create an account'}>{user?.name?.slice(0,1).toUpperCase() ?? 'S'}</button></div></header>
      <div className="page-wrap">
        {section === 'dashboard' && <Dashboard history={history} completedLessons={completedLessons} quizAttempts={quizAttempts} user={user} chooseModule={chooseModule} openRecord={openRecord} openLesson={navigateToLesson} setSection={chooseSection} />}
        {section === 'simulator' && <Simulator module={module} setModule={chooseModule} inputs={inputs[module]} update={update} updateCategory={updateCategory} removeCategory={removeCategory} reset={() => { setInputs((current) => ({ ...current, [module]: structuredClone(initialInputs[module]) })); setFormErrors({}); setError(''); setActive(null); setCalculated(true); setCalculationFeedback('Inputs reset. Results use the default assumptions.'); }} result={result} error={error} formErrors={formErrors} calculated={calculated} run={updateSimulation} calculationBusy={calculationBusy} calculationFeedback={calculationFeedback} save={saveScenario} active={active} replayComparisonId={replayComparisonId} saveReplayVersion={saveReplayVersion} />}
        {section === 'replay' && <Replay history={history} comparisons={comparisons} a={scenarioA} b={scenarioB} setA={setScenarioA} setB={setScenarioB} openRecord={openRecord} remove={removeRecord} saveComparison={saveComparison} openComparison={openComparison} removeComparison={removeComparison} renameComparison={renameComparison} activeComparisonId={replayComparisonId} startReplayVersion={startReplayVersion} />}
        {section === 'history' && <History history={history} search={search} setSearch={setSearch} user={user} openRecord={openRecord} duplicate={duplicateRecord} remove={removeRecord} rename={renameRecord} />}
        {section === 'settings' && <Settings user={user} history={history} completedLessons={completedLessons} quizAttempts={quizAttempts} readingList={readingList} theme={theme} setTheme={setTheme} onProgress={() => chooseSection('progress')} onAccount={() => { setAuthError(''); setAccountOpen(true); }} onClear={clearHistory} onProfileSave={saveProfile} onPasswordChange={changePassword} onDeleteAccount={deleteAccount} />}
        {section === 'learn' && <Learn initialTarget={learningTarget} completedLessons={completedLessons} quizAttempts={quizAttempts} submitQuizAttempt={submitQuizAttempt} submitCourseAssessment={submitCourseAssessment} completeLesson={completeLesson} chooseModule={chooseModule} readingList={readingList} setBookReadingStatus={setBookReadingStatus} openCoursePage={navigateToCourse} openLessonPage={navigateToLesson} openLearnHome={() => chooseSection('learn')} />}
        {section === 'progress' && <CourseProgress completedLessons={completedLessons} quizAttempts={quizAttempts} readingList={readingList} history={history} user={user} setSection={chooseSection} openCourse={navigateToCourse} />}
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
function Settings({ user, history, completedLessons, quizAttempts, readingList, theme, setTheme, onProgress, onAccount, onClear, onProfileSave, onPasswordChange, onDeleteAccount }) {
  const [name, setName] = useState(user?.name ?? ''); const [email, setEmail] = useState(user?.email ?? ''); const [profileError, setProfileError] = useState(''); const [passwordError, setPasswordError] = useState('');
  const [showDelete, setShowDelete] = useState(false); const [deleteError, setDeleteError] = useState('');
  const lessonCount = courses.reduce((sum, course) => sum + course.modules.length, 0);
  const completedCount = courses.reduce((sum, course) => sum + course.modules.filter((item) => completedLessons.includes(item.lesson.id)).length, 0);
  const completedCourseCount = courses.filter((course) => course.modules.every((item) => completedLessons.includes(item.lesson.id))).length;
  const quizQuestionCount = quizAttempts.reduce((sum, attempt) => sum + (attempt.total || 1), 0);
  const quizCorrectCount = quizAttempts.reduce((sum, attempt) => sum + (attempt.score || 0), 0);
  const quizAverage = quizQuestionCount ? `${Math.round(quizCorrectCount / quizQuestionCount * 100)}%` : '—';
  const createdAtLabel = user?.createdAt && Number.isFinite(Date.parse(user.createdAt))
    ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'long' }).format(new Date(user.createdAt))
    : null;
  useEffect(()=>{setName(user?.name??'');setEmail(user?.email??'');},[user?.name,user?.email]);
  const exportScenarios = () => {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), scenarios: history }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'fincoach-scenarios.json'; link.click(); URL.revokeObjectURL(url);
  };
  return <>
    <div className="page-title-row"><div><div className="eyebrow">YOUR PREFERENCES</div><h1>Settings</h1><p>Manage your account and saved learning scenarios.</p></div></div>
    <section className="settings-card settings-learning-summary"><div className="settings-card-head"><div className="settings-icon"><BookOpen size={17}/></div><div><span className="panel-kicker">LEARNING PROFILE</span><h2>Your learning snapshot</h2></div><button className="text-link" onClick={onProgress}>Full progress <ArrowRight size={13}/></button></div><div className="settings-learning-grid"><article><span>Lessons</span><strong>{completedCount}/{lessonCount}</strong></article><article><span>Courses complete</span><strong>{completedCourseCount}/{courses.length}</strong></article><article><span>Quiz average</span><strong>{quizAverage}</strong></article><article><span>Books saved</span><strong>{readingList.length}</strong></article></div></section>
    <section className="settings-card"><div className="settings-card-head"><div className="settings-icon"><ShieldCheck size={18}/></div><div><span className="panel-kicker">ACCOUNT</span><h2>{user ? 'Your FinCoach account' : 'Learning mode'}</h2></div></div><p>{user ? 'Edit your account details. Your saved scenarios remain private to this account.' : 'You can use every simulator without an account. Create one to sync saved scenarios across sessions.'}</p>{createdAtLabel&&<p className="settings-subnote">Account created {createdAtLabel}</p>}{user?<form className="settings-form-grid" onSubmit={async(event)=>{event.preventDefault();setProfileError('');if(!await onProfileSave({name:name.trim(),email:email.trim()}))setProfileError('Check the details and try again.');}}><label className="field"><span className="field-label">Name</span><input className="auth-input" value={name} onChange={e=>setName(e.target.value)} required maxLength="80"/></label><label className="field"><span className="field-label">Email</span><input className="auth-input" type="email" value={email} onChange={e=>setEmail(e.target.value)} required maxLength="254"/></label>{profileError&&<span className="auth-error" role="alert">{profileError}</span>}<button className="button button-outline" type="submit">Save profile <Check size={14}/></button><button className="button button-outline" type="button" onClick={onAccount}>Account details and sign out <ArrowRight size={14}/></button></form>:<button className="button button-outline" onClick={onAccount}>Sign in or create an account <ArrowRight size={14}/></button>}</section>
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

function Dashboard({ history, completedLessons, quizAttempts, user, chooseModule, openRecord, openLesson, setSection }) {
  const latest = history.slice(0, 3);
  const replayReady = modules.some(({id}) => history.filter((item) => item.type === id).length >= 2);
  const allLessons = courses.flatMap((course) => course.modules.map((item) => ({ ...item.lesson, courseId: course.id, courseTitle: course.title })));
  const completedLessonIds = new Set(completedLessons.filter((id) => allLessons.some((lesson) => lesson.id === id)));
  const nextLesson = allLessons.find((lesson) => !completedLessonIds.has(lesson.id));
  const quizTotal = quizAttempts.reduce((sum, attempt) => sum + (attempt.total || 1), 0);
  const quizCorrect = quizAttempts.reduce((sum, attempt) => sum + (attempt.score || 0), 0);
  const recentlyUsed = [...new Set(history.map((item) => item.type))].slice(0, 4);
  const latestResult = history[0]?.result ?? history[0]?.results;
  const learningInsight = !history.length ? 'Try a simulator to see how one changed assumption can affect a financial outcome.'
    : history[0].type === 'budget' ? latestResult?.overAllocated
      ? `Your latest budget allocates ${formatINR(Math.abs(latestResult.remaining))} more than the income entered. Review a category to bring the plan within income.`
      : `Your latest budget leaves ${formatINR(latestResult?.remaining)} unallocated from the income entered.`
    : history[0].type === 'investment' ? `Your latest projection estimates ${formatINR(latestResult?.gain)} in growth under the selected assumptions. Returns are not guaranteed.`
    : history[0].type === 'loan' ? `Your latest loan estimate includes ${formatINR(latestResult?.totalInterest)} in interest over ${latestResult?.monthsPaid} payments.`
    : history[0].type === 'credit-card' ? `Your latest card plan estimates ${formatINR(latestResult?.totalInterest)} in interest over ${latestResult?.months ?? 'more than 600'} months.`
    : history[0].type === 'savings-goal' ? `${formatINR(latestResult?.remaining)} remains to your latest saved savings goal.`
    : `Your latest purchase comparison estimates the lowest modeled cost at ${formatINR(Math.min(...(latestResult?.options ?? []).filter((option) => option.totalCost !== null).map((option) => option.totalCost)))}.`;
  const recentActivity = [
    ...history.map((item) => ({ kind: 'scenario', date: item.createdAt, title: `Saved ${titleFor(item.type)} scenario`, item })),
    ...quizAttempts.map((attempt) => ({ kind: 'quiz', date: attempt.createdAt, title: `Completed ${attempt.title || 'a learning check'}`, item: attempt })),
  ].sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0)).slice(0, 3);
  const done = Number(history.length > 0) + Number(completedLessonIds.size > 0) + Number(replayReady);
  return <>
    <div className="welcome-row"><div><div className="eyebrow"><span className="eyebrow-dot" /> YOUR FINANCIAL LEARNING SPACE</div><h1>{user ? `Welcome, ${user.name.trim().split(/\s+/)[0]}.` : <>Good choices start<br className="desktop-only" /> with a little curiosity.</>}</h1><p className="lead">Try out a money decision. See how the numbers move. Learn at your own pace.</p></div><div className="welcome-art" aria-hidden="true"><div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" /><div className="art-sun"><Sparkles size={25} /></div><div className="art-pill pill-a">Learn by doing</div><div className="art-pill pill-b">₹ + choices</div></div></div>
    <section className="dashboard-learning-strip" aria-label="Learning summary">
      <article><span className="panel-kicker">LESSONS COMPLETE</span><strong>{completedLessonIds.size}/{allLessons.length}</strong><small>Across all courses</small></article>
      <article><span className="panel-kicker">QUIZ PERFORMANCE</span><strong>{quizTotal ? `${Math.round(quizCorrect / quizTotal * 100)}%` : '—'}</strong><small>{quizAttempts.length ? `${quizAttempts.length} saved attempt${quizAttempts.length === 1 ? '' : 's'}` : 'No quiz attempts yet'}</small></article>
      <article className="dashboard-next-lesson"><span className="panel-kicker">RECOMMENDED NEXT LESSON</span>{nextLesson ? <><strong>{nextLesson.title}</strong><small>{nextLesson.courseTitle}</small><button className="text-link" onClick={() => openLesson(nextLesson.courseId,nextLesson.id)}>Start this lesson <ArrowRight size={13}/></button></> : <><strong>All lessons complete</strong><small>Explore a simulator or revisit a course.</small><button className="text-link" onClick={() => setSection('learn')}>Browse courses <ArrowRight size={13}/></button></>}</article>
    </section>
    <div className="section-heading"><div><h2>Pick up where you want to begin</h2><p>Six practical ways to explore everyday money decisions.</p></div><span className="quiet-count">{modules.length} learning tools</span></div>
    <div className="module-grid">{modules.map(({ id, label, caption, icon: Icon, accent }, index) => <button type="button" key={id} className={`module-card module-${accent}`} onClick={() => chooseModule(id)}><div className="module-card-top"><div className="module-icon"><Icon size={19} strokeWidth={1.8} /></div><span className="card-index">0{index + 1}</span></div><strong>{label}</strong><span className="module-caption">{caption}</span><span className="module-action">Explore <ArrowRight size={14} /></span><div className="card-watermark"><Icon size={64} strokeWidth={1} /></div></button>)}</div>
    <div className="dashboard-insights"><section className="dashboard-tools"><div className="recent-heading"><div><h3>Recently used simulators</h3><p>Quick access from your saved practice</p></div></div>{recentlyUsed.length ? <div className="dashboard-tool-list">{recentlyUsed.map((id) => { const tool = modules.find((item) => item.id === id); const Icon = tool?.icon ?? Wallet; return <button key={id} onClick={() => chooseModule(id)}><span><Icon size={16}/></span><strong>{titleFor(id)}</strong><ArrowRight size={14}/></button>; })}</div> : <div className="dashboard-insight-empty">Your recent simulators will appear after you save a scenario.</div>}</section><section className="dashboard-insight"><span className="panel-kicker">FINANCIAL LEARNING INSIGHT</span><p>{learningInsight}</p><small>{history.length ? `Based on your latest saved ${titleFor(history[0].type).toLowerCase()} scenario` : 'A starting tip for your first visit'}</small></section></div>
    <section className="getting-started"><div className="getting-heading"><div><span className="panel-kicker">GETTING STARTED</span><h2>Your learning checklist</h2><p>Small steps make the tools easier to explore.</p></div><strong>{done}/3 complete</strong></div><div className="progress-track"><span style={{width:`${done/3*100}%`}}/></div><div className="checklist-grid"><button onClick={()=>chooseModule('investment')}><Check size={15} className={history.length?'check-done':''}/><span><strong>Run your first simulation</strong><small>{history.length?'Scenario saved':'Choose any tool to begin'}</small></span><ArrowRight size={14}/></button><button onClick={()=>setSection('learn')}><Check size={15} className={quizAttempts.length?'check-done':''}/><span><strong>Try a learning quiz</strong><small>{quizAttempts.length?`${quizAttempts.length} quiz attempt${quizAttempts.length===1?'':'s'} saved`:'Build confidence with a quick question'}</small></span><ArrowRight size={14}/></button><button onClick={()=>replayReady?setSection('replay'):chooseModule('investment')}><Check size={15} className={replayReady?'check-done':''}/><span><strong>Compare two choices</strong><small>{replayReady?'Ready to replay':'Save two of one simulator to compare'}</small></span><ArrowRight size={14}/></button></div></section>
    <div className="dashboard-lower"><section className="replay-banner"><div className="replay-banner-icon"><RotateCcw size={20} /></div><div className="replay-copy"><span className="mini-label">THE FINCOACH DIFFERENCE</span><h3>What if you chose differently?</h3><p>Replay a decision with a changed input. Compare both paths and see what made the difference.</p><button className="button button-dark" onClick={() => setSection('replay')}>Try Decision Replay <ArrowRight size={15} /></button></div><div className="replay-graphic" aria-hidden="true"><div className="graph-line graph-line-a"/><div className="graph-line graph-line-b"/><span className="graph-point point-a"/><span className="graph-point point-b"/><span className="graph-axis">TODAY <span>→</span> LATER</span></div></section>
    <section className="recent-card"><div className="recent-heading"><div><h3>Recently explored</h3><p>Your latest practice scenarios</p></div><button className="text-link" onClick={() => setSection('history')}>View all <ArrowRight size={14} /></button></div>{latest.length ? <div className="recent-list">{latest.map((item) => <button className="recent-row" key={item.id} onClick={() => openRecord(item)}><div className={`recent-icon ${item.type}`}><ModuleIcon type={item.type} /></div><div className="recent-title"><strong>{item.title}</strong><span>{titleFor(item.type)} · {new Date(item.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span></div><ArrowRight size={15} className="recent-arrow" /></button>)}</div> : <div className="empty-mini"><div className="empty-symbol"><Clock3 size={17} /></div><strong>Your story starts here</strong><span>Run a simulation and it’ll appear here.</span></div>}</section></div>
    <section className="dashboard-activity"><div className="recent-heading"><div><h3>Recent activity</h3><p>Saved simulations and quiz attempts</p></div><button className="text-link" onClick={() => setSection('progress')}>View progress <ArrowRight size={14}/></button></div>{recentActivity.length ? <div className="dashboard-activity-list">{recentActivity.map((activity) => <article key={`${activity.kind}-${activity.item.id ?? activity.item.attemptId}`}><span className="dashboard-activity-mark">{activity.kind === 'quiz' ? <BookOpen size={15}/> : <Activity size={15}/>}</span><span><strong>{activity.title}</strong><small>{new Date(activity.date).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</small></span></article>)}</div> : <div className="dashboard-activity-empty">Your saved simulations and quiz attempts will appear here as you explore FinCoach.</div>}</section>
    <div className="disclosure-strip"><CircleHelp size={16} /><span>FinCoach is for learning, not financial advice. Results use assumptions you choose and do not predict actual outcomes.</span><button onClick={() => setSection('learn')}>How it works <ArrowRight size={13} /></button></div>
  </>;
}
function ModuleIcon({ type }) { const match = modules.find((item) => item.id === type); const Icon = match?.icon ?? Wallet; return <Icon size={17} />; }

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
    <div className="page-title-row replay-title"><div><div className="eyebrow">THE FINCOACH DIFFERENCE</div><h1>What if you chose differently?</h1><p>Compare two versions of a decision and see which assumptions changed the outcome.</p></div><button type="button" className="replay-badge replay-badge-action" onClick={()=>document.getElementById('replay-scenarios')?.scrollIntoView({behavior:'smooth',block:'start'})}><RotateCcw size={18} /><span>Choose scenarios</span><ArrowRight size={13}/></button></div>
    <div className="replay-instructions"><div className="step-chip"><span>1</span><div><strong>Choose a baseline</strong><small>Your starting point</small></div></div><ArrowRight size={15} /><div className="step-chip"><span>2</span><div><strong>Choose a variant</strong><small>A different set of assumptions</small></div></div><ArrowRight size={15} /><div className="step-chip"><span>3</span><div><strong>See what changed</strong><small>Inputs and outcomes side by side</small></div></div></div>
    {comparisons.length>0 && <section className="saved-comparisons"><div className="saved-comparisons-head"><div><span className="panel-kicker">YOUR REPLAY LIBRARY</span><h2>Saved comparisons</h2></div><span className="quiet-count">{comparisons.length} saved</span></div><div className="saved-comparison-list">{comparisons.map((record)=><article key={record.id} className="saved-comparison-row"><button className="saved-comparison-open" onClick={()=>openComparison(record)}><strong>{record.title}</strong><span>{titleFor(record.scenarioA.type)} · {new Date(record.createdAt).toLocaleDateString('en-IN',{dateStyle:'medium'})}</span></button><button className="icon-button" aria-label={`Rename ${record.title}`} title="Rename comparison" onClick={()=>renameComparison(record)}><Pencil size={14}/></button><button className="icon-button" aria-label={`Delete ${record.title}`} title="Delete comparison" onClick={()=>removeComparison(record)}><Trash2 size={14}/></button></article>)}</div></section>}
    {activeComparison && <section className="saved-comparisons replay-timeline" aria-labelledby="replay-timeline-title"><div className="saved-comparisons-head"><div><span className="panel-kicker">VERSION HISTORY</span><h2 id="replay-timeline-title">{activeComparison.title}</h2><p>Each saved replay is a snapshot. Your original baseline stays unchanged.</p></div><button className="button button-primary button-compact" onClick={()=>startReplayVersion(activeComparison, activeComparison.versions.at(-1))}><RotateCcw size={14}/> Replay latest</button></div><ol className="replay-version-list">{activeComparison.versions.map((version,index)=>{const number=version.versionNumber??index+1;const item={...version.scenario,id:`${activeComparison.id}-version-${number}`,title:`${activeComparison.title} · Version ${number}`,createdAt:version.createdAt??activeComparison.createdAt};return <li key={`${activeComparison.id}-${number}`} className="replay-version-item"><div className="replay-version-marker">{number}</div><div className="replay-version-content"><div className="replay-version-heading"><strong>Version {number}</strong><time>{version.createdAt?new Date(version.createdAt).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}):'Saved comparison'}</time></div>{version.notes&&<p className="replay-version-note">{version.notes}</p>}<p className="replay-version-changes">{version.changes?.length?version.changes.map((change)=>`${change.label}: ${String(change.a)} → ${String(change.b)}`).join(' · '):'Matches the baseline inputs'}</p><div className="replay-version-actions"><button className="button button-outline button-compact" onClick={()=>setA(item)}>Use as A</button><button className="button button-outline button-compact" onClick={()=>setB(item)}>Use as B</button><button className="text-link" onClick={()=>startReplayVersion(activeComparison,version)}>Edit assumptions <ArrowRight size={13}/></button></div></div></li>})}</ol></section>}
    {pickError && <div className="error-banner" role="alert"><CircleHelp size={17}/><div><strong>Choose comparable scenarios</strong><span>{pickError}</span></div><button className="icon-button" onClick={() => setPickError('')} aria-label="Dismiss"><X size={15}/></button></div>}
    <section className="replay-picker" id="replay-scenarios"><div className="picker-heading"><div><h2>Your saved scenarios</h2><p>Select two from the same simulator below.</p></div><span className="quiet-count">{history.length} saved</span></div>{history.length ? <div className="picker-list">{history.map((record) => <ScenarioRow key={record.id} record={record} open={() => openRecord(record)} onA={() => choose(record, 'A')} onB={() => choose(record, 'B')} selectedA={a?.id === record.id} selectedB={b?.id === record.id} />)}</div> : <div className="history-empty compact-empty"><div className="empty-symbol"><RotateCcw size={18}/></div><strong>Save a scenario to start a replay</strong><span>Run any simulator and save it as a baseline or variant.</span><button className="button button-primary" onClick={() => openRecord({ type:'investment', inputs:{ principal:'20000',years:'5',rate:'8',frequency:'1' }, result:calculate('investment',{principal:'20000',years:'5',rate:'8',frequency:'1'}), title:'Example scenario',createdAt:new Date().toISOString() })}>Open a simulator <ArrowRight size={14}/></button></div>}</section>
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
    const valueAt = (result, year) => year > result.years + 1e-9 ? undefined : investmentValueAt(result, year);
    const data = Array.from({ length: steps + 1 }, (_, index) => {
      const year = horizon * index / steps;
      return { period: `Year ${Number(year.toFixed(2))}`, A: valueAt(left, year), B: valueAt(right, year) };
    });
    return <div className="replay-chart-panel"><div className="replay-chart-heading"><div><strong>Growth path comparison</strong><span>Compared over the same time horizon</span></div><span className="replay-chart-legend"><i className="legend-dot"/> A <i className="legend-dot legend-indigo"/> B</span></div><div className="replay-chart-area"><ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{top:8,right:8,left:-14,bottom:0}}><CartesianGrid stroke="#edf0ed" vertical={false}/><XAxis dataKey="period" tickLine={false} axisLine={false} tick={{fill:'#89948e',fontSize:9}} interval="preserveStartEnd"/><YAxis tickLine={false} axisLine={false} tick={{fill:'#89948e',fontSize:9}} tickFormatter={(v)=>v>=100000?`₹${(v/100000).toFixed(1)}L`:`₹${Math.round(v/1000)}k`}/><Tooltip formatter={(value)=>formatINR(value,2)} contentStyle={{borderRadius:9,border:'1px solid #e8ece8',fontSize:11}}/><Line dataKey="A" name="Scenario A" connectNulls type="monotone" stroke="#4e9c6e" strokeWidth={2.3} dot={false}/><Line dataKey="B" name="Scenario B" connectNulls type="monotone" stroke="#8785bd" strokeWidth={2.3} dot={false}/></LineChart></ResponsiveContainer></div></div>;
  }
  const key = a.type === 'buy-vs-save' ? 'cost' : a.type === 'investment' ? 'value' : 'balance';
  const leftRows = a.type === 'savings-goal' ? left.schedule : left.chart ?? left.schedule;
  const rightRows = b.type === 'savings-goal' ? right.schedule : right.chart ?? right.schedule;
  const data = alignReplayRows(leftRows, rightRows, key);
  return <div className="replay-chart-panel"><div className="replay-chart-heading"><div><strong>{a.type === 'investment' ? 'Growth path comparison' : a.type === 'buy-vs-save' ? 'Estimated cost comparison' : a.type === 'savings-goal' ? 'Savings path comparison' : 'Balance path comparison'}</strong><span>How each scenario changes over time</span></div><span className="replay-chart-legend"><i className="legend-dot"/> A <i className="legend-dot legend-indigo"/> B</span></div><div className="replay-chart-area"><ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{top:8,right:8,left:-14,bottom:0}}><CartesianGrid stroke="#edf0ed" vertical={false}/><XAxis dataKey="period" tickLine={false} axisLine={false} tick={{fill:'#89948e',fontSize:9}} interval="preserveStartEnd"/><YAxis tickLine={false} axisLine={false} tick={{fill:'#89948e',fontSize:9}} tickFormatter={(v)=>v>=100000?`₹${(v/100000).toFixed(1)}L`:`₹${Math.round(v/1000)}k`}/><Tooltip formatter={(value)=>formatINR(value,2)} contentStyle={{borderRadius:9,border:'1px solid #e8ece8',fontSize:11}}/><Line dataKey="A" name="Scenario A" connectNulls type="monotone" stroke="#4e9c6e" strokeWidth={2.3} dot={false}/><Line dataKey="B" name="Scenario B" connectNulls type="monotone" stroke="#8785bd" strokeWidth={2.3} dot={false}/></LineChart></ResponsiveContainer></div></div>;
}
function ReplayOutcomes({ a, b }) {
  const key = a.type === 'investment' ? 'finalValue' : a.type === 'loan' || a.type === 'credit-card' ? 'totalInterest' : a.type === 'savings-goal' ? 'projectedAtTarget' : 'remaining';
  const label = a.type === 'investment' ? 'Estimated future value' : a.type === 'loan' ? 'Total interest paid' : a.type === 'credit-card' ? 'Total interest' : a.type === 'savings-goal' ? 'Projected savings at target date' : a.type === 'buy-vs-save' ? 'Lowest estimated purchase cost' : 'Unallocated amount';
  const lowestCost = (record) => Math.min(...record.result.options.filter((option) => option.totalCost !== null).map((option) => option.totalCost));
  const av = a.type === 'buy-vs-save' ? lowestCost(a) : a.result[key]; const bv = b.type === 'buy-vs-save' ? lowestCost(b) : b.result[key]; const diff = bv - av;
  return <div className="outcome-difference"><div><span className="panel-kicker">OUTCOME DIFFERENCE</span><strong>{label}</strong></div><div className="outcome-values"><span>{formatINR(av)} <small>A</small></span><ArrowRight size={15}/><span>{formatINR(bv)} <small>B</small></span></div><div className={`outcome-delta ${diff === 0 ? '' : diff > 0 ? 'delta-up' : 'delta-down'}`}>{diff === 0 ? 'No change' : `${diff > 0 ? '+' : '−'}${formatINR(Math.abs(diff))}`}<span> in Scenario B</span></div><p>This difference comes from the assumptions shown above. It describes this calculation only.</p></div>;
}

function AttemptReview({ attempt }) {
  const items = getAttemptReview(attempt);
  if (!items.length) return <p className="attempt-review-unavailable">Answer details are unavailable for this saved attempt.</p>;
  return <details className="attempt-review"><summary>Review answers and explanations</summary><div className="attempt-review-content">
    {items.map((item, index) => <article className="attempt-review-question" key={`${attempt.attemptId}-${index}`}>
      <strong>{items.length > 1 ? `${index + 1}. ` : ''}{item.prompt}</strong>
      <p><b>Your answer:</b> {Number.isInteger(item.selectedIndex) ? item.options[item.selectedIndex] || 'Recorded option unavailable' : 'No answer recorded'}</p>
      <p><b>Correct answer:</b> {item.options[item.correctIndex]}</p>
      <p><b>Explanation:</b> {item.explanation}</p>
    </article>)}
  </div></details>;
}

function CourseProgress({completedLessons,quizAttempts,readingList,history,user,setSection,openCourse}) {
  const lessonIds = new Set(courses.flatMap((course) => course.modules.map((item) => item.lesson.id)));
  const completedCourseLessons = completedLessons.filter((id) => lessonIds.has(id)).length;
  const totalLessons = lessonIds.size;
  const correct = quizAttempts.reduce((sum, attempt) => sum + (attempt.score || 0), 0);
  const attempted = quizAttempts.length;
  const totalQuestions = quizAttempts.reduce((sum, attempt) => sum + (attempt.total || 1), 0);
  const average = totalQuestions ? Math.round(correct / totalQuestions * 100) : 0;
  const badges = [
    { label: 'First lesson', earned: completedCourseLessons >= 1, detail: 'Complete one learning lesson' },
    { label: 'Curious learner', earned: completedCourseLessons >= 5, detail: 'Complete five learning lessons' },
    { label: 'Quiz practice', earned: attempted >= 3, detail: 'Save three quiz attempts' },
    { label: 'Scenario explorer', earned: history.length >= 3, detail: 'Save three scenarios' },
  ];
  return <>
    <div className="page-title-row"><div><div className="eyebrow">YOUR LEARNING ACTIVITY</div><h1>My progress</h1><p>{user ? 'Progress and quiz history saved to your account.' : 'Progress and quiz history saved in this browser.'}</p></div></div>
    <div className="progress-summary-grid">
      <article><span>Lessons complete</span><strong>{completedCourseLessons}/{totalLessons}</strong></article>
      <article><span>Quiz attempts</span><strong>{attempted}</strong></article>
      <article><span>Correct answers</span><strong>{attempted ? `${correct}/${totalQuestions}` : '—'}</strong></article>
      <article><span>Average score</span><strong>{attempted ? `${average}%` : '—'}</strong></article>
    </div>
    <section className="progress-courses"><h2>Course progress</h2>{completedCourseLessons===0&&<div className="progress-first-step"><span>No lessons completed yet. Your progress will update as you study and pass lesson checks.</span><button className="text-link" onClick={()=>openCourse(courses[0].id)}>Start the first course <ArrowRight size={13}/></button></div>}{courses.map((course) => {
      const done = course.modules.filter((item) => completedLessons.includes(item.lesson.id)).length;
      return <article className="progress-course-row" key={course.id}><div><div><strong>{course.title}</strong><span>{done} of {course.modules.length} lessons · {Math.round(done / course.modules.length * 100)}%</span></div><button className="text-link" onClick={()=>openCourse(course.id)}>Open modules <ArrowRight size={12}/></button></div><div className="progress-track"><span style={{ width: `${done / course.modules.length * 100}%` }}/></div></article>;
    })}</section>
    <section className="progress-courses"><h2>Achievements</h2><div className="achievement-grid">{badges.map((badge) => <article className={badge.earned ? 'achievement-earned' : 'achievement-locked'} key={badge.label}><strong>{badge.earned ? '✓' : '○'} {badge.label}</strong><span>{badge.detail}</span></article>)}</div></section>
    <section className="progress-courses"><h2>Recent quiz attempts</h2>{quizAttempts.length
      ? <div className="attempt-list">{quizAttempts.slice(0, 12).map((attempt) => <article className="attempt-row" key={attempt.attemptId}>
        <span><strong>{attempt.title || courses.flatMap((course) => course.modules).find((item) => item.lesson.id === attempt.lessonId)?.lesson.title || attempt.lessonId}</strong><small>{new Date(attempt.createdAt).toLocaleString()}</small></span>
        <b>{attempt.score}/{attempt.total} · {attempt.percentage ?? Math.round(attempt.score / attempt.total * 100)}% · {attempt.isCorrect ? 'Complete' : 'Review'}</b>
        <AttemptReview attempt={attempt}/>
      </article>)}</div>
      : <div className="history-empty"><strong>No quiz attempts yet</strong><span>Study a course and try a knowledge check to see results here.</span><button className="text-link" onClick={() => setSection('learn')}>Browse courses →</button></div>}
    </section>
    <section className="progress-courses"><h2>Reading list</h2>{readingList.length
      ? <div className="attempt-list">{readingList.map((item) => <article className="attempt-row" key={item.title}><span><strong>{item.title}</strong><small>{books.find((book) => book.title === item.title)?.author}</small></span><b>{item.status}</b></article>)}</div>
      : <div className="history-empty"><strong>No books saved yet</strong><span>Add a book to your reading list from the Learn page.</span><button className="text-link" onClick={() => setSection('learn')}>Explore books →</button></div>}
    </section>
  </>;
}
export default App;
