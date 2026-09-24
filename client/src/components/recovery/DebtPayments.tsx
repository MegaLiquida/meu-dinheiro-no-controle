import { FormEvent, useEffect, useState } from "react";
import { Banknote, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { api, type Debt, type DebtPayment, type PaymentSource } from "../../lib/api";
import { money } from "./DebtMap";

const sources: Record<PaymentSource, string> = { manual: "registro manual", bank_transfer: "transferência", cash: "dinheiro", card: "cartão", payroll: "desconto em folha", other: "outro" };
const today = new Date().toISOString().slice(0, 10);

export default function DebtPayments({ debts, selectedId, onSelect, onChanged }: { debts: Debt[]; selectedId: string | null; onSelect: (id: string) => void; onChanged: () => Promise<void> }) {
  const [payments, setPayments] = useState<DebtPayment[]>([]);
  const [form, setForm] = useState({ amount: "", paidOn: today, source: "manual" as PaymentSource, proofReference: "", confirmOverpayment: false });
  const [loading, setLoading] = useState(false);
  const debt = debts.find((item) => item.id === selectedId) ?? null;
  async function load() { if (!selectedId) { setPayments([]); return; } setLoading(true); try { setPayments((await api.debtPayments(selectedId)).payments); } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Não foi possível carregar os pagamentos."); } finally { setLoading(false); } }
  useEffect(() => { void load(); }, [selectedId]);
  const amount = Number(form.amount) || 0;
  const exceeds = Boolean(debt && amount > debt.balance);

  async function submit(event: FormEvent) {
    event.preventDefault(); if (!debt) return;
    try { const result = await api.addDebtPayment(debt.id, { amount, paidOn: form.paidOn, source: form.source, proofReference: form.proofReference.trim() || null, confirmOverpayment: form.confirmOverpayment }); toast.success(result.balanceAfter === 0 ? "Pagamento registrado e saldo zerado." : "Pagamento parcial registrado."); setForm({ amount: "", paidOn: today, source: "manual", proofReference: "", confirmOverpayment: false }); await Promise.all([load(), onChanged()]); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : "Não foi possível registrar o pagamento."); }
  }
  async function reverse(payment: DebtPayment) {
    const reason = window.prompt("Informe o motivo do estorno (mínimo de 3 caracteres):")?.trim();
    if (!reason || reason.length < 3 || !debt) return;
    try { await api.reverseDebtPayment(debt.id, payment.id, reason); toast.success("Pagamento estornado e saldo restaurado."); await Promise.all([load(), onChanged()]); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : "Não foi possível estornar o pagamento."); }
  }

  return <div className="recovery-grid">
    <section className="panel recovery-form-panel"><div className="panel-heading"><div><span className="eyebrow">cada avanço conta</span><h2>Registrar pagamento</h2></div><Banknote size={18} className="sparkle-icon" /></div>
      <label className="standalone-label" htmlFor="payment-debt">dívida<select id="payment-debt" value={selectedId ?? ""} onChange={(event) => onSelect(event.target.value)}><option value="">selecione</option>{debts.map((item) => <option value={item.id} key={item.id}>{item.name} · {money(item.balance)}</option>)}</select></label>
      {!debt ? <div className="empty-state compact"><Banknote size={24} /><strong>Selecione uma dívida</strong><span>O saldo será atualizado a partir do pagamento informado.</span></div> : <form className="compact-form" onSubmit={submit}>
        <div className="balance-before"><span>saldo antes do pagamento</span><strong>{money(debt.balance)}</strong></div>
        <label htmlFor="payment-amount">valor pago<input id="payment-amount" required type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value, confirmOverpayment: false })} aria-invalid={exceeds && !form.confirmOverpayment} aria-describedby={exceeds ? "overpayment-help" : undefined} /></label>
        {exceeds && <label className="overpayment-confirm" id="overpayment-help"><input type="checkbox" checked={form.confirmOverpayment} onChange={(event) => setForm({ ...form, confirmOverpayment: event.target.checked })} /> Confirmo que o valor supera o saldo em {money(amount - debt.balance)}.</label>}
        <div className="form-two-col"><label htmlFor="payment-date">data<input id="payment-date" required type="date" value={form.paidOn} onChange={(event) => setForm({ ...form, paidOn: event.target.value })} /></label><label htmlFor="payment-source">origem<select id="payment-source" value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value as PaymentSource })}>{Object.entries(sources).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label></div>
        <label htmlFor="payment-proof">referência do comprovante<input id="payment-proof" value={form.proofReference} onChange={(event) => setForm({ ...form, proofReference: event.target.value })} placeholder="opcional" /></label>
        <div className="balance-after" role="status"><span>saldo estimado depois</span><strong>{money(Math.max(0, debt.balance - amount))}</strong></div>
        <button className="primary-button" type="submit" disabled={amount <= 0 || (exceeds && !form.confirmOverpayment)}>registrar pagamento</button>
        <p className="legal-note">A dívida só passa a quitada automaticamente quando o saldo chega a zero.</p>
      </form>}
    </section>
    <section className="panel recovery-list-panel"><div className="panel-heading"><div><span className="eyebrow">histórico de saldo</span><h2>Pagamentos</h2></div></div>
      {loading ? <div className="auth-loading" role="status">Carregando pagamentos...</div> : payments.length === 0 ? <div className="empty-state compact"><Banknote size={24} /><strong>Nenhum pagamento registrado</strong><span>Pagamentos parciais ficam aqui com saldo anterior e posterior.</span></div> : <div className="payment-list">{payments.map((payment) => <article className={payment.reversedAt ? "is-reversed" : ""} key={payment.id}><div><strong>{money(payment.amount)}</strong><span>{new Date(`${payment.paidOn}T00:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC" })} · {sources[payment.source]}</span></div><p>{money(payment.balanceBefore)} → <b>{money(payment.balanceAfter)}</b></p>{payment.reversedAt ? <small>Estornado: {payment.reversalReason}</small> : <button type="button" onClick={() => void reverse(payment)}><RotateCcw size={14} /> estornar</button>}</article>)}</div>}
    </section>
  </div>;
}
