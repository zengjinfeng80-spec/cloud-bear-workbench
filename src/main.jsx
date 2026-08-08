import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useRegisterSW } from 'virtual:pwa-register/react';
import {
  Bell,
  BookHeart,
  CalendarDays,
  CakeSlice,
  Check,
  CheckCircle2,
  ChevronRight,
  CloudDownload,
  CloudSun,
  Dumbbell,
  Info,
  Laptop,
  MoonStar,
  NotebookPen,
  Plus,
  Settings2,
  Sparkles,
  SunMedium,
  Trash2,
  WalletCards,
} from 'lucide-react';
import './styles.css';
import { supabase } from './supabase';

const NAV_ITEMS = [
  { id: 'home', label: '桌面', icon: CloudSun, tone: 'sky' },
  { id: 'tasks', label: '待办', icon: CheckCircle2, tone: 'lemon' },
  { id: 'accounts', label: '记账', icon: WalletCards, tone: 'mint' },
  { id: 'fitness', label: '减脂', icon: Dumbbell, tone: 'blue' },
  { id: 'schedule', label: '日程', icon: CalendarDays, tone: 'lilac' },
  { id: 'keepsakes', label: '纪念', icon: CakeSlice, tone: 'peach' },
  { id: 'diary', label: '日记', icon: NotebookPen, tone: 'pink' },
  { id: 'sleep', label: '睡眠', icon: MoonStar, tone: 'violet' },
  { id: 'settings', label: '设置', icon: Settings2, tone: 'gray' },
];

const DEFAULT_DATA = {
  profile: { nickname: 'zjinx', birthday: '2000-01-05', reminders: true, dark: false },
  tasks: [
    { id: 1, text: '整理今天的工作清单', done: true },
    { id: 2, text: '完成 30 分钟专注学习', done: false },
    { id: 3, text: '晚上散步 20 分钟', done: false },
  ],
  records: [
    { id: 1, amount: 35, note: '午餐', category: '餐饮', time: '今天 12:20' },
    { id: 2, amount: 68, note: '生活用品', category: '日用', time: '昨天 18:40' },
    { id: 3, amount: 25, note: '咖啡', category: '餐饮', time: '昨天 09:15' },
  ],
  events: [
    { id: 1, title: '复习经济法', date: '2026-08-01', time: '19:30', reminder: '提前15分钟' },
    { id: 2, title: '月度复盘', date: '2026-08-02', time: '20:00', reminder: '提前1小时' },
  ],
};

function usePersistentData() {
  const [data, setData] = useState(() => {
    try {
      const saved = localStorage.getItem('cloud-bear-workbench');
      if (!saved) return DEFAULT_DATA;
      const parsed = JSON.parse(saved);
      return { ...DEFAULT_DATA, ...parsed, profile: { ...DEFAULT_DATA.profile, ...parsed.profile } };
    } catch {
      return DEFAULT_DATA;
    }
  });

  useEffect(() => localStorage.setItem('cloud-bear-workbench', JSON.stringify(data)), [data]);
  return [data, setData];
}

function mergeWorkbenchData(localData, cloudData) {
  if (!cloudData) return localData;
  const mergeList = (local = [], cloud = []) => {
    const cloudIds = new Set(cloud.map((item) => item.id));
    return [...cloud, ...local.filter((item) => !cloudIds.has(item.id))];
  };
  return {
    ...DEFAULT_DATA,
    ...cloudData,
    profile: { ...DEFAULT_DATA.profile, ...(cloudData.profile || {}) },
    tasks: mergeList(localData.tasks, cloudData.tasks),
    records: mergeList(localData.records, cloudData.records),
    events: mergeList(localData.events, cloudData.events),
  };
}

