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
  const [connectorIds, setConnectorIds] = useState<number[]>([]);
  const [connectorFilterAvailable, setConnectorFilterAvailable] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

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

  useEffect(() => {
    document.body.classList.toggle("bank-connection-open", Boolean(connectToken));
    return () => document.body.classList.remove("bank-connection-open");
  }, [connectToken]);

  useEffect(() => {
    if (!connectToken) return;
    const mobileViewport = window.matchMedia("(max-width: 500px)");
    if (!mobileViewport.matches) return;
    const syncWidgetViewport = () => {
      const viewportHeight = Math.max(320, Math.round(window.visualViewport?.height ?? window.innerHeight));
      const height = `${viewportHeight}px`;
      document.querySelectorAll<HTMLElement>('[id$="_modal-overlay"], [id$="_modal"], [class$="_modal-content"], [class$="_container"], iframe[title="Pluggy"]').forEach((element) => {
        element.style.setProperty("height", height, "important");
        element.style.setProperty("max-height", height, "important");
      });
    };
    const enableWidgetScroll = () => {
      document.querySelectorAll<HTMLIFrameElement>('iframe[title="Pluggy"]').forEach((frame) => {
        frame.setAttribute("scrolling", "yes");
        frame.style.setProperty("overflow", "auto", "important");
        frame.style.setProperty("touch-action", "pan-y", "important");
        frame.style.setProperty("overscroll-behavior", "contain", "important");
      });
      syncWidgetViewport();
    };
    enableWidgetScroll();
    const observer = new MutationObserver(enableWidgetScroll);
    observer.observe(document.body, { childList: true, subtree: true });
    const visualViewport = window.visualViewport;
    visualViewport?.addEventListener("resize", syncWidgetViewport);
    window.addEventListener("resize", syncWidgetViewport);
    return () => {
      observer.disconnect();
      visualViewport?.removeEventListener("resize", syncWidgetViewport);
      window.removeEventListener("resize", syncWidgetViewport);
    };
  }, [connectToken]);

  async function openPluggy() {
    setBusyId("connect");
    setConnectionError(null);
    try {
      const result = await api.pluggyConnectToken();
      setIncludeSandbox(result.includeSandbox);
      setConnectorIds(result.connectorIds ?? []);
      setConnectorFilterAvailable(result.connectorFilterAvailable ?? false);
      setConnectToken(result.accessToken);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível iniciar a conexão bancária.";
      setConnectionError(message);
      toast.error(message);
    } finally {
      setBusyId(null);
    }
  }

  async function registerPluggyItem(data: PluggyItemData) {
    const itemId = data.item?.id;
    if (!itemId) {
      const message = "A Pluggy não retornou o identificador da conexão. Tente novamente.";
      setConnectionError(message);
      toast.error(message);
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
      const message = error instanceof Error ? error.message : "A conta foi conectada, mas não foi possível sincronizar os dados.";
      setConnectionError(message);
      toast.error(message);
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

  function handlePluggyError(message: string) {
    const normalized = message.toLocaleLowerCase("pt-BR");
    const sandboxMismatch = includeSandbox && /(sandbox|teste|real|dados reais|demo)/i.test(normalized);
    const friendlyMessage = sandboxMismatch
      ? "O ambiente atual é de testes. Use somente o conector Pluggy Bank e as credenciais de teste. Bancos reais só ficam disponíveis após a liberação de produção na Pluggy."
      : message || "A Pluggy não conseguiu concluir a conexão. Feche esta tela e tente novamente.";
    setConnectionError(friendlyMessage);
    setConnectToken(null);
    toast.error(friendlyMessage);
  }

  return <section className="panel open-finance-panel">
    <div className="panel-heading"><div><span className="eyebrow">integração em etapas</span><h2><Landmark size={17} /> Conexões bancárias</h2></div><ShieldCheck size={18} className="sparkle-icon" /></div>
    <div className="open-finance-intro"><div className="open-finance-icon"><Link2 size={18} /></div><div><strong>{providerConfigured ? (sandbox ? "Conexão de teste disponível" : "Conexão Open Finance disponível") : "A base segura está pronta"}</strong><p>{providerConfigured ? (sandbox ? "Você está no ambiente de demonstração. Para testar, use apenas o Pluggy Bank; o aplicativo não recebe nem armazena sua senha bancária." : "Autorize seu banco pelo ambiente oficial. O Meu Dinheiro não recebe nem armazena sua senha bancária.") : "O servidor ainda precisa receber as credenciais do provedor Pluggy em ambiente seguro antes de liberar a conexão."}</p></div></div>
    {providerConfigured && <div className={`open-finance-mode-note ${sandbox ? "sandbox" : "live"}`} role="status"><strong>{sandbox ? "Modo de teste" : "Modo de produção"}</strong><p>{sandbox ? "Bancos reais não podem ser conectados com contas de teste. Selecione Pluggy Bank para continuar." : "A conexão usa o consentimento oficial do seu banco. Você pode revogar o acesso quando quiser."}</p></div>}
    <div className="open-finance-actions">
      {providerConfigured && <button className="secondary-admin-button" type="button" onClick={() => void openPluggy()} disabled={busyId === "connect" || Boolean(connectToken)}><Link2 size={15} /> {busyId === "connect" ? "abrindo..." : "conectar banco"}</button>}
      <button className="secondary-admin-button" type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={15} /> {loading ? "atualizando..." : "atualizar status"}</button>
      <span className="settings-note">{sandbox ? "Ambiente sandbox: use uma conta de teste da Pluggy Bank." : "Consentimento pode ser revogado pelo usuário a qualquer momento."}</span>
    </div>
    {connectionError && <div className="open-finance-error" role="alert"><strong>Não foi possível concluir a conexão</strong><p>{connectionError}</p><button className="secondary-admin-button" type="button" onClick={() => void openPluggy()} disabled={busyId === "connect"}><Link2 size={15} /> tentar novamente</button></div>}
    {connectToken && <div className="pluggy-widget-shell"><PluggyConnect connectToken={connectToken} includeSandbox={includeSandbox} connectorIds={connectorIds.length ? connectorIds : undefined} allowFullscreen language="pt" theme="light" onSuccess={(data) => void registerPluggyItem(data)} onError={(error) => handlePluggyError(error.message)} onLoadError={(error) => handlePluggyError(error.message)} onClose={() => setConnectToken(null)} /></div>}
    {connections.length > 0 && <div className="connection-list">{connections.map((connection) => <div className="connection-row" key={connection.id}><div><strong>{connection.institutionName}</strong><span>{connection.provider} · {connection.statusLabel}</span></div><div className="connection-row-actions"><small>{connection.lastSyncedAt ? `última sincronização ${new Date(connection.lastSyncedAt).toLocaleString("pt-BR")}` : "aguardando sincronização"}</small><button className="icon-action" type="button" aria-label={`Atualizar ${connection.institutionName}`} disabled={busyId === connection.id} onClick={() => void sync(connection)}><RefreshCw size={14} /></button></div></div>)}</div>}
    {transactions.length > 0 && <div className="imported-review"><div className="panel-heading"><div><span className="eyebrow">confira antes de registrar</span><h3>Transações encontradas</h3></div><span className="review-count">{transactions.length}</span></div><div className="imported-transaction-list">{transactions.map((transaction) => <div className="imported-transaction-row" key={transaction.id}><div><strong>{transaction.merchantName || transaction.description}</strong><span>{date(transaction.transactionDate)} · {transaction.direction === "inflow" ? "entrada" : "saída"}</span></div><b className={transaction.direction === "inflow" ? "inflow" : "outflow"}>{transaction.direction === "inflow" ? "+" : "-"}{money(transaction.amount)}</b><div className="imported-transaction-actions"><button className="icon-action" type="button" aria-label="Adicionar transação" disabled={busyId === transaction.id} onClick={() => void review(transaction, "accept")}><Check size={15} /></button><button className="icon-action danger-action" type="button" aria-label="Ignorar transação" disabled={busyId === transaction.id} onClick={() => void review(transaction, "ignore")}><X size={15} /></button></div></div>)}</div></div>}
  </section>;
}
