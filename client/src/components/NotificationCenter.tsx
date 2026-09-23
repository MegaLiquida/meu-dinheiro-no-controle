import { useEffect, useState } from "react";
import { Bell, Check, CircleAlert, CircleCheck, CircleX, X } from "lucide-react";
import { toast } from "sonner";
import { api, type Notification } from "../lib/api";

export default function NotificationCenter({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  async function load() { setLoading(true); try { const result = await api.notifications(); setNotifications(result.notifications); setUnread(result.unread); } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível carregar os alertas."); } finally { setLoading(false); } }
  useEffect(() => { if (open) load(); }, [open]);
  async function markRead(item: Notification) { if (item.read) return; try { await api.markNotificationRead(item.id); setNotifications((current) => current.map((notification) => notification.id === item.id ? { ...notification, read: true } : notification)); setUnread((current) => Math.max(0, current - 1)); } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível atualizar o alerta."); } }
  if (!open) return null;
  return <div className="notification-popover"><div className="notification-popover-header"><div><span className="eyebrow">não deixe passar</span><h2><Bell size={16} /> Alertas</h2></div><button className="icon-button" type="button" aria-label="Fechar alertas" onClick={onClose}><X size={16} /></button></div>{loading ? <div className="notification-loading">Atualizando seus alertas...</div> : notifications.length === 0 ? <div className="notification-empty"><CircleCheck size={22} /><strong>Nenhum alerta novo</strong><span>Quando algo precisar de atenção, aparecerá aqui.</span></div> : <div className="notification-list">{notifications.map((item) => <button className={`notification-row notification-${item.tone} ${item.read ? "notification-read" : ""}`} type="button" key={item.id} onClick={() => markRead(item)}><span className="notification-icon">{item.tone === "danger" ? <CircleX size={16} /> : item.tone === "attention" ? <CircleAlert size={16} /> : <CircleCheck size={16} />}</span><span className="notification-copy"><strong>{item.title}</strong><small>{item.detail}</small>{!item.read && <em>toque para marcar como visto</em>}</span>{!item.read && <Check size={13} className="notification-check" />}</button>)}</div>}{unread > 0 && <div className="notification-footer">Você tem {unread} alerta{unread > 1 ? "s" : ""} para revisar.</div>}</div>;
}