function useAccountSync(data, setData, notify) {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data: result }) => {
      if (active) { setSession(result.session); setAuthReady(true); }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (active) setSession(nextSession);
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!session?.user || !authReady) return;
    let cancelled = false;
    const sync = async () => {
      setSyncing(true); setAuthError('');
      const { data: cloudRow, error: readError } = await supabase
        .from('workbench_data')
        .select('data')
        .eq('user_id', session.user.id)
        .maybeSingle();
      const migrationKey = `cloud-bear-migrated-${session.user.id}`;
      const hasMigrated = localStorage.getItem(migrationKey) === 'true';
      const merged = cloudRow?.data && hasMigrated ? cloudRow.data : mergeWorkbenchData(data, cloudRow?.data);
      if (!cancelled) setData(merged);
      const { error: writeError } = await supabase.from('workbench_data').upsert({
        user_id: session.user.id,
        data: merged,
        updated_at: new Date().toISOString(),
      });
      if (!writeError) localStorage.setItem(migrationKey, 'true');
      if (!cancelled) { setSyncing(false); if (readError || writeError) setAuthError('云端同步失败，当前仍保留本地记录'); }
    };
    sync();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id, authReady]);

  useEffect(() => {
    if (!session?.user || !authReady || syncing) return;
    const timer = window.setTimeout(async () => {
      const { error } = await supabase.from('workbench_data').upsert({
        user_id: session.user.id,
        data,
        updated_at: new Date().toISOString(),
      });
      if (error) setAuthError('云端同步失败，当前仍保留本地记录');
    }, 700);
    return () => window.clearTimeout(timer);
  }, [data, session?.user?.id, authReady, syncing]);

  const sendCode = async (email) => {
    setAuthError('');
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
    if (error) { setAuthError(error.message || '验证码发送失败，请稍后重试'); return false; }
    notify('验证码已发送，请查收邮箱'); return true;
  };
  const verifyCode = async (email, code) => {
    setAuthError('');
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
    if (error) { setAuthError('验证码无效或已过期，请重新获取'); return false; }
    notify('登录成功，数据已开始同步'); return true;
  };
  const signOut = async () => { await supabase.auth.signOut(); notify('已退出登录，本地记录仍保留'); };
  return { session, authReady, syncing, authError, sendCode, verifyCode, signOut };
}

function getGreeting(date) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 11) return '早安';
  if (hour >= 11 && hour < 18) return '午安';
  return '晚上好';
}

function App() {
  const [active, setActive] = useState('home');
  const [data, setData] = usePersistentData();
  const [toast, setToast] = useState('');
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(() => window.matchMedia('(display-mode: standalone)').matches);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  useEffect(() => {
    document.documentElement.dataset.theme = data.profile.dark ? 'dark' : 'light';
  }, [data.profile.dark]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [active]);

  useEffect(() => {
    const capturePrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    const markInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', capturePrompt);
    window.addEventListener('appinstalled', markInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', capturePrompt);
      window.removeEventListener('appinstalled', markInstalled);
    };
  }, []);

  const installApp = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      setInstallPrompt(null);
      notify('安装已开始');
    }
  };

  const notify = (message) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2200);
  };

  const account = useAccountSync(data, setData, notify);

  const pageProps = { data, setData, notify, setActive, installApp, canInstall: Boolean(installPrompt), isInstalled };
  const pages = {
    home: <HomePage {...pageProps} />,
    tasks: <TasksPage {...pageProps} />,
    accounts: <AccountsPage {...pageProps} />,
    fitness: <SimpleModule title="减脂记录" icon={Dumbbell} tone="blue" rows={[["今日摄入", "280 千卡"], ["运动时长", "32 分钟"], ["饮水", "1.2 升"]]} />,
    schedule: <SchedulePage {...pageProps} />,
    keepsakes: <SimpleModule title="纪念日" icon={CakeSlice} tone="peach" rows={[["相识纪念日", "还有 28 天"], ["生日提醒", "还有 158 天"]]} />,
    diary: <SimpleModule title="心情日记" icon={BookHeart} tone="pink" rows={[["今天", "平静、专注"], ["昨天", "完成了一个小目标"]]} />,
    sleep: <SimpleModule title="睡眠记录" icon={MoonStar} tone="violet" rows={[["昨夜睡眠", "7 小时 32 分"], ["入睡时间", "23:18"], ["起床时间", "06:50"], ["近 7 天平均", "7 小时 16 分"]]} />,
    settings: <SettingsPage {...pageProps} />,
  };

  return (
    <div className="app-shell">
      <Sidebar active={active} onSelect={setActive} />
      <main className="main-content">
        <AuthPanel {...account} />
        {pages[active]}
      </main>
      {toast && <div className="toast" role="status"><Check size={18} />{toast}</div>}
      {needRefresh && <div className="update-toast" role="status">
        <span>工作台有新版本</span>
        <button onClick={() => updateServiceWorker(true)}>立即更新</button>
        <button className="update-later" onClick={() => setNeedRefresh(false)}>稍后</button>
      </div>}
    </div>
  );
}

