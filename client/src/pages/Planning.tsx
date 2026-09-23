import { FormEvent, useEffect, useState } from "react";
import { CalendarDays, Check, CreditCard, Plus, Power, ReceiptText, Repeat2 } from "lucide-react";
import { toast } from "sonner";
import { api, type Purchase, type RecurringCommitment } from "../lib/api";

const today = new Date().toISOString().slice(0, 10);
const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const shortDate = (value: string) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`)).replace(".", "");

export default function Planning() {
  const [recurring, setRecurring] = useState<RecurringCommitment[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [recurringForm, setRecurringForm] = useState({ kind: "conta" as "entrada" | "conta", name: "", amount: "", dueDay: "10", startDate: today, category: "" });
  const [purchaseForm, setPurchaseForm] = useState({ name: "", totalAmount: "", installmentCount: "6", firstDueDate: today, category: "" });

  async function reload() {
    try {
      const [recurringResult, purchaseResult] = await Promise.all([api.recurring(), api.purchases()]);
      setRecurring(recurringResult.recurring); setPurchases(purchaseResult.purchases);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível carregar seu planejamento."); }
    finally { setLoading(false); }
  }
  useEffect(() => { reload(); }, []);

  async function addRecurring(event: FormEvent) {
    event.preventDefault();
    try { await api.addRecurring({ ...recurringForm, amount: Number(recurringForm.amount), dueDay: Number(recurringForm.dueDay), category: recurringForm.category || null }); toast.success("Compromisso recorrente criado e próximos vencimentos gerados."); setRecurringForm({ ...recurringForm, name: "", amount: "", category: "" }); await reload(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível criar a recorrência."); }
  }
  async function addPurchase(event: FormEvent) {
    event.preventDefault();
    try { await api.addPurchase({ name: purchaseForm.name, totalAmount: Number(purchaseForm.totalAmount), installmentCount: Number(purchaseForm.installmentCount), firstDueDate: purchaseForm.firstDueDate, category: purchaseForm.category || null }); toast.success("Compra criada com todas as parcelas."); setPurchaseForm({ ...purchaseForm, name: "", totalAmount: "", category: "" }); await reload(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível criar a compra."); }
  }
  async function toggle(item: RecurringCommitment) {
    try { await api.updateRecurring(item.id, !item.active); toast.success(item.active ? "Recorrência pausada." : "Recorrência ativada."); await reload(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível atualizar a recorrência."); }
  }
  async function toggleInstallment(id: string, status: "pending" | "paid") {
    try { await api.updatePurchaseInstallment(id, status === "paid" ? "pending" : "paid"); toast.success(status === "paid" ? "Parcela reaberta." : "Parcela paga."); await reload(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível atualizar a parcela."); }
  }

  if (loading) return <div className="page-stack"><div className="auth-loading">Carregando seu planejamento...</div></div>;
  return <div className="page-stack page-enter"><div className="section-heading"><div><div className="eyebrow">planejar sem repetir trabalho</div><h1>Compromissos e compras</h1></div><p className="section-detail">Cadastre uma vez. O sistema organiza os próximos meses para você.</p></div><div className="planning-forms"><section className="panel planning-form-panel"><div className="panel-heading"><div><span className="eyebrow">entra ou sai todo período</span><h2><Repeat2 size={17} /> Recorrência</h2></div></div><form className="compact-form" onSubmit={addRecurring}><label>tipo<select value={recurringForm.kind} onChange={(event) => setRecurringForm({ ...recurringForm, kind: event.target.value as "entrada" | "conta" })}><option value="conta">Conta fixa</option><option value="entrada">Entrada</option></select></label><label>nome<input required value={recurringForm.name} onChange={(event) => setRecurringForm({ ...recurringForm, name: event.target.value })} placeholder="Aluguel ou salário" /></label><div className="form-two-col"><label>valor<span className="input-wrap"><span>R$</span><input required type="number" min="0.01" step="0.01" value={recurringForm.amount} onChange={(event) => setRecurringForm({ ...recurringForm, amount: event.target.value })} /></span></label><label>dia do mês<input required type="number" min="1" max="31" value={recurringForm.dueDay} onChange={(event) => setRecurringForm({ ...recurringForm, dueDay: event.target.value })} /></label></div><label>começa em<input required type="date" value={recurringForm.startDate} onChange={(event) => setRecurringForm({ ...recurringForm, startDate: event.target.value })} /></label><label>categoria<input value={recurringForm.category} onChange={(event) => setRecurringForm({ ...recurringForm, category: event.target.value })} placeholder="moradia, renda..." /></label><button className="primary-button" type="submit"><Plus size={16} /> criar recorrência</button></form></section><section className="panel planning-form-panel"><div className="panel-heading"><div><span className="eyebrow">uma compra, várias cobranças</span><h2><CreditCard size={17} /> Compra parcelada</h2></div></div><form className="compact-form" onSubmit={addPurchase}><label>o que você comprou<input required value={purchaseForm.name} onChange={(event) => setPurchaseForm({ ...purchaseForm, name: event.target.value })} placeholder="Celular, móveis, curso..." /></label><div className="form-two-col"><label>valor total<span className="input-wrap"><span>R$</span><input required type="number" min="0.01" step="0.01" value={purchaseForm.totalAmount} onChange={(event) => setPurchaseForm({ ...purchaseForm, totalAmount: event.target.value })} /></span></label><label>parcelas<input required type="number" min="1" max="600" value={purchaseForm.installmentCount} onChange={(event) => setPurchaseForm({ ...purchaseForm, installmentCount: event.target.value })} /></label></div><label>primeira cobrança<input required type="date" value={purchaseForm.firstDueDate} onChange={(event) => setPurchaseForm({ ...purchaseForm, firstDueDate: event.target.value })} /></label><label>categoria<input value={purchaseForm.category} onChange={(event) => setPurchaseForm({ ...purchaseForm, category: event.target.value })} placeholder="casa, transporte..." /></label><button className="primary-button" type="submit"><Plus size={16} /> organizar parcelas</button></form></section></div><div className="planning-lists"><section className="panel planning-list-panel"><div className="panel-heading"><div><span className="eyebrow">o que se repete</span><h2>Recorrências cadastradas</h2></div><CalendarDays size={18} className="sparkle-icon" /></div>{recurring.length === 0 ? <div className="empty-state compact"><Repeat2 size={24} /><strong>Nenhuma recorrência ainda</strong><span>Salário e contas fixas podem nascer aqui.</span></div> : <div className="planning-list">{recurring.map((item) => <div className={`planning-row ${!item.active ? "planning-inactive" : ""}`} key={item.id}><div className={`planning-icon ${item.kind === "entrada" ? "planning-income" : "planning-expense"}`}><Repeat2 size={16} /></div><div className="planning-main"><strong>{item.name}</strong><span>{item.kind === "entrada" ? "entra" : "vence"} todo dia {item.dueDay} · {money(item.amount)}</span></div><button className="icon-action" type="button" onClick={() => toggle(item)} title={item.active ? "Pausar" : "Ativar"}>{item.active ? <Power size={15} /> : <Check size={15} />}</button></div>)}</div>}</section><section className="panel planning-list-panel"><div className="panel-heading"><div><span className="eyebrow">histórico organizado</span><h2>Compras parceladas</h2></div><ReceiptText size={18} className="sparkle-icon" /></div>{purchases.length === 0 ? <div className="empty-state compact"><CreditCard size={24} /><strong>Nenhuma compra parcelada</strong><span>Suas parcelas ficarão agrupadas por compra.</span></div> : <div className="planning-list">{purchases.map((purchase) => <div className="purchase-row" key={purchase.id}><div className="planning-main"><strong>{purchase.name}</strong><span>{money(purchase.totalAmount)} em {purchase.installmentCount}x · começa {shortDate(purchase.firstDueDate)}</span><div className="installment-chips">{purchase.installments.slice(0, 8).map((installment) => <button className={`installment-chip ${installment.status === "paid" ? "paid" : ""}`} type="button" key={installment.id} onClick={() => toggleInstallment(installment.id, installment.status)} title={`${shortDate(installment.dueDate)} · ${money(installment.amount)}`}>{installment.status === "paid" ? <Check size={10} /> : installment.installmentNumber}</button>)}{purchase.installments.length > 8 && <span className="installment-more">+{purchase.installments.length - 8}</span>}</div></div></div>)}</div>}</section></div></div>;
}
