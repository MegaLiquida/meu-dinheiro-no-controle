import { FormEvent, useState } from "react";
import { Check, Leaf, LogIn, Mail, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";

type AuthMode = "login" | "register" | "forgot" | "reset";

function initialMode(): AuthMode {
  return new URLSearchParams(window.location.hash.replace(/^#/, "")).has("reset") ? "reset" : "login";
}

export default function Auth() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const resetToken = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("reset") ?? "";

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      if (mode === "forgot") {
        const result = await api.requestPasswordReset(email);
        toast.success(result.message);
        setMode("login");
      } else if (mode === "reset") {
        if (!resetToken) throw new Error("O link de redefinição não foi encontrado.");
        await api.confirmPasswordReset({ token: resetToken, newPassword: password });
        window.history.replaceState({}, "", window.location.pathname);
        setPassword("");
        setMode("login");
        toast.success("Senha atualizada. Você já pode entrar novamente.");
      } else if (mode === "login") {
        await login(email, password);
        toast.success("Bem-vindo de volta.");
      } else {
        await register(name, email, password);
        toast.success("Conta criada com sucesso.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível continuar.");
    } finally {
      setSubmitting(false);
    }
  }

  const heading = mode === "login"
    ? { title: "Retome o controle com calma.", detail: "Veja o que entra, proteja o essencial e escolha um próximo passo possível." }
    : mode === "register"
      ? { title: "Comece sua reconstrução financeira.", detail: "Crie seu espaço para organizar contas, dívidas e próximos passos sem julgamento." }
      : mode === "forgot"
        ? { title: "Vamos recuperar seu acesso.", detail: "Informe seu e-mail. Se houver uma conta, enviaremos um link para criar uma nova senha." }
        : { title: "Escolha uma nova senha.", detail: "Use pelo menos 8 caracteres. O link é temporário e pode ser usado uma única vez." };

  return (
    <main className="auth-shell">
      <div className="auth-glow auth-glow-left" />
      <div className="auth-glow auth-glow-right" />
      <section className="auth-card">
        <div className="auth-brand"><span className="brand-mark"><Leaf size={21} /></span><span><strong>Meu Dinheiro</strong><small>reconstrução financeira</small></span></div>
        <div className="auth-heading"><span className="eyebrow">reconstrução financeira · um passo de cada vez</span><h1>{heading.title}</h1><p>{heading.detail}</p></div>
        <form className="auth-form" onSubmit={submit}>
          {mode === "register" && <label>seu nome<input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Como podemos chamar você?" /></label>}
          <label>e-mail<input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@email.com" /></label>
          {mode !== "forgot" && <label>{mode === "reset" ? "nova senha" : "senha"}<input required minLength={8} type="password" autoComplete={mode === "reset" ? "new-password" : mode === "login" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="mínimo de 8 caracteres" /></label>}
          <button className="primary-button auth-submit" type="submit" disabled={submitting}>{mode === "login" ? <LogIn size={17} /> : mode === "register" ? <UserPlus size={17} /> : mode === "forgot" ? <Mail size={17} /> : <Check size={17} />}{submitting ? "aguarde..." : mode === "login" ? "entrar" : mode === "register" ? "criar minha conta" : mode === "forgot" ? "enviar instruções" : "salvar nova senha"}</button>
        </form>
        {mode === "login" && <div className="auth-switch"><button type="button" onClick={() => setMode("forgot")}>esqueci minha senha</button></div>}
        {mode === "forgot" && <div className="auth-switch">Lembrou sua senha?<button type="button" onClick={() => setMode("login")}>Voltar para entrar</button></div>}
        {mode === "reset" && <div className="auth-switch"><button type="button" onClick={() => setMode("login")}>Voltar para entrar</button></div>}
        {(mode === "login" || mode === "register") && <div className="auth-switch">{mode === "login" ? "Ainda não tem uma conta?" : "Já tem uma conta?"}<button type="button" onClick={() => setMode(mode === "login" ? "register" : "login")}>{mode === "login" ? "Criar conta" : "Entrar"}</button></div>}
        <p className="auth-note">Sua conta é pessoal: seus dados financeiros ficam vinculados somente a você.</p>
      </section>
    </main>
  );
}