function AuthPanel({ session, authReady, syncing, authError, sendCode, verifyCode, signOut }) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const submitEmail = async (event) => { event.preventDefault(); if (!email.includes('@')) return; setBusy(true); setSent(await sendCode(email)); setBusy(false); };
  const submitCode = async (event) => { event.preventDefault(); if (code.length < 6) return; setBusy(true); await verifyCode(email, code); setBusy(false); };
  if (!authReady) return <div className="auth-panel auth-loading">正在检查登录状态…</div>;
  if (session?.user) return <div className="auth-panel auth-signed"><span>已登录：{session.user.email}</span><span className="auth-sync">{syncing ? '正在同步…' : '云端已同步'}</span><button type="button" onClick={signOut}>退出登录</button></div>;
  return <section className="auth-panel" aria-label="邮箱登录">
    <div><strong>跨设备同步</strong><span>使用同一个邮箱登录，手机和电脑共享工作台记录</span></div>
    {!sent ? <form onSubmit={submitEmail}><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="输入邮箱地址" aria-label="登录邮箱" required /><button className="primary-button" disabled={busy}>{busy ? '发送中…' : '发送验证码'}</button></form> : <form onSubmit={submitCode}><input inputMode="numeric" maxLength="6" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="输入6位验证码" aria-label="邮箱验证码" required /><button className="primary-button" disabled={busy}>{busy ? '验证中…' : '确认登录'}</button><button type="button" className="auth-link" onClick={() => setSent(false)}>更换邮箱</button></form>}
    {authError && <p className="auth-error" role="alert">{authError}</p>}
  </section>;
}

