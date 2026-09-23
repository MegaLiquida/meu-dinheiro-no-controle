import { FormEvent, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  CreditCard,
  Leaf,
  Menu,
  Plus,
  ReceiptText,
  Sparkles,
  TrendingUp,
  WalletCards,
  X,
} from "lucide-react";

type View = "overview" | "calendar" | "simulator";
type LaunchType = "entrada" | "conta" | "parcela";
type LaunchStatus = "pending" | "paid";

type Launch = {
  id: string;
  type: LaunchType;
  name: string;
  amount: number;
  day: number;
  status: LaunchStatus;
  installmentsRemaining?: number;
};

const DEMO_TODAY = new Date(2026, 8, 21);
const MONTH_NAMES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];
const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

const initialLaunches: Launch[] = [
  { id: "salary", type: "entrada", name: "Salário", amount: 3800, day: 5, status: "paid" },
  { id: "rent", type: "conta", name: "Aluguel", amount: 1200, day: 10, status: "pending" },
  { id: "internet", type: "conta", name: "Internet", amount: 120, day: 12, status: "pending" },
  { id: "fridge", type: "parcela", name: "Geladeira", amount: 150, day: 15, status: "pending", installmentsRemaining: 6 },
  { id: "gym", type: "conta", name: "Academia", amount: 89, day: 18, status: "pending" },
  { id: "streaming", type: "conta", name: "Streaming", amount: 39, day: 20, status: "pending" },
  { id: "energy", type: "conta", name: "Energia", amount: 210, day: 22, status: "pending" },
  { id: "phone", type: "parcela", name: "Celular", amount: 190, day: 25, status: "pending", installmentsRemaining: 4 },
];

const money = (value: number) =>
  value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });

