import { FormEvent, useEffect, useMemo, useState } from "react";
import { Calculator, Check, RefreshCw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { api, type Debt, type Diagnosis, type RecoveryPlan } from "../../lib/api";
import { money } from "./DebtMap";

export default function RecoveryPlanPanel({ debts }: { debts: Debt[] }) {
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [plans, setPlans] = useState<RecoveryPlan[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [name, setName] = useState("Meu plano de recuperação");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [diagnosisResult, plansResult] = await Promise.all([api.diagnosis(), api.recoveryPlans()]);
      setDiagnosis(diagnosisResult.diagnosis); setPlans(plansResult.recoveryPlans);
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Não foi possível carregar seus planos."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  const eligibleDebts = debts.filter((debt) => debt.status !== "paid" && debt.balance > 0);
  const monthlyTotal = useMemo(() => eligibleDebts.filter((debt) => selected[debt.id]).reduce((sum, debt) => sum + (Number(amounts[debt.id]) || 0), 0), [amounts, eligibleDebts, selected]);
  const selectedDebts = eligibleDebts.filter((debt) => selected[debt.id]);
  const hasInvalidAmount = selectedDebts.some((debt) => (Number(amounts[debt.id]) || 0) <= 0);
  const exceeds = monthlyTotal > (diagnosis?.safeCapacity ?? 0);

  async function create(event: FormEvent) {
    event.preventDefault();
    const items = selectedDebts.map((debt, index) => ({ debtId: debt.id, monthlyAmount: Number(amounts[debt.id]) || 0, dueDay: debt.dueDay ?? null, sequence: index, notes: null }));
    if (!items.length) { toast.error("Selecione ao menos uma dívida para o plano."); return; }
    if (hasInvalidAmount) { toast.error("Informe um valor mensal maior que zero para cada dívida selecionada."); return; }
    try { await api.addRecoveryPlan({ name, status: "draft", startDate: new Date().toISOString().slice(0, 10), items }); toast.success("Plano salvo como rascunho."); setSelected({}); setAmounts({}); await load(); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : "Não foi possível criar o plano."); }
  }

  async function activate(plan: RecoveryPlan) {
    try { await api.activateRecoveryPlan(plan.id); toast.success("Plano ativado dentro da capacidade segura."); await load(); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : "Não foi possível ativar o plano."); }
  }
  async function recalculate(plan: RecoveryPlan) {
    try { await api.recalculateRecoveryPlan(plan.id); toast.success("Plano recalculado com o diagnóstico atual."); await load(); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : "Não foi possível recalcular o plano."); }
  }

  if (loading) return <div className="auth-loading" role="status">Calculando sua capacidade...</div>;
  return <div className="recovery-grid">
    <section className="panel recovery-form-panel"><div className="panel-heading"><div><span className="eyebrow">um valor que caiba</span><h2>Montar plano mensal</h2></div><Calculator size={18} className="sparkle-icon" /></div>
      <div className="capacity-card"><span>capacidade segura disponível</span><strong>{money(diagnosis?.safeCapacity ?? 0)}</strong><small>renda conservadora menos piso essencial, compromissos e margem</small></div>
      <form className="plan-builder" onSubmit={create}><label htmlFor="plan-name">nome do plano<input id="plan-name" required minLength={2} value={name} onChange={(event) => setName(event.target.value)} /></label>
        <fieldset><legend>Dívidas e valores mensais</legend>{eligibleDebts.map((debt) => <div className="plan-debt-row" key={debt.id}><label><input type="checkbox" checked={Boolean(selected[debt.id])} onChange={(event) => setSelected({ ...selected, [debt.id]: event.target.checked })} /> <span><strong>{debt.name}</strong><small>saldo {money(debt.balance)}</small></span></label><input aria-label={`Valor mensal para ${debt.name}`} type="number" min="0" step="0.01" disabled={!selected[debt.id]} value={amounts[debt.id] ?? ""} onChange={(event) => setAmounts({ ...amounts, [debt.id]: event.target.value })} placeholder="R$ por mês" /></div>)}</fieldset>
        <div className={`plan-total ${exceeds || hasInvalidAmount ? "over" : ""}`} role="status"><span>total mensal do plano</span><strong>{money(monthlyTotal)}</strong><small>{hasInvalidAmount ? "Informe um valor mensal maior que zero para cada dívida selecionada." : exceeds ? `Excede a capacidade em ${money(monthlyTotal - (diagnosis?.safeCapacity ?? 0))}. Reduza os valores antes de ativar.` : `Restam ${money(Math.max(0, (diagnosis?.safeCapacity ?? 0) - monthlyTotal))} da capacidade estimada.`}</small></div>
        <button className="primary-button" type="submit" disabled={!selectedDebts.length || hasInvalidAmount}>salvar rascunho</button>
        <p className="legal-note">Quando houver uma negociação aceita para a dívida, o acordo mais recente será vinculado ao plano automaticamente.</p>
        <p className="legal-note"><ShieldAlert size={14} /> A capacidade é uma estimativa operacional conservadora, não mínimo existencial legal.</p>
      </form>
    </section>
    <section className="panel recovery-list-panel"><div className="panel-heading"><div><span className="eyebrow">acompanhar e ajustar</span><h2>Planos salvos</h2></div></div>
      {plans.length === 0 ? <div className="empty-state compact"><Calculator size={24} /><strong>Nenhum plano salvo</strong><span>Monte um rascunho e ative somente quando os valores couberem.</span></div> : <div className="saved-plan-list">{plans.map((plan) => { const over = plan.monthlyTotal > plan.safeCapacity; const linkedAgreements = plan.items.filter((item) => item.acceptedNegotiationId).length; return <article key={plan.id}><div className="saved-plan-head"><div><strong>{plan.name}</strong><span className={`status-badge status-${plan.status}`}>{plan.status === "active" ? "ativo" : plan.status === "draft" ? "rascunho" : plan.status}</span></div><b>{money(plan.monthlyTotal)}/mês</b></div><p>{plan.items.length} dívida{plan.items.length === 1 ? "" : "s"} · capacidade registrada {money(plan.safeCapacity)}{linkedAgreements ? ` · ${linkedAgreements} acordo aceito vinculado` : ""}</p>{over && <div className="inline-warning" role="alert">O plano excede a capacidade atual e não pode ser ativado.</div>}<div className="saved-plan-actions"><button type="button" onClick={() => void recalculate(plan)}><RefreshCw size={14} /> recalcular</button>{plan.status !== "active" && <button type="button" disabled={over} onClick={() => void activate(plan)}><Check size={14} /> ativar</button>}</div></article>; })}</div>}
    </section>
  </div>;
}