function Sidebar({ active, onSelect }) {
  return (
    <aside className="sidebar" aria-label="主导航">
      <div className="brand" aria-label="云朵熊工作台">
        <MiniBear />
        <div><strong>云朵熊</strong><span>MY DESK</span></div>
      </div>
      <nav>
        {NAV_ITEMS.map(({ id, label, icon: Icon, tone }) => (
          <button key={id} className={`nav-item ${active === id ? 'active' : ''}`} onClick={() => onSelect(id)} aria-current={active === id ? 'page' : undefined}>
            <span className={`nav-icon tone-${tone}`}><Icon size={21} strokeWidth={2.2} /></span>
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-note"><Sparkles size={15} /><span>今天也要<br />闪闪发光</span></div>
    </aside>
  );
}

function MiniBear() {
  return <span className="mini-bear" aria-hidden="true"><i className="mini-ear left" /><i className="mini-ear right" /><i className="mini-eye left" /><i className="mini-eye right" /><i className="mini-mouth" /></span>;
}

function CloudBear() {
  return (
    <div className="mascot-scene" aria-label="戴着蓝色贝雷帽、坐在云朵上的小熊插画" role="img">
      <span className="sparkle sparkle-one">✦</span><span className="sparkle sparkle-two">✧</span>
      <div className="cloud cloud-back" />
      <div className="bear">
        <span className="bear-ear left" /><span className="bear-ear right" />
        <span className="beret"><i /></span>
        <span className="bear-face"><i className="eye left" /><i className="eye right" /><i className="snout"><b /></i><i className="blush left" /><i className="blush right" /></span>
        <span className="bear-body"><i className="scarf" /><i className="scarf-tail" /><i className="paw left" /><i className="paw right" /></span>
      </div>
      <div className="cloud cloud-front" />
    </div>
  );
}

function PageHeader({ title, icon: Icon, action }) {
  return (
    <header className="page-header">
      <div><span className="heading-icon"><Icon size={23} /></span><h1>{title}</h1></div>
      {action}
    </header>
  );
}

function HomePage({ data, setActive }) {
  const [now, setNow] = useState(() => new Date());
  const completed = data.tasks.filter((task) => task.done).length;
  const progress = data.tasks.length ? Math.round((completed / data.tasks.length) * 100) : 0;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section className="page home-page">
      <div className="hero-panel">
        <div className="hero-cloud cloud-a" /><div className="hero-cloud cloud-b" />
        <div className="hero-copy">
          <p className="eyebrow"><SunMedium size={17} />{now.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}</p>
          <h1>{getGreeting(now)}，<strong>{data.profile.nickname}</strong></h1>
          <p>把今天的小事，一件一件温柔地完成吧。</p>
        </div>
        <CloudBear />
        <div className="progress-block">
          <div><span>今日完成度</span><strong>{progress}%</strong></div>
          <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
        </div>
      </div>

      <div className="stat-grid">
        <button className="stat-card card-tasks" onClick={() => setActive('tasks')}><span className="stat-emoji">✓</span><strong>{data.tasks.length}</strong><span>今日待办</span></button>
        <button className="stat-card card-fitness" onClick={() => setActive('fitness')}><span className="stat-emoji">◒</span><strong>280</strong><span>摄入千卡</span></button>
        <button className="stat-card card-accounts" onClick={() => setActive('accounts')}><span className="stat-emoji">¥</span><strong>{data.records.reduce((sum, item) => sum + item.amount, 0)}</strong><span>今日支出</span></button>
        <button className="stat-card card-sleep" onClick={() => setActive('sleep')}><span className="stat-emoji">☾</span><strong>7小时32分</strong><span>昨夜睡眠</span></button>
      </div>

      <section className="activity-section">
        <div className="section-heading"><div><span className="heading-dot" /><h2>最近动态</h2></div><span>生活正在慢慢变好</span></div>
        <div className="activity-list panel">
          <Activity icon="🍜" title="记录了午餐" detail="280 千卡" time="刚刚" tone="pink" />
          <Activity icon="✓" title="完成了待办" detail={completed ? data.tasks.find((task) => task.done)?.text : '还没有完成项'} time="10 分钟前" tone="lemon" />
          <Activity icon="¥" title="记了一笔账" detail={`最近一笔 ¥${data.records[0]?.amount ?? 0}`} time="2 小时前" tone="mint" />
        </div>
      </section>
    </section>
  );
}

function Activity({ icon, title, detail, time, tone }) {
  return <div className="activity-row"><span className={`activity-icon tone-${tone}`}>{icon}</span><div><strong>{title}</strong><span>{detail}</span></div><time>{time}</time></div>;
}

function TasksPage({ data, setData, notify }) {
  const [text, setText] = useState('');
  const addTask = (event) => {
    event.preventDefault();
    if (!text.trim()) return;
    setData((current) => ({ ...current, tasks: [...current.tasks, { id: Date.now(), text: text.trim(), done: false }] }));
    setText('');
    notify('待办已添加');
  };
  const toggle = (id) => setData((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === id ? { ...task, done: !task.done } : task) }));
  const remove = (id) => setData((current) => ({ ...current, tasks: current.tasks.filter((task) => task.id !== id) }));
  return (
    <section className="page">
      <PageHeader title="今日待办" icon={CheckCircle2} />
      <form className="quick-add" onSubmit={addTask}>
        <input value={text} onChange={(event) => setText(event.target.value)} placeholder="写下一件想完成的小事…" aria-label="新待办" />
        <button className="primary-button" type="submit"><Plus size={19} />添加</button>
      </form>
      <div className="task-list panel">
        {data.tasks.map((task) => <div className={`task-row ${task.done ? 'done' : ''}`} key={task.id}>
          <button className="check-button" onClick={() => toggle(task.id)} aria-label={task.done ? '标记为未完成' : '标记为完成'}>{task.done && <Check size={17} />}</button>
          <span>{task.text}</span>
          <button className="icon-button delete" onClick={() => remove(task.id)} aria-label="删除待办"><Trash2 size={18} /></button>
        </div>)}
      </div>
    </section>
  );
}

