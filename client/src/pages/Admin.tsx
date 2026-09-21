import { useMemo, useState } from "react";
import { toast } from "sonner";
import "../admin.css";
import {
  Activity,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  Check,
  ChevronDown,
  CircleHelp,
  Download,
  FileText,
  Filter,
  LayoutDashboard,
  Leaf,
  Menu,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  TrendingDown,
  Users,
  WalletCards,
  X,
} from "lucide-react";

type Status = "Ativo" | "Atenção" | "Inativo";

type Customer = {
  id: string;
  name: string;
  email: string;
  initials: string;
  status: Status;
  plan: string;
  joined: string;
  balance: number;
  health: number;
  launches: number;
  lastAccess: string;
};

const initialCustomers: Customer[] = [
  { id: "c1", name: "Marina Prado", email: "marina.prado@email.com", initials: "MP", status: "Ativo", plan: "Essencial", joined: "12 set 2026", balance: 1802, health: 86, launches: 12, lastAccess: "Hoje, 09:42" },
  { id: "c2", name: "Rafael Mendes", email: "rafael.mendes@email.com", initials: "RM", status: "Ativo", plan: "Essencial", joined: "11 set 2026", balance: 940, health: 72, launches: 8, lastAccess: "Hoje, 08:17" },
  { id: "c3", name: "Bianca Torres", email: "bianca.torres@email.com", initials: "BT", status: "Atenção", plan: "Essencial", joined: "08 set 2026", balance: -240, health: 38, launches: 19, lastAccess: "Ontem, 19:10" },
  { id: "c4", name: "Caio Nunes", email: "caio.nunes@email.com", initials: "CN", status: "Ativo", plan: "Completo", joined: "04 set 2026", balance: 3260, health: 94, launches: 23, lastAccess: "Ontem, 16:32" },
  { id: "c5", name: "Júlia Lima", email: "julia.lima@email.com", initials: "JL", status: "Inativo", plan: "Essencial", joined: "29 ago 2026", balance: 420, health: 60, launches: 5, lastAccess: "18 set, 11:04" },
  { id: "c6", name: "André Rocha", email: "andre.rocha@email.com", initials: "AR", status: "Atenção", plan: "Completo", joined: "27 ago 2026", balance: -680, health: 24, launches: 31, lastAccess: "17 set, 22:21" },
];

const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function Brand() {
  return <div className="brand-lockup"><div className="brand-mark"><Leaf size={18} strokeWidth={2.4} /></div><div><div className="brand-name">Meu Dinheiro</div><div className="brand-subtitle">painel de gestão</div></div></div>;
}

function AdminNav({ icon, label, active, count, onClick }: { icon: React.ReactNode; label: string; active?: boolean; count?: string; onClick?: () => void }) {
  return <button className={`admin-nav-item ${active ? "active" : ""}`} type="button" onClick={onClick}>{icon}<span>{label}</span>{count && <b>{count}</b>}</button>;
}

function StatusBadge({ status }: { status: Status }) {
  return <span className={`status-badge status-${status.toLowerCase()}`}><i />{status}</span>;
}

function KpiCard({ icon, label, value, note, tone, trend }: { icon: React.ReactNode; label: string; value: string; note: string; tone: string; trend?: "up" | "down" }) {
  return <div className={`admin-kpi kpi-${tone}`}><div className="kpi-top"><div className="kpi-icon">{icon}</div>{trend && <span className={`kpi-trend ${trend}`} >{trend === "up" ? <ArrowUpRight size={13} /> : <TrendingDown size={13} />} {trend === "up" ? "12,4%" : "3,1%"}</span>}</div><span className="kpi-label">{label}</span><strong>{value}</strong><small>{note}</small></div>;
}

