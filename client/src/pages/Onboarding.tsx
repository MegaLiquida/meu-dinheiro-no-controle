import { FormEvent, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, CircleHelp, Leaf, ShieldCheck, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../contexts/AuthContext";
import { api, type FinancialProfile, type IncomeFrequency } from "../lib/api";

const today = new Date().toISOString().slice(0, 10);
const inThirtyDays = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });

export default function Onboarding({ profile, onComplete }: { profile: FinancialProfile; onComplete: () => Promise<void> }) {
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [monthlyIncome, setMonthlyIncome] = useState(profile.monthlyIncome ? String(profile.monthlyIncome) : "");
  const [incomeFrequency, setIncomeFrequency] = useState<IncomeFrequency>(profile.incomeFrequency);
  const [nextIncomeDate, setNextIncomeDate] = useState(profile.nextIncomeDate ?? inThirtyDays);
  const [currentBalance, setCurrentBalance] = useState(String(profile.currentBalance || ""));
  const [balanceAsOfDate, setBalanceAsOfDate] = useState(profile.balanceAsOfDate || today);
  const [safetyMargin, setSafetyMargin] = useState(String(profile.safetyMargin || "300"));
  const [saving, setSaving] = useState(false);
  const parsedIncome = Number(monthlyIncome) || 0;
  const parsedBalance = Number(currentBalance) || 0;
  const parsedMargin = Number(safetyMargin) || 0;
  const canContinue = parsedIncome > 0 && Boolean(nextIncomeDate);
  const summary = useMemo(() => ({ income: parsedIncome, balance: parsedBalance, margin: parsedMargin }), [parsedBalance, parsedIncome, parsedMargin]);

  function next(event?: FormEvent) {
    event?.preventDefault();
    if (!canContinue) {
      toast.error("Informe sua renda e a data da próxima entrada para continuar.");
      return;
    }
    setStep(2);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (parsedMargin < 0 || !balanceAsOfDate) {
      toast.error("Informe uma margem e uma data válidas.");
      return;
    }
    setSaving(true);
    try {
      await api.saveProfile({ monthlyIncome: parsedIncome, incomeFrequency, nextIncomeDate, currentBalance: parsedBalance, balanceAsOfDate, safetyMargin: parsedMargin, onboardingCompleted: true });
      toast.success("Seu ponto de partida foi salvo.");
      await onComplete();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar seu diagnóstico.");
    } finally {
      setSaving(false);
    }
  }

  return <main className="onboarding-shell"><div className="onboarding-glow onboarding-glow-left" /><div className="onboarding-glow onboarding-glow-right" /><section className="onboarding-card"><div className="onboarding-brand"><span className="brand-mark"><Leaf size={20} /></span><span><strong>Meu Dinheiro</strong><small>no controle</small></span></div><div className="onboarding-progress"><span className={step >= 1 ? "active" : ""} /><span className={step >= 2 ? "active" : ""} /></div>{step === 1 ? <form onSubmit={next}><div className="onboarding-heading"><span className="eyebrow">passo 1 de 2 · entender sua entrada</span><h1>Vamos começar pelo que entra.</h1><p>Não precisa ser perfeito. Uma estimativa já ajuda o sistema a dimensionar seus próximos dias.</p></div><div className="onboarding-form"><label>quanto entra por período<span className="input-wrap"><span>R$</span><input autoFocus required type="number" min="0" step="0.01" value={monthlyIncome} onChange={(event) => setMonthlyIncome(event.target.value)} placeholder="3.000,00" /></span></label><label>com que frequência você recebe<select value={incomeFrequency} onChange={(event) => setIncomeFrequency(event.target.value as IncomeFrequency)}><option value="monthly">uma vez por mês</option><option value="biweekly">a cada quinze dias</option><option value="weekly">toda semana</option><option value="irregular">não tenho uma frequência fixa</option></select></label><label>quando será sua próxima entrada<input required type="date" value={nextIncomeDate} onChange={(event) => setNextIncomeDate(event.target.value)} /></label></div><div className="onboarding-help"><CircleHelp size={16} /><span>Se sua renda varia, use uma média conservadora. O objetivo é evitar contar com um dinheiro que pode não chegar.</span></div><button className="primary-button onboarding-button" type="submit">continuar <ArrowRight size={17} /></button></form> : <form onSubmit={save}><div className="onboarding-heading"><span className="eyebrow">passo 2 de 2 · proteger seu dinheiro</span><h1>Agora vamos definir seu chão.</h1><p>A margem de segurança é o valor que você prefere preservar para imprevistos. O sistema avisará quando uma decisão ameaçar esse limite.</p></div><div className="onboarding-form"><label>quanto está disponível hoje<span className="input-wrap"><span>R$</span><input autoFocus required type="number" step="0.01" value={currentBalance} onChange={(event) => setCurrentBalance(event.target.value)} placeholder="0,00" /></span></label><label>esse saldo é de qual data?<input required type="date" value={balanceAsOfDate} onChange={(event) => setBalanceAsOfDate(event.target.value)} /></label><label>quanto você quer preservar<span className="input-wrap"><span>R$</span><input required type="number" min="0" step="0.01" value={safetyMargin} onChange={(event) => setSafetyMargin(event.target.value)} placeholder="300,00" /></span></label></div><div className="onboarding-preview"><div><span>renda considerada</span><strong>{money(summary.income)}</strong></div><div><span>disponível hoje</span><strong>{money(summary.balance)}</strong></div><div><span>margem protegida</span><strong>{money(summary.margin)}</strong></div></div><div className="onboarding-help"><ShieldCheck size={16} /><span>Esse valor não é uma punição nem uma regra fixa. Você poderá ajustá-lo quando sua realidade mudar.</span></div><div className="onboarding-actions"><button className="secondary-admin-button" type="button" onClick={() => setStep(1)}><ArrowLeft size={16} /> voltar</button><button className="primary-button onboarding-button" type="submit" disabled={saving}><Check size={17} /> {saving ? "salvando..." : `começar, ${user?.name.split(" ")[0] ?? "vamos"}`}</button></div></form>}<div className="onboarding-footer"><WalletCards size={15} /><span>Você poderá revisar essas informações a qualquer momento.</span></div></section></main>;
}
