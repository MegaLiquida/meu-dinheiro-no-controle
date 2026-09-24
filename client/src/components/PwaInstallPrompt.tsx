import { useEffect, useState } from "react";
import { Download, Share, Sparkles, X } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "mdnc-pwa-install-dismissed-v1";

export default function PwaInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    if (standalone || window.localStorage.getItem(DISMISS_KEY) === "1") return;

    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent) || (userAgent.includes("macintosh") && "ontouchend" in document);
    setIos(isIosDevice);
    if (isIosDevice) {
      const timer = window.setTimeout(() => setVisible(true), 1200);
      return () => window.clearTimeout(timer);
    }

    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
  }, []);

  function dismiss() {
    window.localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  }

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    setInstallEvent(null);
    if (choice.outcome === "accepted") setVisible(false);
  }

  if (!visible) return null;

  return <aside className="pwa-install-card" aria-label="Instalar aplicativo Meu Dinheiro no Controle"><button className="pwa-dismiss" type="button" aria-label="Fechar aviso de instalação" onClick={dismiss}><X size={15} /></button><div className="pwa-install-icon"><Sparkles size={18} /></div><div className="pwa-install-copy"><strong>Leve seu controle com você</strong>{ios ? <span>No Safari, toque em <Share size={12} /> e depois em <b>Adicionar à Tela de Início</b>.</span> : <span>Instale o Meu Dinheiro como um app para abrir mais rápido e usar como parte da sua rotina.</span>}{!ios && <button className="pwa-install-action" type="button" onClick={install}><Download size={13} /> instalar agora</button>}</div></aside>;
}