function CustomerDetails({ customer, onClose, onUpdate }: { customer: Customer; onClose: () => void; onUpdate: (status: Status) => void }) {
  const [showAll, setShowAll] = useState(false);
  const launches = [
    ["Salário", "Entrada", 3800, "05 set"],
    ["Aluguel", "Conta fixa", -1200, "10 set"],
    ["Geladeira · 6/12", "Parcela", -150, "15 set"],
    ["Energia", "Conta fixa", -210, "22 set"],
  ];
  return <div className="drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><aside className="customer-drawer"><div className="drawer-header"><div><span className="eyebrow">perfil do cliente</span><h2>{customer.name}</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Fechar detalhes"><X size={17} /></button></div><div className="drawer-profile"><div className="customer-avatar large">{customer.initials}</div><div><strong>{customer.email}</strong><span>Cliente desde {customer.joined}</span><StatusBadge status={customer.status} /></div></div><div className="drawer-actions"><button className="drawer-action" type="button" onClick={() => toast.success("Exportação preparada para este cliente.")}><Download size={15} /> exportar dados</button><button className="drawer-action danger-action" type="button" onClick={() => onUpdate(customer.status === "Inativo" ? "Ativo" : "Inativo")}><ShieldCheck size={15} /> {customer.status === "Inativo" ? "reativar acesso" : "desativar acesso"}</button></div><div className="drawer-health"><div className="drawer-health-heading"><div><span className="eyebrow">saúde financeira</span><strong>{customer.health}/100</strong></div><span className={`health-word ${customer.health > 70 ? "healthy" : customer.health > 45 ? "medium" : "low"}`}>{customer.health > 70 ? "estável" : customer.health > 45 ? "em observação" : "precisa de atenção"}</span></div><div className="health-line"><span style={{ width: `${customer.health}%` }} /></div><p>O cliente tem {customer.launches} lançamentos cadastrados e saldo projetado de <strong>{money(customer.balance)}</strong>.</p></div><div className="drawer-section"><div className="drawer-section-title"><span className="eyebrow">últimos lançamentos</span><button type="button" onClick={() => setShowAll(!showAll)}>{showAll ? "mostrar menos" : "ver todos"} <ArrowRight size={13} /></button></div>{launches.slice(0, showAll ? 4 : 3).map(([name, type, amount, date]) => <div className="drawer-launch" key={name}><div className={`drawer-launch-icon ${type === "Entrada" ? "income" : type === "Parcela" ? "installment" : "bill"}`}>{type === "Entrada" ? <ArrowDownLeft size={14} /> : <FileText size={14} />}</div><div><strong>{name}</strong><span>{type} · {date}</span></div><b className={Number(amount) > 0 ? "amount-income" : ""}>{money(Number(amount))}</b></div>)}</div><div className="drawer-footer"><CircleHelp size={15} /><span>Os dados exibidos são de demonstração para este protótipo. Em produção, o administrador terá permissões por perfil.</span></div></aside></div>;
}

