import { useEffect, useState } from "react";
import { ArrowRight, Check, Clock3, ListTodo } from "lucide-react";
import { toast } from "sonner";
import { api, type ActionItem } from "../lib/api";

const tomorrow = () => new Date(Date.now() + 86400000).toISOString().slice(0, 10);

export default function OpenActions({ onOpenDebt }: { onOpenDebt: (debtId: string) => void }) {
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  async function load() {
    try { setActions((await api.actions(["open", "snoozed"])).actions); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : "Não foi possível carregar suas ações."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  async function update(id: string, status: "resolved" | "snoozed") {
    try { await api.updateAction(id, status === "snoozed" ? { status, snoozedUntil: tomorrow() } : { status }); toast.success(status === "resolved" ? "Ação resolvida." : "Ação adiada para amanhã."); await load(); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : "Não foi possível atualizar a ação."); }
  }
  if (loading) return <section className="panel open-actions" role="status">Carregando próximos passos...</section>;
  if (!actions.length) return null;
  return <section className="panel open-actions" aria-labelledby="open-actions-title"><div className="panel-heading"><div><span className="eyebrow">situação de hoje</span><h2 id="open-actions-title"><ListTodo size={17} /> Ações abertas</h2></div><span className="action-count">{actions.length}</span></div><div className="open-action-list">{actions.slice(0, 4).map((action) => <article key={action.id}><div><strong>{action.title}</strong>{action.detail && <p>{action.detail}</p>}<small>{action.status === "snoozed" ? `adiada até ${action.snoozedUntil ? new Date(`${action.snoozedUntil}T00:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "outra data"}` : action.dueDate ? `prazo ${new Date(`${action.dueDate}T00:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC" })}` : "sem prazo definido"}</small></div><div className="open-action-buttons">{action.debtId && <button type="button" onClick={() => onOpenDebt(action.debtId!)}>ver dívida <ArrowRight size={14} /></button>}<button type="button" onClick={() => void update(action.id, "snoozed")}><Clock3 size={14} /> adiar</button><button type="button" onClick={() => void update(action.id, "resolved")}><Check size={14} /> resolver</button></div></article>)}</div><p className="action-note">Marcar uma notificação como lida não resolve esta ação. A resolução acontece somente aqui.</p></section>;
}
