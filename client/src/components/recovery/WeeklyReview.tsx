import { FormEvent, useEffect, useMemo, useState } from "react";
import { Check, ClipboardCheck, Plus } from "lucide-react";
import { toast } from "sonner";
import { api, type Debt, type WeeklyReview as WeeklyReviewData } from "../../lib/api";

const today = new Date().toISOString().slice(0, 10);
function mondayOfWeek() { const date = new Date(`${today}T00:00:00Z`); const day = date.getUTCDay(); date.setUTCDate(date.getUTCDate() - (day === 0 ? 6 : day - 1)); return date.toISOString().slice(0, 10); }

export default function WeeklyReview({ debts, compact = false, onChanged }: { debts: Debt[]; compact?: boolean; onChanged?: () => void }) {
  const [reviews, setReviews] = useState<WeeklyReviewData[]>([]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [summary, setSummary] = useState("");
  const [balance, setBalance] = useState("");
  const [action, setAction] = useState({ title: "", detail: "", debtId: "", dueDate: "" });
  const [saving, setSaving] = useState(false);
  const checklist = ["Conferi o saldo disponível", "Revisei os próximos vencimentos", "Escolhi um próximo passo possível"];
  async function load() { try { setReviews((await api.weeklyReviews()).weeklyReviews); } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Não foi possível carregar as revisões."); } }
  useEffect(() => { void load(); }, []);
  const weekStart = mondayOfWeek();
  const current = useMemo(() => reviews.find((review) => review.weekStart === weekStart), [reviews, weekStart]);
  const allChecked = checklist.every((_, index) => checked[String(index)]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!allChecked) { toast.error("Conclua os três pontos do checklist para finalizar a revisão."); return; }
    setSaving(true);
    try {
      const actions = action.title.trim() ? [{ title: action.title.trim(), detail: action.detail.trim() || null, debtId: action.debtId || null, dueDate: action.dueDate || null }] : [];
      if (current) await api.updateWeeklyReview(current.id, { status: "resolved", summary: summary.trim() || current.summary, balanceSnapshot: balance === "" ? current.balanceSnapshot : Number(balance), actions });
      else await api.addWeeklyReview({ weekStart, status: "resolved", summary: summary.trim() || null, balanceSnapshot: balance === "" ? null : Number(balance), actions });
      toast.success("Revisão da semana concluída."); setSummary(""); setBalance(""); setAction({ title: "", detail: "", debtId: "", dueDate: "" }); await load(); onChanged?.();
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Não foi possível salvar a revisão."); }
    finally { setSaving(false); }
  }

  if (compact && current?.status === "resolved") return <div className="weekly-complete"><Check size={16} /><span>Revisão desta semana concluída.</span></div>;
  return <section className={`panel weekly-review ${compact ? "weekly-review-compact" : ""}`}><div className="panel-heading"><div><span className="eyebrow">pausa de poucos minutos</span><h2>Revisão semanal</h2></div><ClipboardCheck size={18} className="sparkle-icon" /></div>
    <form onSubmit={submit}><fieldset className="review-checklist"><legend>Checklist desta semana</legend>{checklist.map((label, index) => <label key={label}><input type="checkbox" checked={Boolean(checked[String(index)])} onChange={(event) => setChecked({ ...checked, [String(index)]: event.target.checked })} /> <span>{label}</span></label>)}</fieldset>
      {!compact && <><div className="form-two-col"><label htmlFor="review-balance">saldo conferido<input id="review-balance" type="number" step="0.01" value={balance} onChange={(event) => setBalance(event.target.value)} /></label><label htmlFor="review-summary">resumo da semana<input id="review-summary" value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="O que mudou?" /></label></div><div className="review-action-builder"><strong><Plus size={14} /> Criar uma ação (opcional)</strong><label htmlFor="review-action">próximo passo<input id="review-action" value={action.title} onChange={(event) => setAction({ ...action, title: event.target.value })} placeholder="Ex.: ligar para o credor" /></label><div className="form-two-col"><label htmlFor="review-debt">vincular à dívida<select id="review-debt" value={action.debtId} onChange={(event) => setAction({ ...action, debtId: event.target.value })}><option value="">sem vínculo</option>{debts.map((debt) => <option value={debt.id} key={debt.id}>{debt.name}</option>)}</select></label><label htmlFor="review-due">prazo<input id="review-due" type="date" value={action.dueDate} onChange={(event) => setAction({ ...action, dueDate: event.target.value })} /></label></div><label htmlFor="review-detail">detalhe<textarea id="review-detail" value={action.detail} onChange={(event) => setAction({ ...action, detail: event.target.value })} /></label></div></>}
      <button className="primary-button" type="submit" disabled={!allChecked || saving}><Check size={15} /> {saving ? "salvando..." : current ? "atualizar revisão" : "concluir revisão"}</button>
    </form>
  </section>;
}