function AccountsPage({ data, setData, notify }) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [category, setCategory] = useState('餐饮');
  const total = data.records.reduce((sum, item) => sum + item.amount, 0);
  const addRecord = (event) => {
    event.preventDefault();
    const value = Number(amount);
    if (!value || value <= 0 || !note.trim()) return;
    const record = { id: Date.now(), amount: value, note: note.trim(), category, time: '刚刚' };
    setData((current) => ({ ...current, records: [record, ...current.records] }));
    setAmount(''); setNote(''); notify('账目已记录');
  };
  return (
    <section className="page">
      <PageHeader title="轻松记账" icon={WalletCards} action={<div className="month-total"><span>本月支出</span><strong>¥{total}</strong></div>} />
      <form className="entry-form panel" onSubmit={addRecord}>
        <label><span>金额</span><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" aria-label="金额" /></label>
        <label><span>分类</span><select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="分类"><option>餐饮</option><option>交通</option><option>日用</option><option>学习</option><option>其他</option></select></label>
        <label className="wide"><span>备注</span><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="这笔钱花在了哪里" aria-label="备注" /></label>
        <button className="primary-button wide" type="submit"><Plus size={19} />记一笔</button>
      </form>
      <h2 className="section-title">最近账目</h2>
      <div className="record-list panel">{data.records.map((item) => <div className="record-row" key={item.id}><span className="record-emoji">{item.category === '餐饮' ? '🍜' : item.category === '学习' ? '📚' : '🧾'}</span><div><strong>{item.note}</strong><span>{item.category} · {item.time}</span></div><b>-¥{item.amount}</b></div>)}</div>
    </section>
  );
}

function buildMonthDays(year, month) {
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  const previous = new Date(year, month, 0).getDate();
  return Array.from({ length: 42 }, (_, index) => {
    const offset = index - first.getDay() + 1;
    if (offset < 1) return { day: previous + offset, outside: true };
    if (offset > days) return { day: offset - days, outside: true };
    return { day: offset, outside: false };
  });
}

