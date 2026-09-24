import { useEffect, useMemo, useState } from "react";
import { Banknote, Handshake, Map, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { api, type Debt } from "../lib/api";
import DebtMap, { money } from "../components/recovery/DebtMap";
import DebtNegotiations from "../components/recovery/DebtNegotiations";
import RecoveryPlanPanel from "../components/recovery/RecoveryPlanPanel";
import DebtPayments from "../components/recovery/DebtPayments";
import WeeklyReview from "../components/recovery/WeeklyReview";

type RecoveryTab = "map" | "negotiation" | "plan" | "payments";
const tabs: Array<{ id: RecoveryTab; label: string; detail: string; icon: typeof Map }> = [
  { id: "map", label: "Mapa", detail: "entender e priorizar", icon: Map },
  { id: "negotiation", label: "Negociação", detail: "registrar propostas", icon: Handshake },
  { id: "plan", label: "Plano", detail: "definir valores possíveis", icon: RefreshCw },
  { id: "payments", label: "Pagamentos", detail: "acompanhar o saldo", icon: Banknote },
];

export default function Debts({ initialDebtId = null }: { initialDebtId?: string | null }) {
  const [debts, setDebts] = useState<Debt[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(initialDebtId);
  const [tab, setTab] = useState<RecoveryTab>(initialDebtId ? "negotiation" : "map");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  async function reload() {
    setError(null);
    try {
      const result = await api.debts(); setDebts(result.debts);
      setSelectedId((current) => current && result.debts.some((debt) => debt.id === current) ? current : result.debts.find((debt) => debt.status !== "paid")?.id ?? result.debts[0]?.id ?? null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar suas dívidas."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void reload(); }, []);
  useEffect(() => { if (initialDebtId) { setSelectedId(initialDebtId); setTab("negotiation"); } }, [initialDebtId]);
  const open = useMemo(() => debts.filter((debt) => debt.status !== "paid"), [debts]);
  const total = open.reduce((sum, debt) => sum + debt.balance, 0);
  const selected = debts.find((debt) => debt.id === selectedId);

  if (loading) return <div className="page-stack"><div className="auth-loading" role="status">Carregando sua jornada de recuperação...</div></div>;
  if (error) return <div className="persistent-error" role="alert"><strong>Não foi possível abrir sua jornada de dívidas.</strong><span>{error}</span><button className="primary-button" type="button" onClick={() => { setLoading(true); void reload(); }}>Tentar novamente</button></div>;
  return <div className="page-stack page-enter">
    <div className="section-heading"><div><div className="eyebrow">recuperar com passos possíveis</div><h1>Jornada de dívidas</h1></div><p className="section-detail">Organize o que existe, registre conversas e pague no ritmo que sua realidade comporta.</p></div>
    <section className="debt-summary"><div className="debt-summary-copy"><span className="eyebrow">sem julgamento e sem promessas</span><h2>{selected ? `Próximo foco: ${selected.name}` : "Comece mapeando uma dívida."}</h2><p>{selected?.prioritization?.reasons?.length ? selected.prioritization.reasons.join("; ") : "A prioridade usa apenas os dados informados. Campos ausentes permanecem ausentes."}</p></div><div className="debt-summary-metrics"><div><span>dívidas abertas</span><strong>{open.length}</strong></div><div><span>saldo conhecido</span><strong>{money(total)}</strong></div><div><span>selecionada</span><strong>{selected?.prioritization?.rank ? `#${selected.prioritization.rank}` : "—"}</strong></div></div></section>
    <nav className="recovery-tabs" aria-label="Etapas da jornada de dívidas">{tabs.map((item) => { const Icon = item.icon; return <button type="button" key={item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)} aria-current={tab === item.id ? "step" : undefined}><Icon size={18} /><span><strong>{item.label}</strong><small>{item.detail}</small></span></button>; })}</nav>
    {tab === "map" && <DebtMap debts={debts} selectedId={selectedId} onSelect={setSelectedId} onChanged={reload} onNext={() => setTab("negotiation")} />}
    {tab === "negotiation" && <DebtNegotiations debts={debts} selectedId={selectedId} onSelect={setSelectedId} onChanged={reload} />}
    {tab === "plan" && <RecoveryPlanPanel debts={debts} />}
    {tab === "payments" && <DebtPayments debts={debts} selectedId={selectedId} onSelect={setSelectedId} onChanged={reload} />}
    <WeeklyReview debts={debts} />
  </div>;
}

export function showDebtLoadError(error: unknown) { toast.error(error instanceof Error ? error.message : "Não foi possível carregar suas dívidas."); }
