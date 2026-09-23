import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import Admin from "./pages/Admin";
import Auth from "./pages/Auth";
import Home from "./pages/Home";

function LoadingScreen() {
  return <main className="auth-shell"><div className="auth-loading">Carregando seu ambiente financeiro...</div></main>;
}

function ProtectedApp() {
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();
  if (loading) return <LoadingScreen />;
  if (!user) return <Auth />;

  return (
    <Switch>
      <Route path="/admin">
        {user.role === "client" ? <><Home /><button className="route-notice" type="button" onClick={() => navigate("/")}>Acesso administrativo indisponível para este perfil.</button></> : <Admin />}
      </Route>
      <Route path="/" component={Home} />
      <Route component={Home} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <AuthProvider>
          <TooltipProvider>
            <Toaster position="bottom-right" />
            <ProtectedApp />
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
