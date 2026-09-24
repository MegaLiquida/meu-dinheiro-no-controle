import { FormEvent, useEffect, useState } from "react";
import { MessageCircle, Plus } from "lucide-react";
import { toast } from "sonner";
import { api, type Debt, type DebtNegotiation, type NegotiationChannel, type NegotiationStatus } from "../../lib/api";
import { money } from "./DebtMap";

const channels: Record<NegotiationChannel, string> = { phone: "telefone", email: "e-mail", chat: "chat", whatsapp: "WhatsApp", in_person: "presencial", letter: "carta", other: "outro" };
const statuses: Record<NegotiationStatus, string> = { draft: "rascunho", offered: "oferta recebida", accepted: "aceita", rejected: "recusada", expired: "vencida", cancelled: "cancelada" };
const emptyForm = { contact: "", channel: "phone" as NegotiationChannel, offerAmount: "", downPayment: "", installmentCount: "", installmentAmount: "", totalAmount: "", charges: "", validUntil: "", status: "offered" as NegotiationStatus, notes: "" };

export default function DebtNegotiations({ debts, selectedId, onSelect, onChanged }: { debts: Debt[]; selectedId: string | null; onSelect: (id: string) => void; onChanged: () => Promise<void> }) {
  const [items, setItems] = useState<DebtNegotiation[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const debt = debts.find((item) => item.id === selectedId) ?? null;

  async function load() {
    if (!selectedId) { setItems([]); return; }
    setLoading(true);
    try { setItems((await api.debtNegotiations(selectedId)).negotiations); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : "Não foi possível carregar as negociações."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [selectedId]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selectedId) return;
    const optionalNumber = (value: string) => value === "" ? null : Number(value);
    try {
      await api.addDebtNegotiation(selectedId, { contact: form.contact.trim() || null, channel: form.channel, offerAmount: optionalNumber(form.offerAmount), downPayment: optionalNumber(form.downPayment), installmentCount: optionalNumber(form.installmentCount), installmentAmount: optionalNumber(form.installmentAmount), totalAmount: optionalNumber(form.totalAmount), charges: optionalNumber(form.charges), validUntil: form.validUntil || null, status: form.status, notes: form.notes.trim() || null });
      if (form.status === "offered" || form.status === "accepted") await api.updateDebt(selectedId, { status: "negotiating" });
      toast.success("Negociação registrada no histórico."); setForm(emptyForm); await Promise.all([load(), onChanged()]);
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Não foi possível registrar a negociação."); }
  }

  return <div className="recovery-grid">
    <section className="panel recovery-form-panel"><div className="panel-heading"><div><span className="eyebrow">registro sem promessa</span><h2>Nova negociação</h2></div></div>
      <label className="standalone-label" htmlFor="negotiation-debt">dívida<select id="negotiation-debt" value={selectedId ?? ""} onChange={(event) => onSelect(event.target.value)}><option value="">selecione</option>{debts.filter((item) => item.status !== "paid").map((item) => <option value={item.id} key={item.id}>{item.name} · {money(item.balance)}</option>)}</select></label>
      {!debt ? <div className="empty-state compact"><MessageCircle size={24} /><strong>Selecione uma dívida</strong><span>O registro descreve a conversa; não garante desconto ou acordo.</span></div> : <form className="compact-form" onSubmit={submit}>
        <div className="form-two-col"><label htmlFor="negotiation-channel">canal<select id="negotiation-channel" value={form.channel} onChange={(event) => setForm({ ...form, channel: event.target.value as NegotiationChannel })}>{Object.entries(channels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label htmlFor="negotiation-contact">contato<input id="negotiation-contact" value={form.contact} onChange={(event) => setForm({ ...form, contact: event.target.value })} placeholder="nome ou setor" /></label></div>
        <div className="form-two-col"><label htmlFor="negotiation-offer">valor da oferta<input id="negotiation-offer" type="number" min="0" step="0.01" value={form.offerAmount} onChange={(event) => setForm({ ...form, offerAmount: event.target.value })} /></label><label htmlFor="negotiation-down">entrada<input id="negotiation-down" type="number" min="0" step="0.01" value={form.downPayment} onChange={(event) => setForm({ ...form, downPayment: event.target.value })} /></label></div>
        <div className="form-two-col"><label htmlFor="negotiation-count">parcelas<input id="negotiation-count" type="number" min="1" max="600" value={form.installmentCount} onChange={(event) => setForm({ ...form, installmentCount: event.target.value })} /></label><label htmlFor="negotiation-installment">valor da parcela<input id="negotiation-installment" type="number" min="0" step="0.01" value={form.installmentAmount} onChange={(event) => setForm({ ...form, installmentAmount: event.target.value })} /></label></div>
        <div className="form-two-col"><label htmlFor="negotiation-total">total do acordo<input id="negotiation-total" type="number" min="0" step="0.01" value={form.totalAmount} onChange={(event) => setForm({ ...form, totalAmount: event.target.value })} /></label><label htmlFor="negotiation-charges">encargos informados<input id="negotiation-charges" type="number" min="0" step="0.01" value={form.charges} onChange={(event) => setForm({ ...form, charges: event.target.value })} /></label></div>
        <div className="form-two-col"><label htmlFor="negotiation-valid">válida até<input id="negotiation-valid" type="date" value={form.validUntil} onChange={(event) => setForm({ ...form, validUntil: event.target.value })} /></label><label htmlFor="negotiation-status">situação<select id="negotiation-status" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as NegotiationStatus })}>{Object.entries(statuses).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label></div>
        <label htmlFor="negotiation-notes">anotações<textarea id="negotiation-notes" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Registre somente o que foi informado." /></label>
        <button className="primary-button" type="submit"><Plus size={16} /> guardar no histórico</button>
        <p className="legal-note">Registrar uma oferta não significa recomendação, garantia de desconto ou resultado jurídico.</p>
      </form>}
    </section>
    <section className="panel recovery-list-panel"><div className="panel-heading"><div><span className="eyebrow">linha do tempo</span><h2>Histórico {debt ? `· ${debt.name}` : ""}</h2></div></div>
      {loading ? <div className="auth-loading" role="status">Carregando histórico...</div> : items.length === 0 ? <div className="empty-state compact"><MessageCircle size={24} /><strong>Nenhuma negociação registrada</strong><span>Quando houver contato, registre as condições sem preencher o que não foi dito.</span></div> : <div className="timeline-list">{items.map((item) => <article key={item.id}><div><span className={`status-badge status-${item.status}`}>{statuses[item.status]}</span><time>{new Date(item.createdAt).toLocaleDateString("pt-BR")}</time></div><strong>{item.totalAmount != null ? money(item.totalAmount) : item.offerAmount != null ? money(item.offerAmount) : "valor não informado"}</strong><p>{item.installmentCount ? `${item.installmentCount}x${item.installmentAmount != null ? ` de ${money(item.installmentAmount)}` : ""}` : "parcelamento não informado"}{item.downPayment != null ? ` · entrada ${money(item.downPayment)}` : ""}</p><small>{item.channel ? channels[item.channel] : "canal não informado"}{item.validUntil ? ` · válida até ${new Date(`${item.validUntil}T00:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC" })}` : ""}</small>{item.notes && <blockquote>{item.notes}</blockquote>}</article>)}</div>}
    </section>
  </div>;
}