export default function Admin() {
  const [customers, setCustomers] = useState(initialCustomers);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"Todos" | Status>("Todos");
  const [activeSection, setActiveSection] = useState("Clientes");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const filteredCustomers = useMemo(() => customers.filter((customer) => {
    const matchesQuery = `${customer.name} ${customer.email}`.toLowerCase().includes(query.toLowerCase());
    return matchesQuery && (filter === "Todos" || customer.status === filter);
  }), [customers, filter, query]);
  const activeCount = customers.filter((customer) => customer.status === "Ativo").length;
  const attentionCount = customers.filter((customer) => customer.status === "Atenção").length;
  const updateStatus = (customer: Customer, status: Status) => {
    setCustomers((current) => current.map((item) => item.id === customer.id ? { ...item, status } : item));
    setSelectedCustomer({ ...customer, status });
    toast.success(status === "Inativo" ? "Acesso desativado para o cliente." : "Acesso reativado.");
  };

  return <div className="admin-shell">
    <aside className={`admin-sidebar ${mobileNavOpen ? "open" : ""}`}><div className="admin-sidebar-top"><Brand /><button className="mobile-close" type="button" onClick={() => setMobileNavOpen(false)} aria-label="Fechar menu"><X size={19} /></button></div><div className="admin-context"><span className="admin-context-dot" /> ambiente administrativo</div><nav className="admin-nav"><AdminNav icon={<LayoutDashboard size={17} />} label="Visão geral" active={activeSection === "Visão geral"} onClick={() => setActiveSection("Visão geral")} /><AdminNav icon={<Users size={17} />} label="Clientes" count={String(customers.length)} active={activeSection === "Clientes"} onClick={() => setActiveSection("Clientes")} /><AdminNav icon={<WalletCards size={17} />} label="Lançamentos" active={activeSection === "Lançamentos"} onClick={() => setActiveSection("Lançamentos")} /><AdminNav icon={<BarChart3 size={17} />} label="Relatórios" active={activeSection === "Relatórios"} onClick={() => setActiveSection("Relatórios")} /><AdminNav icon={<Settings2 size={17} />} label="Configurações" active={activeSection === "Configurações"} onClick={() => setActiveSection("Configurações")} /></nav><div className="admin-sidebar-spacer" /><div className="admin-security-card"><ShieldCheck size={17} /><strong>Dados protegidos</strong><p>Controle de acesso e privacidade em primeiro lugar.</p></div><button className="back-client" type="button" onClick={() => { window.location.href = "/"; }}><ArrowLeftIcon /> voltar para tela do cliente</button><div className="admin-sidebar-bottom"><span>admin@meudinheiro.app</span><span>última sincronização · agora</span></div></aside>
    <main className="admin-main"><header className="admin-topbar"><button className="mobile-menu admin-mobile-menu" type="button" onClick={() => setMobileNavOpen(true)} aria-label="Abrir menu"><Menu size={20} /></button><div className="admin-breadcrumb"><span>Administração</span><ArrowRight size={14} /><strong>{activeSection}</strong></div><div className="admin-top-actions"><span className="admin-date">segunda, 21 set 2026</span><button className="notification-button" type="button" aria-label="Notificações"><Bell size={17} /><span /></button><button className="admin-avatar" type="button">AD</button></div></header><div className="admin-content page-enter"><div className="admin-heading"><div><span className="eyebrow">controle central · setembro 2026</span><h1>{activeSection === "Clientes" ? "Clientes e usuários" : activeSection}</h1><p>{activeSection === "Clientes" ? "Acompanhe quem está usando o produto e entre em cada conta quando precisar." : "Esta área está pronta para receber os próximos módulos de operação."}</p></div><div className="admin-heading-actions"><button className="secondary-admin-button" type="button" onClick={() => toast.success("Relatório exportado em modo demonstração.")}><Download size={15} /> exportar relatório</button><button className="primary-admin-button" type="button" onClick={() => toast.success("Fluxo de convite iniciado.")}><Plus size={16} /> convidar usuário</button></div></div><section className="admin-kpi-grid"><KpiCard icon={<Users size={18} />} label="usuários cadastrados" value="248" note="+28 neste mês" tone="green" trend="up" /><KpiCard icon={<Activity size={18} />} label="usuários ativos" value={`${activeCount * 40 + 8}`} note="últimos 30 dias" tone="blue" trend="up" /><KpiCard icon={<TrendingDown size={18} />} label="precisam de atenção" value={String(attentionCount * 14)} note="saldo projetado negativo" tone="coral" trend="down" /><KpiCard icon={<BarChart3 size={18} />} label="lançamentos cadastrados" value="4.892" note="+8,6% vs. agosto" tone="yellow" trend="up" /></section><section className="admin-main-grid"><div className="admin-table-card"><div className="admin-card-heading"><div><span className="eyebrow">base de clientes</span><h2>Todos os usuários <span>· {filteredCustomers.length} exibidos</span></h2></div><button className="more-button" type="button" aria-label="Mais opções"><MoreHorizontal size={18} /></button></div><div className="admin-toolbar"><div className="admin-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nome ou e-mail" /></div><div className="filter-wrap"><Filter size={14} /><select value={filter} onChange={(event) => setFilter(event.target.value as "Todos" | Status)}><option>Todos</option><option>Ativo</option><option>Atenção</option><option>Inativo</option></select><ChevronDown size={13} /></div><button className="icon-filter-button" type="button" onClick={() => toast.info("Filtros avançados estarão disponíveis na próxima versão.")} aria-label="Filtros avançados"><SlidersHorizontal size={15} /></button></div><div className="customer-table-wrap"><table className="customer-table"><thead><tr><th>cliente</th><th>status</th><th>plano</th><th>saúde financeira</th><th>último acesso</th><th /></tr></thead><tbody>{filteredCustomers.map((customer) => <tr key={customer.id} onClick={() => setSelectedCustomer(customer)}><td><div className="customer-cell"><div className="customer-avatar">{customer.initials}</div><div><strong>{customer.name}</strong><span>{customer.email}</span></div></div></td><td><StatusBadge status={customer.status} /></td><td><span className="plan-badge">{customer.plan}</span></td><td><div className="table-health"><div><span style={{ width: `${customer.health}%` }} /></div><b>{customer.health}</b></div></td><td><span className="last-access">{customer.lastAccess}</span></td><td><button className="row-more" type="button" onClick={(event) => { event.stopPropagation(); setSelectedCustomer(customer); }} aria-label={`Abrir ${customer.name}`}><MoreHorizontal size={16} /></button></td></tr>)}</tbody></table>{filteredCustomers.length === 0 && <div className="admin-empty"><Search size={22} /><strong>Nenhum cliente encontrado</strong><span>Tente outro nome, e-mail ou status.</span></div>}</div><div className="table-footer"><span>Mostrando {filteredCustomers.length} de {customers.length} clientes</span><div className="pagination"><button type="button">‹</button><button className="current" type="button">1</button><button type="button">2</button><button type="button">3</button><button type="button">›</button></div></div></div><aside className="admin-side-column"><div className="admin-side-card attention-card"><div className="side-card-heading"><div><span className="eyebrow">ação recomendada</span><h2>Contas para olhar hoje</h2></div><span className="attention-count">{attentionCount}</span></div><p>Clientes com saldo projetado negativo ou sem acessar há mais de 7 dias.</p><div className="attention-list">{customers.filter((customer) => customer.status === "Atenção").map((customer) => <button type="button" key={customer.id} onClick={() => setSelectedCustomer(customer)}><div className="customer-avatar small">{customer.initials}</div><span><strong>{customer.name}</strong><small>{money(customer.balance)} projetados</small></span><ArrowRight size={14} /></button>)}</div><button className="side-link" type="button" onClick={() => setFilter("Atenção")}>ver todas as contas <ArrowRight size={14} /></button></div><div className="admin-side-card usage-card"><div className="side-card-heading"><div><span className="eyebrow">visão do produto</span><h2>Atividade dos usuários</h2></div><BarChart3 size={17} /></div><div className="usage-stat"><div className="usage-label"><span>cadastraram lançamentos</span><strong>82%</strong></div><div className="usage-bar"><span style={{ width: "82%" }} /></div></div><div className="usage-stat"><div className="usage-label"><span>usaram o simulador</span><strong>64%</strong></div><div className="usage-bar coral-bar"><span style={{ width: "64%" }} /></div></div><div className="usage-stat"><div className="usage-label"><span>voltaram esta semana</span><strong>58%</strong></div><div className="usage-bar yellow-bar"><span style={{ width: "58%" }} /></div></div><button className="side-link" type="button" onClick={() => toast.info("Relatórios detalhados estarão disponíveis na próxima versão.")}>abrir relatório completo <ArrowRight size={14} /></button></div></aside></section></div></main>{selectedCustomer && <CustomerDetails customer={selectedCustomer} onClose={() => setSelectedCustomer(null)} onUpdate={(status) => updateStatus(selectedCustomer, status)} />}
  </div>;
}

function ArrowLeftIcon() { return <ArrowRight size={14} style={{ transform: "rotate(180deg)" }} />; }
