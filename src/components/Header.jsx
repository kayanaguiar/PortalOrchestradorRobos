import { useState, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { Search, Bell, RefreshCw, Loader2, XCircle, AlertTriangle, X } from "lucide-react";
import { motion } from "motion/react";

function formatTimeAgo(ts) {
  if (!ts) return "";
  const diff = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export default function Header({ title, subtitle, loading, onRefresh, searchTerm, onSearchChange, notifications = [], onDismissNotification, onClearNotifications, lastUpdated }) {
  const [showNotifications, setShowNotifications] = useState(false);
  const [tick, setTick] = useState(0);

  // Atualiza o "há Xs" a cada segundo
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const timeAgoLabel = useMemo(() => {
    if (!lastUpdated) return null;
    const diff = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
    if (diff < 5) return "agora";
    if (diff < 60) return `${diff}s`;
    if (diff < 3600) return `${Math.floor(diff / 60)}min`;
    return `${Math.floor(diff / 3600)}h`;
  }, [lastUpdated, tick]);
  const bellRef = useRef(null);
  const panelRef = useRef(null);
  const [panelPos, setPanelPos] = useState({ top: 0, right: 0 });

  const count = notifications.length;

  useEffect(() => {
    if (showNotifications && bellRef.current) {
      const rect = bellRef.current.getBoundingClientRect();
      setPanelPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    }
  }, [showNotifications]);

  useEffect(() => {
    if (!showNotifications) return;
    function handleClick(e) {
      if (
        bellRef.current && !bellRef.current.contains(e.target) &&
        panelRef.current && !panelRef.current.contains(e.target)
      ) {
        setShowNotifications(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showNotifications]);

  const notificationPanel = showNotifications && createPortal(
    <div
      ref={panelRef}
      style={{ position: "fixed", top: panelPos.top, right: panelPos.right }}
      className="z-[9999] w-96 max-h-96 rounded-xl border border-white/10 bg-surface-800 shadow-2xl shadow-black/50 overflow-hidden"
    >
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <span className="text-sm font-semibold text-white">Notificações</span>
        {count > 0 && (
          <button
            onClick={() => { onClearNotifications?.(); setShowNotifications(false); }}
            className="text-[10px] font-mono text-accent hover:text-accent-light transition-colors cursor-pointer"
          >
            Limpar tudo
          </button>
        )}
      </div>
      <div className="overflow-y-auto max-h-80 divide-y divide-white/[0.03]">
        {notifications.length === 0 && (
          <div className="px-4 py-8 text-center text-white/20 text-sm">
            Nenhuma notificação
          </div>
        )}
        {notifications.map((notif) => (
          <div key={notif.id} className="px-4 py-3 hover:bg-white/[0.02] transition-colors group">
            <div className="flex items-start gap-3">
              {notif.type === "error" ? (
                <XCircle className="w-4 h-4 text-status-error shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-status-paused shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-white/80">{notif.title}</p>
                <p className="text-[11px] text-white/30 font-mono mt-0.5 truncate">{notif.detail}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] text-white/20 font-mono">
                  {formatTimeAgo(notif.timestamp)}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); onDismissNotification?.(notif.id); }}
                  className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded flex items-center justify-center text-white/20 hover:text-white/60 hover:bg-white/5 transition-all cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>,
    document.body
  );

  return (
    <motion.header
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="flex items-center justify-between mb-8"
    >
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">
          {title}
        </h1>
        <p className="text-sm text-white/30 font-mono mt-1">{subtitle}</p>
      </div>

      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar no portal..."
            className="bg-surface-700/50 border border-white/5 rounded-lg pl-9 pr-4 py-2 text-sm text-white/70 placeholder:text-white/20 focus:outline-none focus:border-accent/30 focus:ring-1 focus:ring-accent/20 w-64 transition-all"
          />
        </div>

        {/* Refresh + last updated */}
        <div className="flex items-center gap-1.5">
          {timeAgoLabel && (
            <span className="font-mono text-[10px] text-white/20">{timeAgoLabel}</span>
          )}
          <button
            onClick={onRefresh}
            className="w-9 h-9 rounded-lg bg-surface-700/50 border border-white/5 flex items-center justify-center text-white/30 hover:text-white/60 hover:border-white/10 transition-all cursor-pointer"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Notifications */}
        <button
          ref={bellRef}
          onClick={() => setShowNotifications((o) => !o)}
          className={`relative w-9 h-9 rounded-lg bg-surface-700/50 border flex items-center justify-center transition-all cursor-pointer ${
            count > 0
              ? "border-status-error/30 text-status-error hover:bg-status-error/10"
              : "border-white/5 text-white/30 hover:text-white/60 hover:border-white/10"
          }`}
        >
          <Bell className="w-4 h-4" />
          {count > 0 && (
            <div className="absolute -top-1 -right-1 min-w-4 h-4 px-1 bg-status-error rounded-full flex items-center justify-center">
              <span className="font-mono text-[8px] text-white font-bold">
                {count > 99 ? "99+" : count}
              </span>
            </div>
          )}
        </button>

        {/* User avatar */}
        <div className="w-9 h-9 rounded-lg bg-accent/20 border border-accent/30 flex items-center justify-center">
          <span className="font-bold text-xs text-accent">MM</span>
        </div>
      </div>

      {notificationPanel}
    </motion.header>
  );
}
