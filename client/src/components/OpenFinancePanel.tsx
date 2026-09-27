import { useEffect, useState } from "react";
import { Check, Landmark, Link2, RefreshCw, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { api, type FinancialConnection, type ImportedTransaction } from "../lib/api";

const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const date = (value: string) => new Date(`${value}T00:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC" });

export default function OpenFinancePanel() {
  const [connections, setConnections] = useState<FinancialConnection[]>([]);
  const [transactions, setTransactions] = useState<ImportedTransaction[]>([]);
  const [providerConfigured, setProviderConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [connectionData, transactionData] = await Promise.all([api.connections(), api.importedTransactions("pending")]);
      setConnections(connectionData.connections);
      setProviderConfigured(connectionData.providerConfigured);
      setTransactions(transactionData.transactions);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar as conexões financeiras.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function review(transaction: ImportedTransaction, action: "accept" | "ignore") {
    setBusyId(transaction.id);
    try {
      if (action === "accept") await api.acceptImportedTransaction(transaction.id);
      else await api.reviewImportedTransaction(transaction.id, { state: "ignored" });
      setTransactions((current) => current.filter((item) => item.id !== transaction.id));
      toast.success(action === "accept" ? "Transação adicionada aos seus lançamentos." : "Transação ignorada sem alterar seus lançamentos.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível revisar a transação.");
    } finally {
      setBusyId(null);
    }
  }

  return <section className="panel open-finance-panel">
    <div className="panel-heading"><div><span className="eyebrow">integração em etapas</span><h2><Landmark size={17} /> Conexões bancárias</h2></div><ShieldCheck size={18} className="sparkle-icon" /></div>
    <div className="open-finance-intro"><div className="open-finance-icon"><Link2 size={18} /></div><div><strong>{providerConfigured ? "Conexão Open Finance disponível" : "A base segura está pronta"}</strong><p>{providerConfigured ? "Você poderá autorizar uma instituição pelo ambiente oficial, sem informar sua senha bancária ao Meu Dinheiro." : "A conexão automática será ativada depois da escolha e configuração de um provedor Open Finance. Nenhuma senha bancária é solicitada ou armazenada aqui."}</p></div></div>
    <div className="open-finance-actions"><button className="secondary-admin-button" type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={15} /> {loading ? "atualizando..." : "atualizar status"}</button><span className="settings-note">Consentimento pode ser revogado pelo usuário a qualquer momento.</span></div>
    {connections.length > 0 && <div className="connection-list">{connections.map((connection) => <div className="connection-row" key={connection.id}><div><strong>{connection.institutionName}</strong><span>{connection.provider} · {connection.statusLabel}</span></div><small>{connection.lastSyncedAt ? `última sincronização ${new Date(connection.lastSyncedAt).toLocaleString("pt-BR")}` : "aguardando sincronização"}</small></div>)}</div>}
    {transactions.length > 0 && <div className="imported-review"><div className="panel-heading"><div><span className="eyebrow">confira antes de registrar</span><h3>Transações encontradas</h3></div><span className="review-count">{transactions.length}</span></div><div className="imported-transaction-list">{transactions.map((transaction) => <div className="imported-transaction-row" key={transaction.id}><div><strong>{transaction.merchantName || transaction.description}</strong><span>{date(transaction.transactionDate)} · {transaction.direction === "inflow" ? "entrada" : "saída"}</span></div><b className={transaction.direction === "inflow" ? "inflow" : "outflow"}>{transaction.direction === "inflow" ? "+" : "-"}{money(transaction.amount)}</b><div className="imported-transaction-actions"><button className="icon-action" type="button" aria-label="Adicionar transação" disabled={busyId === transaction.id} onClick={() => void review(transaction, "accept")}><Check size={15} /></button><button className="icon-action danger-action" type="button" aria-label="Ignorar transação" disabled={busyId === transaction.id} onClick={() => void review(transaction, "ignore")}><X size={15} /></button></div></div>)}</div></div>}
  </section>;
}
