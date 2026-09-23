import { FormEvent, useState } from "react";
import { Leaf, LogIn, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../contexts/AuthContext";

export default function Auth() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      if (mode === "login") await login(email, password);
      else await register(name, email, password);
      toast.success(mode === "login" ? "Bem-vindo de volta." : "Conta criada com sucesso.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível continuar.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-shell">
      <div className="auth-glow auth-glow-left" />
      <div className="auth-glow auth-glow-right" />
      <section className="auth-card">
        <div className="auth-brand"><span className="brand-mark"><Leaf size={21} /></span><span><strong>Meu Dinheiro</strong><small>no controle</small></span></div>
        <div className="auth-heading"><span className="eyebrow">seu dinheiro, sem mistério</span><h1>{mode === "login" ? "Entre na sua conta." : "Comece a se organizar."}</h1><p>{mode === "login" ? "Acompanhe seus compromissos e decida com mais tranquilidade." : "Crie seu ambiente financeiro pessoal em poucos passos."}</p></div>
        <form className="auth-form" onSubmit={submit}>
          {mode === "register" && <label>seu nome<input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Como podemos chamar você?" /></label>}
          <label>e-mail<input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@email.com" /></label>
          <label>senha<input required minLength={8} type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="mínimo de 8 caracteres" /></label>
          <button className="primary-button auth-submit" type="submit" disabled={submitting}>{mode === "login" ? <LogIn size={17} /> : <UserPlus size={17} />}{submitting ? "aguarde..." : mode === "login" ? "entrar" : "criar minha conta"}</button>
        </form>
        <div className="auth-switch">{mode === "login" ? "Ainda não tem uma conta?" : "Já tem uma conta?"}<button type="button" onClick={() => setMode(mode === "login" ? "register" : "login")}>{mode === "login" ? "Criar conta" : "Entrar"}</button></div>
        <p className="auth-note">Seus dados financeiros ficam vinculados somente à sua conta.</p>
      </section>
    </main>
  );
}
