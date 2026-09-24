import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((error) => {
      console.warn("Não foi possível registrar a experiência offline da PWA.", error);
    });
  });
}

createRoot(document.getElementById("root")!).render(<App />);
