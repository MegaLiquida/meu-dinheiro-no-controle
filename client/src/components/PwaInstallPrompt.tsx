import { useEffect, useState } from "react";
import { Download, Share, Sparkles, X } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "mdnc-pwa-install-dismissed-v1";
export const PWA_HELP_EVENT = "mdnc:open-pwa-help";

export default function PwaInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [visible, setVisible] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    setInstalled(standalone);
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent) || (userAgent.includes("macintosh") && "ontouchend" in document);
    setIos(isIosDevice);

    let iosTimer: number | undefined;
    if (!standalone && isIosDevice && window.localStorage.getItem(DISMISS_KEY) !== "1") iosTimer = window.setTimeout(() => setVisible(true), 1200);
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      if (window.localStorage.getItem(DISMISS_KEY) !== "1") setVisible(true);
    };
    const handleInstalled = () => {
      window.localStorage.setItem(DISMISS_KEY, "1");
      setInstalled(true); setVisible(false); setInstallEvent(null);
    };
    const openHelp = () => setVisible(true);
    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    window.addEventListener(PWA_HELP_EVENT, openHelp);
    return () => {
      if (iosTimer) window.clearTimeout(iosTimer);
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
      window.removeEventListener(PWA_HELP_EVENT, openHelp);
    };
  }, []);

  function dismiss() {
    window.localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  }

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    window.localStorage.setItem(DISMISS_KEY, "1");
    setInstallEvent(null);
    setVisible(false);
    if (choice.outcome === "accepted") setInstalled(true);
  }

  if (!visible) return null;
  return <aside className="pwa-install-card" aria-label="Instalar aplicativo Meu Dinheiro no Controle" role="status"><button className="pwa-dismiss" type="button" aria-label="Fechar instruções de instalação" onClick={dismiss}><X size={15} /></button><div className="pwa-install-icon"><Sparkles size={18} /></div><div className="pwa-install-copy"><strong>{installed ? "Aplicativo já instalado" : "Leve seu controle com você"}</strong>{installed ? <span>Você já pode abrir o Meu Dinheiro pela tela inicial do dispositivo.</span> : ios ? <span>No Safari, toque em <Share size={12} /> e depois em <b>Adicionar à Tela de Início</b>.</span> : installEvent ? <span>Instale o Meu Dinheiro como um app para abrir mais rápido e usar na sua rotina.</span> : <span>Abra o menu do navegador e escolha <b>Instalar aplicativo</b> ou <b>Adicionar à tela inicial</b>.</span>}{!installed && !ios && installEvent && <button className="pwa-install-action" type="button" onClick={() => void install()}><Download size={13} /> instalar agora</button>}</div></aside>;
}
