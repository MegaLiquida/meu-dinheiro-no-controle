import { FormEvent, useMemo, useState } from "react";
import { ChevronDown, HandCoins, Plus } from "lucide-react";
import { toast } from "sonner";
import { api, type Debt, type DebtInput } from "../../lib/api";

const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const priorityLabels = { essential: "essencial", high: "alta", normal: "normal", low: "baixa" } as const;
const emptyForm = { name: "", creditor: "", balance: "", installment: "", priority: "normal" as Debt["priority"], debtType: "", dueDate: "", dueDay: "", originalAmount: "", interestRate: "", totalCostRate: "", remainingInstallments: "", secured: "unknown", contractReference: "", collectionChannel: "", negativeListing: "unknown", notes: "" };

function completion(debt: Debt) {
  const fields = [debt.creditor, debt.originalAmount, debt.debtType, debt.dueDate, debt.interestRate, debt.totalCostRate, debt.remainingInstallments, debt.secured, debt.contractReference, debt.collectionChannel, debt.negativeListing];
  const informed = fields.filter((value) => value !== null && value !== undefined && value !== "").length;
  return Math.round((informed / fields.length) * 100);
}

export default function DebtMap({ debts, selectedId, onSelect, onChanged, onNext }: { debts: Debt[]; selectedId: string | null; onSelect: (id: string) => void; onChanged: () => Promise<void>; onNext: () => void }) {
  const [form, setForm] = useState(emptyForm);
  const [advanced, setAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const openDebts = useMemo(() => debts.filter((debt) => debt.status !== "paid"), [debts]);

  async function addDebt(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    const nullableNumber = (value: string) => value === "" ? null : Number(value);
    const payload: DebtInput = {
      name: form.name.trim(), creditor: form.creditor.trim() || null, balance: Number(form.balance), installment: Number(form.installment) || 0,
      priority: form.priority, status: "open", debtType: form.debtType.trim() || null, dueDate: form.dueDate || null, dueDay: nullableNumber(form.dueDay),
      originalAmount: nullableNumber(form.originalAmount), interestRate: nullableNumber(form.interestRate), totalCostRate: nullableNumber(form.totalCostRate),
      remainingInstallments: nullableNumber(form.remainingInstallments), secured: form.secured === "unknown" ? null : form.secured === "yes",
      contractReference: form.contractReference.trim() || null, collectionChannel: form.collectionChannel.trim() || null,
      negativeListing: form.negativeListing === "unknown" ? null : form.negativeListing === "yes", notes: form.notes.trim() || null,
    };
    try {
      const result = await api.addDebt(payload);
      toast.success("Dívida adicionada ao mapa.");
      setForm(emptyForm); setAdvanced(false); onSelect(result.debt.id); await onChanged();
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Não foi possível adicionar a dívida."); }
    finally { setSaving(false); }
  }

  return <div className="recovery-grid">
    <section className="panel recovery-form-panel"><div className="panel-heading"><div><span className="eyebrow">comece com o que sabe</span><h2>Adicionar dívida</h2></div></div>
      <form className="compact-form" onSubmit={addDebt}>
        <label htmlFor="debt-name">nome da dívida<input id="debt-name" required minLength={2} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ex.: cartão principal" /></label>
        <label htmlFor="debt-creditor">credor<input id="debt-creditor" value={form.creditor} onChange={(event) => setForm({ ...form, creditor: event.target.value })} placeholder="Banco ou empresa, se souber" /></label>
        <div className="form-two-col"><label htmlFor="debt-balance">saldo devedor<input id="debt-balance" required type="number" min="0" step="0.01" value={form.balance} onChange={(event) => setForm({ ...form, balance: event.target.value })} /></label><label htmlFor="debt-installment">parcela atual<input id="debt-installment" type="number" min="0" step="0.01" value={form.installment} onChange={(event) => setForm({ ...form, installment: event.target.value })} /></label></div>
        <label htmlFor="debt-priority">prioridade informada por você<select id="debt-priority" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as Debt["priority"] })}>{Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <button className="disclosure-button" type="button" aria-expanded={advanced} onClick={() => setAdvanced((value) => !value)}>Detalhes que melhoram a ordem de atenção <ChevronDown size={16} className={advanced ? "rotate" : ""} /></button>
        {advanced && <div className="advanced-debt-fields">
          <div className="form-two-col"><label htmlFor="debt-type">tipo<input id="debt-type" value={form.debtType} onChange={(event) => setForm({ ...form, debtType: event.target.value })} placeholder="cartão, financiamento..." /></label><label htmlFor="debt-due-date">vencimento/atraso desde<input id="debt-due-date" type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} /></label></div>
          <div className="form-two-col"><label htmlFor="debt-original">valor original<input id="debt-original" type="number" min="0" step="0.01" value={form.originalAmount} onChange={(event) => setForm({ ...form, originalAmount: event.target.value })} /></label><label htmlFor="debt-remaining">parcelas restantes<input id="debt-remaining" type="number" min="0" max="600" value={form.remainingInstallments} onChange={(event) => setForm({ ...form, remainingInstallments: event.target.value })} /></label></div>
          <div className="form-two-col"><label htmlFor="debt-interest">juros conhecidos (% a.m.)<input id="debt-interest" type="number" min="0" step="0.01" value={form.interestRate} onChange={(event) => setForm({ ...form, interestRate: event.target.value })} /></label><label htmlFor="debt-total-cost">custo total conhecido (%)<input id="debt-total-cost" type="number" min="0" step="0.01" value={form.totalCostRate} onChange={(event) => setForm({ ...form, totalCostRate: event.target.value })} /></label></div>
          <div className="form-two-col"><label htmlFor="debt-secured">tem garantia?<select id="debt-secured" value={form.secured} onChange={(event) => setForm({ ...form, secured: event.target.value })}><option value="unknown">não informado</option><option value="yes">sim</option><option value="no">não</option></select></label><label htmlFor="debt-negative">há negativação?<select id="debt-negative" value={form.negativeListing} onChange={(event) => setForm({ ...form, negativeListing: event.target.value })}><option value="unknown">não informado</option><option value="yes">sim</option><option value="no">não</option></select></label></div>
          <div className="form-two-col"><label htmlFor="debt-reference">referência do contrato<input id="debt-reference" value={form.contractReference} onChange={(event) => setForm({ ...form, contractReference: event.target.value })} /></label><label htmlFor="debt-channel">canal de cobrança<input id="debt-channel" value={form.collectionChannel} onChange={(event) => setForm({ ...form, collectionChannel: event.target.value })} /></label></div>
          <label htmlFor="debt-notes">observações<textarea id="debt-notes" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
        </div>}
        <button className="primary-button" type="submit" disabled={saving}><Plus size={16} /> {saving ? "salvando..." : "adicionar ao mapa"}</button>
      </form>
    </section>
    <section className="panel recovery-list-panel"><div className="panel-heading"><div><span className="eyebrow">prioridade explicável</span><h2>Mapa atual</h2></div><HandCoins size={18} className="sparkle-icon" /></div>
      {debts.length === 0 ? <div className="empty-state compact"><HandCoins size={24} /><strong>Nenhuma dívida cadastrada</strong><span>Não precisa ter todos os dados para começar.</span></div> : <div className="recovery-debt-list">{[...debts].sort((a, b) => (a.prioritization?.rank ?? 999) - (b.prioritization?.rank ?? 999)).map((debt) => <button type="button" key={debt.id} className={`recovery-debt-card ${selectedId === debt.id ? "selected" : ""}`} onClick={() => onSelect(debt.id)} aria-pressed={selectedId === debt.id}>
        <div className="debt-card-top"><span className="rank-badge">#{debt.prioritization?.rank ?? "—"}</span><div><strong>{debt.name}</strong><small>{debt.creditor || "credor não informado"}</small></div><b>{money(debt.balance)}</b></div>
        <div className="debt-card-meta"><span className={`priority-pill priority-${debt.priority}`}>{priorityLabels[debt.priority]}</span><span>{completion(debt)}% dos detalhes informados</span><span>{debt.status === "paid" ? "saldo quitado" : debt.status === "negotiating" ? "em negociação" : "aberta"}</span></div>
        <div className="completion-track" aria-label={`${completion(debt)}% dos detalhes informados`}><span style={{ width: `${completion(debt)}%` }} /></div>
        <p>{debt.prioritization?.reasons?.length ? debt.prioritization.reasons.join("; ") : "Ainda faltam dados para explicar melhor a prioridade. Nada foi presumido."}</p>
      </button>)}</div>}
      {openDebts.length > 0 && <button className="secondary-admin-button recovery-next" type="button" onClick={onNext}>registrar negociação da selecionada</button>}
    </section>
  </div>;
}

export { money };
