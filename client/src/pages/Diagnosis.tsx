import { FormEvent, useEffect, useMemo, useState } from "react";
import { Calculator, Check, CircleHelp, Pencil, Plus, Power, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { api, type Diagnosis as DiagnosisData, type EssentialCategory, type EssentialExpense, type IncomeFrequency } from "../lib/api";

const today = new Date().toISOString().slice(0, 10);
const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const categoryLabels: Record<EssentialCategory, string> = {
  housing: "Moradia",
  utilities: "Água, luz e serviços básicos",
  food: "Alimentação",
  health: "Saúde",
  transport: "Transporte",
  education: "Educação",
  child_support: "Pensão e cuidados",
  insurance: "Seguros essenciais",
  taxes: "Impostos obrigatórios",
  other: "Outra despesa essencial",
};

type DiagnosisForm = {
  incomeAmount: string;
  incomeFrequency: IncomeFrequency;
  conservativeMonthlyIncome: string;
  variableIncome: string;
  dependents: string;
  currentBalance: string;
  balanceAsOfDate: string;
  nextIncomeDate: string;
  existingMonthlyCommitments: string;
  safetyMargin: string;
  notes: string;
};

const emptyExpense = { name: "", category: "housing" as EssentialCategory, monthlyAmount: "", required: true, active: true };

export default function Diagnosis() {
  const [diagnosis, setDiagnosis] = useState<DiagnosisData | null>(null);
  const [expenses, setExpenses] = useState<EssentialExpense[]>([]);
  const [form, setForm] = useState<DiagnosisForm>({ incomeAmount: "", incomeFrequency: "monthly", conservativeMonthlyIncome: "", variableIncome: "", dependents: "0", currentBalance: "", balanceAsOfDate: today, nextIncomeDate: "", existingMonthlyCommitments: "", safetyMargin: "", notes: "" });
  const [expenseForm, setExpenseForm] = useState(emptyExpense);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const result = await api.diagnosis();
      setDiagnosis(result.diagnosis);
      setExpenses(result.essentialExpenses);
      setForm({
        incomeAmount: String(result.diagnosis.monthlyIncome || ""),
        incomeFrequency: result.diagnosis.incomeFrequency,
        conservativeMonthlyIncome: String(result.diagnosis.conservativeMonthlyIncome || ""),
        variableIncome: String(result.diagnosis.variableIncome || ""),
        dependents: String(result.diagnosis.dependents),
        currentBalance: String(result.diagnosis.currentBalance || ""),
        balanceAsOfDate: result.diagnosis.balanceAsOfDate || today,
        nextIncomeDate: result.diagnosis.nextIncomeDate ?? "",
        existingMonthlyCommitments: String(result.diagnosis.existingMonthlyCommitments || ""),
        safetyMargin: String(result.diagnosis.safetyMargin || ""),
        notes: result.diagnosis.notes ?? "",
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar seu diagnóstico.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void reload(); }, []);

  const localEssentialFloor = useMemo(() => expenses.filter((item) => item.active).reduce((sum, item) => sum + item.monthlyAmount, 0), [expenses]);
  const conservativeIncome = Number(form.conservativeMonthlyIncome) || 0;
  const frequencyFactor = form.incomeFrequency === "weekly" ? 52 / 12 : form.incomeFrequency === "biweekly" ? 26 / 12 : 1;
  const normalizedIncome = form.incomeFrequency === "irregular" ? conservativeIncome : (Number(form.incomeAmount) || 0) * frequencyFactor;
  const estimatedCapacity = Math.max(0, normalizedIncome - localEssentialFloor - (Number(form.existingMonthlyCommitments) || 0) - (Number(form.safetyMargin) || 0));
  const irregularError = form.incomeFrequency === "irregular" && conservativeIncome <= 0;

  async function saveDiagnosis(event: FormEvent) {
    event.preventDefault();
    if (Number(form.incomeAmount) <= 0 || irregularError) return;
    setSaving(true);
    try {
      await api.saveDiagnosis({
        incomeAmount: Number(form.incomeAmount),
        incomeFrequency: form.incomeFrequency,
        conservativeMonthlyIncome: form.incomeFrequency === "irregular" ? conservativeIncome : null,
        variableIncome: Number(form.variableIncome) || 0,
        dependents: Number(form.dependents) || 0,
        currentBalance: Number(form.currentBalance) || 0,
        balanceAsOfDate: form.balanceAsOfDate,
        nextIncomeDate: form.nextIncomeDate || null,
        existingMonthlyCommitments: Number(form.existingMonthlyCommitments) || 0,
        safetyMargin: Number(form.safetyMargin) || 0,
        notes: form.notes.trim() || null,
      });
      toast.success("Diagnóstico atualizado. Sua capacidade foi recalculada.");
      await reload();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Não foi possível salvar o diagnóstico.");
    } finally {
      setSaving(false);
    }
  }

  async function saveExpense(event: FormEvent) {
    event.preventDefault();
    if (!expenseForm.name.trim() || Number(expenseForm.monthlyAmount) < 0) return;
    try {
      const payload = { ...expenseForm, name: expenseForm.name.trim(), monthlyAmount: Number(expenseForm.monthlyAmount) };
      if (editingExpenseId) await api.updateEssentialExpense(editingExpenseId, payload);
      else await api.addEssentialExpense(payload);
      toast.success(editingExpenseId ? "Despesa essencial atualizada." : "Despesa essencial adicionada.");
      setExpenseForm(emptyExpense);
      setEditingExpenseId(null);
      await reload();
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Não foi possível salvar a despesa."); }
  }

  function editExpense(expense: EssentialExpense) {
    setEditingExpenseId(expense.id);
    setExpenseForm({ name: expense.name, category: expense.category, monthlyAmount: String(expense.monthlyAmount), required: expense.required, active: expense.active });
  }

  async function toggleExpense(expense: EssentialExpense) {
    try { await api.updateEssentialExpense(expense.id, { active: !expense.active }); await reload(); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : "Não foi possível atualizar a despesa."); }
  }

  async function deleteExpense(expense: EssentialExpense) {
    if (!window.confirm(`Excluir “${expense.name}” do orçamento essencial?`)) return;
    try { await api.deleteEssentialExpense(expense.id); toast.success("Despesa excluída."); await reload(); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : "Não foi possível excluir a despesa."); }
  }

  if (loading) return <div className="page-stack"><div className="auth-loading" role="status">Carregando seu diagnóstico...</div></div>;
  if (error) return <div className="persistent-error" role="alert"><strong>Seu diagnóstico não carregou.</strong><span>{error}</span><button className="primary-button" type="button" onClick={() => void reload()}>Tentar novamente</button></div>;

  return <div className="page-stack page-enter diagnosis-page">
    <div className="section-heading"><div><div className="eyebrow">seu ponto de partida</div><h1>Diagnóstico financeiro</h1></div><p className="section-detail">Uma leitura prática da sua renda, do que protege o básico e do que pode ir para a recuperação.</p></div>

    <section className="diagnosis-summary" aria-live="polite">
      <div><span>renda mensal normalizada</span><strong>{money(diagnosis?.normalizedMonthlyIncome ?? normalizedIncome)}</strong><small>ajustada conforme a frequência informada</small></div>
      <div><span>piso essencial</span><strong>{money(diagnosis?.essentialFloor ?? localEssentialFloor)}</strong><small>soma das despesas essenciais ativas</small></div>
      <div><span>capacidade segura</span><strong>{money(diagnosis?.safeCapacity ?? estimatedCapacity)}</strong><small>estimativa mensal disponível para o plano</small></div>
      <p><CircleHelp size={16} /> Capacidade operacional conservadora. Esta estimativa ajuda no planejamento, mas <strong>não representa mínimo existencial legal nem aconselhamento jurídico</strong>.</p>
    </section>

    <form className="panel diagnosis-form" onSubmit={saveDiagnosis} noValidate>
      <div className="diagnosis-step-heading"><span>1</span><div><h2>Renda e frequência</h2><p>Informe o valor por período. A conversão mensal é feita sem inventar entradas.</p></div></div>
      <div className="diagnosis-fields">
        <label htmlFor="diagnosis-income">valor que entra por período<input id="diagnosis-income" required type="number" min="0.01" step="0.01" value={form.incomeAmount} onChange={(event) => setForm({ ...form, incomeAmount: event.target.value })} aria-invalid={Number(form.incomeAmount) <= 0} aria-describedby="diagnosis-income-help" /></label>
        <label htmlFor="diagnosis-frequency">frequência<select id="diagnosis-frequency" value={form.incomeFrequency} onChange={(event) => setForm({ ...form, incomeFrequency: event.target.value as IncomeFrequency })}><option value="monthly">mensal</option><option value="biweekly">a cada quinze dias</option><option value="weekly">semanal</option><option value="irregular">irregular</option></select></label>
        <span id="diagnosis-income-help" className="field-help">Valor recebido em cada período, antes da normalização mensal.</span>
        {form.incomeFrequency === "irregular" && <label htmlFor="diagnosis-conservative" className="full-field">estimativa conservadora mensal<input id="diagnosis-conservative" required type="number" min="0.01" step="0.01" value={form.conservativeMonthlyIncome} onChange={(event) => setForm({ ...form, conservativeMonthlyIncome: event.target.value })} aria-invalid={irregularError} aria-describedby="diagnosis-conservative-error" />{irregularError && <span id="diagnosis-conservative-error" className="field-error" role="alert">Para renda irregular, informe uma estimativa mensal conservadora maior que zero.</span>}</label>}
        <label htmlFor="diagnosis-variable">renda variável adicional<input id="diagnosis-variable" type="number" min="0" step="0.01" value={form.variableIncome} onChange={(event) => setForm({ ...form, variableIncome: event.target.value })} /></label>
        <label htmlFor="diagnosis-next-income">próxima entrada<input id="diagnosis-next-income" type="date" value={form.nextIncomeDate} onChange={(event) => setForm({ ...form, nextIncomeDate: event.target.value })} /></label>
      </div>

      <div className="diagnosis-step-heading"><span>2</span><div><h2>Contexto e compromissos</h2><p>Esses dados ajudam a manter o plano compatível com sua realidade.</p></div></div>
      <div className="diagnosis-fields">
        <label htmlFor="diagnosis-dependents"><Users size={14} /> dependentes<input id="diagnosis-dependents" type="number" min="0" max="100" value={form.dependents} onChange={(event) => setForm({ ...form, dependents: event.target.value })} /></label>
        <label htmlFor="diagnosis-commitments">outros compromissos mensais<input id="diagnosis-commitments" type="number" min="0" step="0.01" value={form.existingMonthlyCommitments} onChange={(event) => setForm({ ...form, existingMonthlyCommitments: event.target.value })} /></label>
        <label htmlFor="diagnosis-balance">saldo disponível hoje<input id="diagnosis-balance" type="number" step="0.01" value={form.currentBalance} onChange={(event) => setForm({ ...form, currentBalance: event.target.value })} /></label>
        <label htmlFor="diagnosis-balance-date">data do saldo<input id="diagnosis-balance-date" required type="date" value={form.balanceAsOfDate} onChange={(event) => setForm({ ...form, balanceAsOfDate: event.target.value })} /></label>
        <label htmlFor="diagnosis-margin">margem para imprevistos<input id="diagnosis-margin" type="number" min="0" step="0.01" value={form.safetyMargin} onChange={(event) => setForm({ ...form, safetyMargin: event.target.value })} /></label>
        <label htmlFor="diagnosis-notes">observações<textarea id="diagnosis-notes" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Algo que precisa ser considerado no seu mês?" /></label>
      </div>
      <div className="diagnosis-live-summary" role="status"><Calculator size={18} /><span>Estimativa antes de salvar: <strong>{money(estimatedCapacity)}</strong> por mês após piso essencial, compromissos e margem.</span></div>
      <button className="primary-button" type="submit" disabled={saving || irregularError || Number(form.incomeAmount) <= 0}><Check size={16} /> {saving ? "recalculando..." : "salvar e recalcular"}</button>
    </form>

    <section className="panel essential-panel">
      <div className="diagnosis-step-heading"><span>3</span><div><h2>Orçamento essencial</h2><p>Cadastre apenas o que sustenta sua rotina básica. Itens inativos não entram no piso.</p></div></div>
      <form className="essential-form" onSubmit={saveExpense}>
        <label htmlFor="expense-name">despesa<input id="expense-name" required minLength={2} value={expenseForm.name} onChange={(event) => setExpenseForm({ ...expenseForm, name: event.target.value })} placeholder="Ex.: aluguel" /></label>
        <label htmlFor="expense-category">categoria<select id="expense-category" value={expenseForm.category} onChange={(event) => setExpenseForm({ ...expenseForm, category: event.target.value as EssentialCategory })}>{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label htmlFor="expense-amount">valor mensal<input id="expense-amount" required type="number" min="0" step="0.01" value={expenseForm.monthlyAmount} onChange={(event) => setExpenseForm({ ...expenseForm, monthlyAmount: event.target.value })} /></label>
        <label className="check-field"><input type="checkbox" checked={expenseForm.required} onChange={(event) => setExpenseForm({ ...expenseForm, required: event.target.checked })} /> indispensável neste momento</label>
        <button className="primary-button" type="submit"><Plus size={16} /> {editingExpenseId ? "atualizar despesa" : "adicionar despesa"}</button>
        {editingExpenseId && <button className="text-action" type="button" onClick={() => { setEditingExpenseId(null); setExpenseForm(emptyExpense); }}>cancelar edição</button>}
      </form>
      {expenses.length === 0 ? <div className="empty-state compact"><Calculator size={24} /><strong>Nenhuma despesa essencial cadastrada</strong><span>Comece por moradia, alimentação, saúde e transporte, conforme sua realidade.</span></div> : <div className="essential-list">{expenses.map((expense) => <article className={`essential-row ${expense.active ? "" : "is-inactive"}`} key={expense.id}><div><strong>{expense.name}</strong><span>{categoryLabels[expense.category]} · {expense.required ? "marcada como indispensável" : "ajustável"}</span></div><b>{money(expense.monthlyAmount)}</b><div className="row-actions"><button type="button" onClick={() => editExpense(expense)} aria-label={`Editar ${expense.name}`}><Pencil size={15} /></button><button type="button" onClick={() => void toggleExpense(expense)} aria-label={`${expense.active ? "Desativar" : "Ativar"} ${expense.name}`}><Power size={15} /></button><button type="button" onClick={() => void deleteExpense(expense)} aria-label={`Excluir ${expense.name}`}><Trash2 size={15} /></button></div></article>)}</div>}
    </section>
  </div>;
}

export { categoryLabels };