const monthLabel = (date: Date) =>
  `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;

function useStoredLaunches() {
  const [launches, setLaunches] = useState<Launch[]>(() => {
    try {
      const stored = localStorage.getItem("meu-dinheiro-lancamentos");
      return stored ? JSON.parse(stored) : initialLaunches;
    } catch {
      return initialLaunches;
    }
  });

  const updateLaunches = (next: Launch[] | ((current: Launch[]) => Launch[])) => {
    setLaunches((current) => {
      const updated = typeof next === "function" ? next(current) : next;
      localStorage.setItem("meu-dinheiro-lancamentos", JSON.stringify(updated));
      return updated;
    });
  };

  return [launches, updateLaunches] as const;
}

function AppLogo() {
  return (
    <div className="brand-lockup">
      <div className="brand-mark" aria-hidden="true">
        <Leaf size={18} strokeWidth={2.4} />
      </div>
      <div>
        <div className="brand-name">Meu Dinheiro</div>
        <div className="brand-subtitle">no controle</div>
      </div>
    </div>
  );
}

function NavButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className={`nav-button ${active ? "active" : ""}`} onClick={onClick} type="button" aria-current={active ? "page" : undefined}>
      {icon}
      <span>{label}</span>
      {active && <span className="nav-active-dot" />}
    </button>
  );
}

function SectionTitle({ eyebrow, title, detail }: { eyebrow: string; title: string; detail?: string }) {
  return (
    <div className="section-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
      </div>
      {detail && <p className="section-detail">{detail}</p>}
    </div>
  );
}

function LaunchTypePill({ type }: { type: LaunchType }) {
  const labels = { entrada: "Entrada", conta: "Conta fixa", parcela: "Parcela" };
  return <span className={`type-pill type-${type}`}>{labels[type]}</span>;
}

function Overview({
  launches,
  projectedBalance,
  currentBalance,
  nextSalary,
  onNavigate,
  onOpenAdd,
}: {
  launches: Launch[];
  projectedBalance: number;
  currentBalance: number;
  nextSalary: number;
  onNavigate: (view: View) => void;
  onOpenAdd: () => void;
}) {
  const upcoming = launches
    .filter((launch) => launch.type !== "entrada" && launch.day > DEMO_TODAY.getDate())
    .sort((a, b) => a.day - b.day);
  const fixedTotal = launches.filter((launch) => launch.type === "conta").reduce((sum, launch) => sum + launch.amount, 0);
  const installmentsTotal = launches.filter((launch) => launch.type === "parcela").reduce((sum, launch) => sum + launch.amount, 0);
  const incomeTotal = launches.filter((launch) => launch.type === "entrada").reduce((sum, launch) => sum + launch.amount, 0);
  const health = projectedBalance < 0 ? "danger" : projectedBalance < 500 ? "attention" : "good";
  const healthLabel = health === "good" ? "mês sob controle" : health === "attention" ? "mês apertado" : "precisa de atenção";

  return (
    <div className="page-stack page-enter">
      <SectionTitle
        eyebrow="Visão geral · setembro 2026"
        title="Bom te ver por aqui."
        detail="Seu dinheiro explicado de um jeito simples, sem surpresa no fim do mês."
      />

      <section className="balance-hero">
        <div className="hero-orbit orbit-one" />
        <div className="hero-orbit orbit-two" />
        <div className="hero-copy">
          <div className="hero-label"><span className="live-dot" /> disponível até o próximo salário</div>
          <div className="balance-amount">{money(projectedBalance)}</div>
          <p>Sobra até <strong>5 de outubro</strong>, depois de descontar os compromissos que ainda vencem.</p>
          <div className="balance-context">
            <span><ArrowDownLeft size={15} /> {money(currentBalance)} já livres hoje</span>
            <span><CalendarDays size={15} /> {upcoming.length} compromissos pela frente</span>
          </div>
        </div>
        <div className="hero-side">
          <div className="health-ring"><span>{health === "good" ? "OK" : health === "attention" ? "!" : "×"}</span></div>
          <div>
            <span className="hero-side-label">saúde do mês</span>
            <strong>{healthLabel}</strong>
            <small>próxima entrada: {money(nextSalary)}</small>
          </div>
        </div>
      </section>

      <section className="metric-grid">
        <div className="metric-card metric-green">
          <div className="metric-icon"><TrendingUp size={19} /></div>
          <div className="metric-label">entradas do mês</div>
          <div className="metric-value">{money(incomeTotal)}</div>
          <div className="metric-foot"><span className="trend-up">+1 entrada</span> prevista</div>
        </div>
        <div className="metric-card metric-yellow">
          <div className="metric-icon"><ReceiptText size={19} /></div>
          <div className="metric-label">contas fixas</div>
          <div className="metric-value">{money(fixedTotal)}</div>
          <div className="metric-foot">{launches.filter((launch) => launch.type === "conta").length} compromissos recorrentes</div>
        </div>
        <div className="metric-card metric-coral">
          <div className="metric-icon"><CreditCard size={19} /></div>
          <div className="metric-label">parcelas em aberto</div>
          <div className="metric-value">{money(installmentsTotal)}</div>
          <div className="metric-foot">por mês · {launches.filter((launch) => launch.type === "parcela").length} compras</div>
        </div>
      </section>

      <div className="content-grid overview-grid">
        <section className="panel commitments-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">o que vem pela frente</span>
              <h2>Próximos vencimentos</h2>
            </div>
            <button className="text-action" type="button" onClick={() => onNavigate("calendar")}>ver calendário <ArrowRight size={15} /></button>
          </div>
          <div className="commitment-list">
            {upcoming.slice(0, 4).map((launch, index) => (
              <div className="commitment-row" key={launch.id} style={{ animationDelay: `${index * 45}ms` }}>
                <div className={`date-chip ${launch.type === "parcela" ? "date-coral" : "date-yellow"}`}>
                  <strong>{String(launch.day).padStart(2, "0")}</strong>
                  <small>set</small>
                </div>
                <div className="commitment-info">
                  <strong>{launch.name}</strong>
                  <span><LaunchTypePill type={launch.type} /> vence em {launch.day - DEMO_TODAY.getDate()} dias</span>
                </div>
                <div className="commitment-amount">{money(launch.amount)}</div>
              </div>
            ))}
          </div>
          <button className="add-inline" type="button" onClick={onOpenAdd}><Plus size={15} /> cadastrar novo lançamento</button>
        </section>

        <section className="panel read-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">leitura rápida</span>
              <h2>Seu mês em uma frase</h2>
            </div>
            <Sparkles size={18} className="sparkle-icon" />
          </div>
          <div className="read-quote">{projectedBalance >= 0 ? "Você consegue chegar ao próximo salário com tranquilidade." : "Os compromissos passam do que entra. Vale ajustar antes de assumir mais."}</div>
          <div className="health-meter">
            <div className="meter-header"><span>folga até a próxima entrada</span><strong>{Math.max(0, Math.round((projectedBalance / Math.max(nextSalary, 1)) * 100))}%</strong></div>
            <div className="meter-track"><div className={`meter-fill fill-${health}`} style={{ width: `${Math.min(100, Math.max(4, (projectedBalance / Math.max(nextSalary, 1)) * 100))}%` }} /></div>
            <div className="meter-scale"><span>apertado</span><span>equilibrado</span><span>tranquilo</span></div>
          </div>
          <div className="tip-box"><CircleHelp size={16} /><span>O valor acima já considera as contas que ainda não venceram. É o número mais seguro para decidir uma compra.</span></div>
        </section>
      </div>
    </div>
  );
}

function CalendarView({ launches, onTogglePaid }: { launches: Launch[]; onTogglePaid: (id: string) => void }) {
  const [calendarDate, setCalendarDate] = useState(new Date(2026, 8, 1));
  const [selectedDay, setSelectedDay] = useState(22);
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay();
  const days = Array.from({ length: firstWeekday + daysInMonth }, (_, index) => index < firstWeekday ? null : index - firstWeekday + 1);
  const eventsForDay = launches.filter((launch) => launch.type !== "entrada" && launch.day === selectedDay);
  const incomeDays = launches.filter((launch) => launch.type === "entrada").map((launch) => launch.day);
  const monthTotal = launches.filter((launch) => launch.type !== "entrada").reduce((sum, launch) => sum + launch.amount, 0);

  const changeMonth = (offset: number) => {
    setCalendarDate(new Date(year, month + offset, 1));
    setSelectedDay(1);
  };

  return (
    <div className="page-stack page-enter">
      <SectionTitle eyebrow="organize sem esquecer" title="Calendário de vencimentos" detail="Veja o que sai, quando sai e marque o que já foi pago." />
      <div className="calendar-layout">
        <section className="panel calendar-panel">
          <div className="calendar-toolbar">
            <div className="month-switcher">
              <button className="icon-button" type="button" aria-label="Mês anterior" onClick={() => changeMonth(-1)}><ChevronLeft size={17} /></button>
              <h2>{monthLabel(calendarDate)}</h2>
              <button className="icon-button" type="button" aria-label="Próximo mês" onClick={() => changeMonth(1)}><ChevronRight size={17} /></button>
            </div>
            <div className="calendar-legend"><span><i className="dot dot-yellow" /> conta</span><span><i className="dot dot-coral" /> parcela</span></div>
          </div>
          <div className="calendar-grid weekday-row">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div>
          <div className="calendar-grid day-grid">
            {days.map((day, index) => {
              const dayEvents = day ? launches.filter((launch) => launch.type !== "entrada" && launch.day === day) : [];
              const total = dayEvents.reduce((sum, launch) => sum + launch.amount, 0);
              const isToday = day === DEMO_TODAY.getDate() && month === DEMO_TODAY.getMonth() && year === DEMO_TODAY.getFullYear();
              const isSelected = day === selectedDay;
              return (
                <button key={`${day ?? "empty"}-${index}`} className={`calendar-day ${!day ? "empty-day" : ""} ${isSelected ? "selected-day" : ""} ${isToday ? "today-day" : ""}`} type="button" onClick={() => day && setSelectedDay(day)} disabled={!day}>
                  {day && <><span className="day-number">{day}</span>{incomeDays.includes(day) && <span className="income-marker"><ArrowDownLeft size={10} /></span>}{dayEvents.length > 0 && <span className="day-events"><i className={dayEvents.some((event) => event.type === "parcela") ? "dot dot-coral" : "dot dot-yellow"} /><small>{money(total)}</small></span>}</>}
                </button>
              );
            })}
          </div>
          <div className="calendar-foot"><span><span className="today-key" /> hoje</span><span>{money(monthTotal)} comprometidos no mês</span></div>
        </section>

        <aside className="panel selected-day-panel">
          <div className="selected-day-top"><div><span className="eyebrow">detalhes do dia</span><h2>{String(selectedDay).padStart(2, "0")} de {MONTH_NAMES[month]}</h2></div><div className="day-total">{money(eventsForDay.reduce((sum, launch) => sum + launch.amount, 0))}</div></div>
          {eventsForDay.length === 0 ? <div className="empty-state"><CalendarDays size={26} /><strong>Nada vencendo por aqui</strong><span>Um dia mais leve para você.</span></div> : <div className="day-detail-list">{eventsForDay.map((launch) => <div className="day-detail-row" key={launch.id}><div className={`detail-icon detail-${launch.type}`}><ReceiptText size={16} /></div><div className="detail-main"><strong>{launch.name}</strong><span><LaunchTypePill type={launch.type} /> {launch.type === "parcela" ? `${launch.installmentsRemaining} parcelas restantes` : "recorrente"}</span></div><div className="detail-side"><strong>{money(launch.amount)}</strong><button className={`paid-toggle ${launch.status === "paid" ? "is-paid" : ""}`} type="button" onClick={() => onTogglePaid(launch.id)}>{launch.status === "paid" ? <><Check size={12} /> paga</> : "marcar paga"}</button></div></div>)}</div>}
          <div className="selected-day-note"><Bell size={15} /><span>Você pode marcar como paga direto aqui. Isso fica salvo neste navegador.</span></div>
        </aside>
      </div>
    </div>
  );
}

function SimulatorView() {
  const [purchaseAmount, setPurchaseAmount] = useState("1200");
  const [installments, setInstallments] = useState("8");
  const [startDate, setStartDate] = useState("2026-10-01");
  const income = 3800;
  const fixed = 1658;
  const currentInstallments = 340;
  const baseMargin = income - fixed - currentInstallments;
  const parsedAmount = Math.max(0, Number(purchaseAmount) || 0);
  const parsedInstallments = Math.max(1, Number(installments) || 1);
  const monthlyInstallment = parsedAmount / parsedInstallments;
  const start = new Date(`${startDate}T12:00:00`);
  const projection = useMemo(() => Array.from({ length: 8 }, (_, index) => {
    const date = new Date(start.getFullYear(), start.getMonth() + index, 1);
    const active = index < parsedInstallments;
    return { label: `${MONTH_NAMES[date.getMonth()].slice(0, 3)} ${String(date.getFullYear()).slice(2)}`, balance: baseMargin - (active ? monthlyInstallment : 0), active };
  }), [baseMargin, monthlyInstallment, parsedInstallments, start.getFullYear(), start.getMonth()]);
  const lowest = Math.min(...projection.map((item) => item.balance));
  const lowestMonth = projection.find((item) => item.balance === lowest)?.label ?? "próximo mês";
  const result = lowest < 0 ? "danger" : lowest < 600 ? "attention" : "good";
  const resultTitle = result === "danger" ? `Não cabe em ${lowestMonth}.` : result === "attention" ? "Aperta, mas cabe." : "Sim, cabe.";
  const resultText = result === "danger" ? "Essa parcela deixaria seu mês no vermelho. Tente aumentar o número de parcelas ou reduzir o valor." : result === "attention" ? "Você consegue pagar, mas sobra pouco para imprevistos. Vale pensar com calma antes de fechar." : "Depois dessa compra, ainda sobra uma margem saudável todos os meses.";

  return (
    <div className="page-stack page-enter">
      <SectionTitle eyebrow="decida antes de comprar" title="Posso comprar?" detail="Teste uma compra parcelada e veja o impacto antes de passar o cartão." />
      <div className="simulator-layout">
        <section className="panel simulator-form-panel">
          <div className="panel-heading"><div><span className="eyebrow">nova compra</span><h2>Coloque os detalhes</h2></div><div className="form-badge"><WalletCards size={15} /> sem julgamento</div></div>
          <form className="purchase-form" onSubmit={(event: FormEvent) => event.preventDefault()}>
            <label>valor da compra<span className="input-wrap"><span>R$</span><input type="number" min="0" step="10" value={purchaseAmount} onChange={(event) => setPurchaseAmount(event.target.value)} /></span></label>
            <div className="form-two-col"><label>número de parcelas<select value={installments} onChange={(event) => setInstallments(event.target.value)}>{[1, 2, 3, 4, 5, 6, 8, 10, 12, 18, 24].map((value) => <option value={value} key={value}>{value}x de {money(parsedAmount / value)}</option>)}</select></label><label>primeira parcela<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label></div>
            <div className="form-summary"><div><span>valor de cada parcela</span><strong>{money(monthlyInstallment)}</strong></div><div><span>comprometimento da renda</span><strong>{Math.round((monthlyInstallment / income) * 100)}%</strong></div></div>
            <div className="form-note"><CircleHelp size={15} /><span>A conta considera suas entradas, contas fixas e parcelas já cadastradas.</span></div>
          </form>
        </section>
        <section className={`panel simulation-result result-${result}`}>
          <div className="result-top"><span className="eyebrow">resposta direta</span><div className="result-icon">{result === "good" ? <Check size={23} /> : result === "attention" ? <span>!</span> : <X size={23} />}</div></div>
          <h2>{resultTitle}</h2><p>{resultText}</p>
          <div className="projection-chart"><div className="chart-title"><span>saldo projetado por mês</span><span>sem a compra: {money(baseMargin)}</span></div><div className="bars">{projection.map((item) => <div className="bar-column" key={item.label}><div className={`bar-value ${item.balance < 0 ? "negative" : ""}`} style={{ height: `${Math.max(15, Math.min(100, Math.abs(item.balance) / 25))}%` }}><span>{money(item.balance)}</span></div><span className="bar-label">{item.label}</span></div>)}</div><div className="chart-zero"><span /> linha de segurança</div></div>
          <div className="result-footer"><div><span>menor saldo previsto</span><strong className={lowest < 0 ? "negative-text" : ""}>{money(lowest)}</strong></div><div><span>última parcela</span><strong>{projection[Math.min(parsedInstallments - 1, projection.length - 1)]?.label}</strong></div></div>
        </section>
      </div>
      <div className="simulator-tip"><Sparkles size={17} /><div><strong>Uma compra boa é aquela que continua cabendo depois da empolgação.</strong><span>Se quiser, compare cenários mudando o número de parcelas acima.</span></div></div>
    </div>
  );
}

function AddLaunchModal({ onClose, onAdd }: { onClose: () => void; onAdd: (launch: Launch) => void }) {
  const [type, setType] = useState<LaunchType>("conta");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [day, setDay] = useState("10");
  const [installments, setInstallments] = useState("6");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !Number(amount)) return toast.error("Preencha nome e valor para continuar.");
    onAdd({ id: `launch-${Date.now()}`, type, name: name.trim(), amount: Number(amount), day: Math.min(31, Math.max(1, Number(day) || 1)), status: "pending", ...(type === "parcela" ? { installmentsRemaining: Number(installments) || 1 } : {}) });
    toast.success("Lançamento adicionado.");
    onClose();
  };
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-header"><div><span className="eyebrow">novo registro</span><h2 id="modal-title">Adicionar lançamento</h2></div><button className="icon-button" type="button" aria-label="Fechar" onClick={onClose}><X size={17} /></button></div><form className="modal-form" onSubmit={submit}><label>tipo<select value={type} onChange={(event) => setType(event.target.value as LaunchType)}><option value="entrada">Entrada</option><option value="conta">Conta fixa</option><option value="parcela">Parcela</option></select></label><label>nome<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: condomínio" /></label><div className="form-two-col"><label>valor mensal<span className="input-wrap"><span>R$</span><input type="number" min="0" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0" /></span></label><label>dia do vencimento<input type="number" min="1" max="31" value={day} onChange={(event) => setDay(event.target.value)} /></label></div>{type === "parcela" && <label>parcelas restantes<input type="number" min="1" value={installments} onChange={(event) => setInstallments(event.target.value)} /></label>}<button className="primary-button modal-submit" type="submit"><Plus size={17} /> adicionar lançamento</button></form></div></div>;
}

export default function Home() {
  const [view, setView] = useState<View>("overview");
  const [launches, setLaunches] = useStoredLaunches();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const incomeReceived = launches.filter((launch) => launch.type === "entrada" && launch.day <= DEMO_TODAY.getDate()).reduce((sum, launch) => sum + launch.amount, 0);
  const pastExpenses = launches.filter((launch) => launch.type !== "entrada" && launch.day <= DEMO_TODAY.getDate()).reduce((sum, launch) => sum + launch.amount, 0);
  const upcomingExpenses = launches.filter((launch) => launch.type !== "entrada" && launch.day > DEMO_TODAY.getDate()).reduce((sum, launch) => sum + launch.amount, 0);
  const currentBalance = incomeReceived - pastExpenses;
  const projectedBalance = currentBalance - upcomingExpenses;
  const nextSalary = launches.filter((launch) => launch.type === "entrada").reduce((sum, launch) => sum + launch.amount, 0);
  const navigate = (nextView: View) => { setView(nextView); setMobileNavOpen(false); };
  const addLaunch = (launch: Launch) => setLaunches((current) => [...current, launch]);
  const togglePaid = (id: string) => setLaunches((current) => current.map((launch) => launch.id === id ? { ...launch, status: launch.status === "paid" ? "pending" : "paid" } : launch));
  const viewLabel = view === "overview" ? "Visão geral" : view === "calendar" ? "Vencimentos" : "Posso comprar?";

  return <div className="app-shell">
    <div className="background-glow glow-left" /><div className="background-glow glow-right" />
    <aside className={`sidebar ${mobileNavOpen ? "sidebar-open" : ""}`}>
      <div className="sidebar-top"><AppLogo /><button className="mobile-close" type="button" aria-label="Fechar menu" onClick={() => setMobileNavOpen(false)}><X size={19} /></button></div>
      <div className="sidebar-caption">seu dinheiro, sem mistério</div>
      <nav className="main-nav"><NavButton active={view === "overview"} icon={<WalletCards size={18} />} label="Visão geral" onClick={() => navigate("overview")} /><NavButton active={view === "calendar"} icon={<CalendarDays size={18} />} label="Vencimentos" onClick={() => navigate("calendar")} /><NavButton active={view === "simulator"} icon={<CreditCard size={18} />} label="Posso comprar?" onClick={() => navigate("simulator")} /></nav>
      <div className="sidebar-spacer" />
      <div className="sidebar-insight"><div className="insight-icon"><Sparkles size={16} /></div><strong>Regra de ouro</strong><p>Nunca olhe só o saldo de hoje. O que está para vencer também já tem destino.</p></div>
      <div className="sidebar-bottom"><span className="local-badge"><span /> salvo neste navegador</span><span className="version-label">protótipo · v0.1</span></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><button className="mobile-menu" type="button" aria-label="Abrir menu" onClick={() => setMobileNavOpen(true)}><Menu size={20} /></button><div className="breadcrumb"><span>Meu Dinheiro</span><ArrowRight size={14} /><strong>{viewLabel}</strong></div><div className="topbar-actions"><span className="today-label">segunda, 21 set 2026</span><button className="notification-button" type="button" aria-label="Notificações"><Bell size={17} /><span /></button><button className="avatar" type="button" aria-label="Abrir painel de gestão" onClick={() => { window.location.href = "/admin"; }}>MP</button></div></header>
      <div className="content-wrap">
        {view === "overview" && <Overview launches={launches} projectedBalance={projectedBalance} currentBalance={currentBalance} nextSalary={nextSalary} onNavigate={navigate} onOpenAdd={() => setIsModalOpen(true)} />}
        {view === "calendar" && <CalendarView launches={launches} onTogglePaid={togglePaid} />}
        {view === "simulator" && <SimulatorView />}
      </div>
    </main>
    {isModalOpen && <AddLaunchModal onClose={() => setIsModalOpen(false)} onAdd={addLaunch} />}
  </div>;
}