function SchedulePage({ data, setData, notify }) {
  const today = new Date();
  const [selectedDate, setSelectedDate] = useState(today.toISOString().slice(0, 10));
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('09:00');
  const [reminder, setReminder] = useState('提前15分钟');
  const days = useMemo(() => buildMonthDays(today.getFullYear(), today.getMonth()), []);
  const addEvent = (event) => {
    event.preventDefault();
    if (!title.trim()) return;
    setData((current) => ({ ...current, events: [...current.events, { id: Date.now(), title: title.trim(), date: selectedDate, time, reminder }] }));
    setTitle(''); notify('日程已添加');
  };
  const upcoming = [...data.events].sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  return (
    <section className="page schedule-page">
      <PageHeader title="日程安排" icon={CalendarDays} action={<strong className="date-accent">{today.getFullYear()}年{today.getMonth() + 1}月</strong>} />
      <div className="calendar-layout">
        <div className="calendar panel">
          <h2><CalendarDays size={21} />{today.getFullYear()}年{today.getMonth() + 1}月</h2>
          <div className="weekdays">{'日一二三四五六'.split('').map((day) => <span key={day}>{day}</span>)}</div>
          <div className="days">{days.map((item, index) => {
            const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(item.day).padStart(2, '0')}`;
            const isSelected = !item.outside && iso === selectedDate;
            return <button key={`${item.day}-${index}`} disabled={item.outside} className={`${item.outside ? 'outside' : ''} ${isSelected ? 'selected' : ''}`} onClick={() => setSelectedDate(iso)}>{item.day}</button>;
          })}</div>
        </div>
        <form className="schedule-form panel" onSubmit={addEvent}>
          <h2><Sparkles size={21} />添加日程</h2>
          <label><span>日程内容</span><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="要做什么" aria-label="日程内容" /></label>
          <div className="form-pair"><label><span>日期</span><input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} aria-label="日期" /></label><label><span>时间</span><input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="时间" /></label></div>
          <label><span>提醒</span><select value={reminder} onChange={(e) => setReminder(e.target.value)} aria-label="提醒"><option>不提醒</option><option>提前15分钟</option><option>提前1小时</option><option>提前1天</option></select></label>
          <button className="primary-button" type="submit"><Plus size={19} />添加日程</button>
        </form>
      </div>
      <h2 className="section-title">即将到来</h2>
      <div className="upcoming-list">{upcoming.map((item) => <div className="event-card" key={item.id}><div className="event-date"><strong>{Number(item.date.slice(8))}</strong><span>{Number(item.date.slice(5, 7))}月</span></div><div><strong>{item.title}</strong><span>{item.time} · {item.reminder}</span></div></div>)}</div>
    </section>
  );
}

function SettingsPage({ data, setData, notify, installApp, canInstall, isInstalled }) {
  const updateProfile = (patch) => setData((current) => ({ ...current, profile: { ...current.profile, ...patch } }));
  const exportData = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = '云朵熊工作台数据.json'; anchor.click(); URL.revokeObjectURL(url); notify('数据已导出');
  };
  return (
    <section className="page">
      <PageHeader title="设置" icon={Settings2} />
      <section className="settings-card panel">
        <h2><MiniBear />个人信息</h2>
        <div className="profile-row"><div className="avatar"><MiniBear /></div><div><strong>{data.profile.nickname}</strong><span>云朵熊专属工作台</span></div></div>
        <label><span>昵称</span><input value={data.profile.nickname} onChange={(e) => updateProfile({ nickname: e.target.value })} aria-label="昵称" /></label>
        <label><span>生日</span><input type="date" value={data.profile.birthday} onChange={(e) => updateProfile({ birthday: e.target.value })} aria-label="生日" /></label>
      </section>
      <section className="settings-list panel">
        <button className="settings-button" onClick={installApp} disabled={!canInstall || isInstalled}>
          <span className="setting-icon tone-sky"><Laptop size={21} /></span>
          <span><strong>{isInstalled ? '已安装到电脑' : '安装到电脑'}</strong><small>{isInstalled ? '可从桌面或开始菜单打开' : canInstall ? '作为独立应用安装，无需开发环境' : '公网 HTTPS 打开后可安装'}</small></span>
          {!isInstalled && <ChevronRight size={20} />}
        </button>
        <SettingRow icon={Bell} title="消息提醒" detail="待办、日程到期提醒" tone="sky"><Toggle checked={data.profile.reminders} onChange={(checked) => updateProfile({ reminders: checked })} label="消息提醒" /></SettingRow>
        <SettingRow icon={MoonStar} title="深色模式" detail="夜间使用更舒适" tone="lemon"><Toggle checked={data.profile.dark} onChange={(checked) => updateProfile({ dark: checked })} label="深色模式" /></SettingRow>
        <button className="settings-button" onClick={exportData}><span className="setting-icon tone-mint"><CloudDownload size={21} /></span><span><strong>数据备份</strong><small>导出所有记录数据</small></span><ChevronRight size={20} /></button>
        <div className="settings-button static"><span className="setting-icon tone-gray"><Info size={21} /></span><span><strong>关于</strong><small>云朵熊工作台 v1.0</small></span></div>
      </section>
      <p className="made-with">和云朵熊一起，把每一天过得软乎乎 ☁️</p>
    </section>
  );
}

function Toggle({ checked, onChange, label }) {
  return <button type="button" className={`toggle ${checked ? 'on' : ''}`} role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}><span /></button>;
}

function SettingRow({ icon: Icon, title, detail, tone, children }) {
  return <div className="setting-row"><span className={`setting-icon tone-${tone}`}><Icon size={21} /></span><div><strong>{title}</strong><small>{detail}</small></div>{children}</div>;
}

function SimpleModule({ title, icon: Icon, tone, rows }) {
  return <section className="page"><PageHeader title={title} icon={Icon} /><div className="simple-summary panel"><div className={`module-illustration tone-${tone}`}><Icon size={40} /></div>{rows.map(([label, value]) => <div className="summary-row" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div></section>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
