import { useEffect, useState } from "react";
import { Check, Landmark, Link2, RefreshCw, ShieldCheck, X } from "lucide-react";
import { PluggyConnect } from "react-pluggy-connect";
import { toast } from "sonner";
import { api, type FinancialConnection, type ImportedTransaction } from "../lib/api";

const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const date = (value: string) => new Date(`${value}T00:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC" });

type PluggyItemData = { item?: { id?: string } };

export default function OpenFinancePanel() {
  const [connections, setConnections] = useState<FinancialConnection[]>([]);
  const [transactions, setTransactions] = useState<ImportedTransaction[]>([]);
  const [providerConfigured, setProviderConfigured] = useState(false);
  const [sandbox, setSandbox] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [connectToken, setConnectToken] = useState<string | null>(null);
  const [includeSandbox, setIncludeSandbox] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [connectionData, transactionData] = await Promise.all([api.connections(), api.importedTransactions("pending")]);
      setConnections(connectionData.connections);
      setProviderConfigured(connectionData.providerConfigured);
      setSandbox(connectionData.sandbox);
      setTransactions(transactionData.transactions);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar as conexões financeiras.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function openPluggy() {
    setBusyId("connect");
    try {
      const result = await api.pluggyConnectToken();
      setIncludeSandbox(result.includeSandbox);
      setConnectToken(result.accessToken);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível iniciar a conexão bancária.");
    } finally {
      setBusyId(null);
    }
  }

  async function registerPluggyItem(data: PluggyItemData) {
    const itemId = data.item?.id;
    if (!itemId) {
      toast.error("A Pluggy não retornou o identificador da conexão.");
      setConnectToken(null);
      return;
    }
    setBusyId("register");
    try {
      await api.registerPluggyItem(itemId);
      setConnectToken(null);
      await load();
      toast.success("Banco conectado. Revise as transações encontradas antes de registrá-las.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "A conta foi conectada, mas não foi possível sincronizar os dados.");
    } finally {
      setBusyId(null);
    }
  }

  async function sync(connection: FinancialConnection) {
    setBusyId(connection.id);
    try {
      const result = await api.syncConnection(connection.id);
      await load();
      toast.success(`${result.created + result.updated} transação(ões) sincronizada(s).`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar a conexão.");
    } finally {
      setBusyId(null);
    }
  }

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
    <div className="open-finance-intro"><div className="open-finance-icon"><Link2 size={18} /></div><div><strong>{providerConfigured ? "Conexão Open Finance disponível" : "A base segura está pronta"}</strong><p>{providerConfigured ? "Autorize seu banco pelo ambiente oficial. O Meu Dinheiro não recebe nem armazena sua senha bancária." : "O servidor ainda precisa receber as credenciais do provedor Pluggy em ambiente seguro antes de liberar a conexão."}</p></div></div>
    <div className="open-finance-actions">
      {providerConfigured && <button className="secondary-admin-button" type="button" onClick={() => void openPluggy()} disabled={busyId === "connect" || Boolean(connectToken)}><Link2 size={15} /> {busyId === "connect" ? "abrindo..." : "conectar banco"}</button>}
      <button className="secondary-admin-button" type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={15} /> {loading ? "atualizando..." : "atualizar status"}</button>
      <span className="settings-note">{sandbox ? "Ambiente sandbox: use uma conta de teste da Pluggy." : "Consentimento pode ser revogado pelo usuário a qualquer momento."}</span>
    </div>
    {connectToken && <div className="pluggy-widget-shell"><PluggyConnect connectToken={connectToken} includeSandbox={includeSandbox} language="pt" theme="light" onSuccess={(data) => void registerPluggyItem(data)} onError={(error) => { toast.error(error.message || "A Pluggy não conseguiu concluir a conexão."); }} onClose={() => setConnectToken(null)} /></div>}
    {connections.length > 0 && <div className="connection-list">{connections.map((connection) => <div className="connection-row" key={connection.id}><div><strong>{connection.institutionName}</strong><span>{connection.provider} · {connection.statusLabel}</span></div><div className="connection-row-actions"><small>{connection.lastSyncedAt ? `última sincronização ${new Date(connection.lastSyncedAt).toLocaleString("pt-BR")}` : "aguardando sincronização"}</small><button className="icon-action" type="button" aria-label={`Atualizar ${connection.institutionName}`} disabled={busyId === connection.id} onClick={() => void sync(connection)}><RefreshCw size={14} /></button></div></div>)}</div>}
    {transactions.length > 0 && <div className="imported-review"><div className="panel-heading"><div><span className="eyebrow">confira antes de registrar</span><h3>Transações encontradas</h3></div><span className="review-count">{transactions.length}</span></div><div className="imported-transaction-list">{transactions.map((transaction) => <div className="imported-transaction-row" key={transaction.id}><div><strong>{transaction.merchantName || transaction.description}</strong><span>{date(transaction.transactionDate)} · {transaction.direction === "inflow" ? "entrada" : "saída"}</span></div><b className={transaction.direction === "inflow" ? "inflow" : "outflow"}>{transaction.direction === "inflow" ? "+" : "-"}{money(transaction.amount)}</b><div className="imported-transaction-actions"><button className="icon-action" type="button" aria-label="Adicionar transação" disabled={busyId === transaction.id} onClick={() => void review(transaction, "accept")}><Check size={15} /></button><button className="icon-action danger-action" type="button" aria-label="Ignorar transação" disabled={busyId === transaction.id} onClick={() => void review(transaction, "ignore")}><X size={15} /></button></div></div>)}</div></div>}
  </section>;
}
