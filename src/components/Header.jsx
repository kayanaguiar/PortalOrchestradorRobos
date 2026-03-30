import { useState, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { Search, Bell, RefreshCw, Loader2, XCircle, AlertTriangle, X, LogOut, Lock, ChevronDown, Sun, Moon, Menu } from "lucide-react";
import { motion } from "motion/react";
import ExpandableLog from "./ExpandableLog";

function formatTimeAgo(ts) {
  if (!ts) return "";
  const diff = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export default function Header({ title, subtitle, loading, onRefresh, searchTerm, onSearchChange, notifications = [], onDismissNotification, onClearNotifications, onNotificationClick, lastUpdated, user, onLogout, onChangePassword, theme, onToggleTheme, isMobile, onMenuToggle }) {
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
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
        {notifications.map((notif) => {
          const isClickable = !!notif.robotId;
          return (
            <div
              key={notif.id}
              onClick={() => {
                if (isClickable) {
                  onNotificationClick?.(notif);
                  setShowNotifications(false);
                }
              }}
              className={`px-4 py-3 hover:bg-white/[0.02] transition-colors group ${isClickable ? "cursor-pointer" : ""}`}
            >
              <div className="flex items-start gap-3">
                {notif.type === "error" ? (
                  <XCircle className="w-4 h-4 text-status-error shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-status-paused shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-medium text-white/80">{notif.title}</p>
                    {isClickable && (
                      <span className="text-[9px] font-mono text-accent/50">VER LOGS</span>
                    )}
                  </div>
                  <ExpandableLog
                    message={notif.detail}
                    className="text-[11px] text-white/30 font-mono mt-0.5 block"
                  />
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
          );
        })}
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
      <div className="flex items-center gap-3">
        {isMobile && (
          <button
            onClick={onMenuToggle}
            className="w-9 h-9 rounded-lg bg-surface-700/50 border border-white/5 flex items-center justify-center text-white/30 hover:text-white/60 transition-all cursor-pointer"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        <div>
          <h1 className={`font-bold text-white tracking-tight ${isMobile ? "text-lg" : "text-2xl"}`}>
            {title}
          </h1>
          {!isMobile && <p className="text-sm text-white/30 font-mono mt-1">{subtitle}</p>}
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-3">
        {/* Search */}
        {!isMobile && (
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
        )}

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

        {/* Theme toggle */}
        <button
          onClick={onToggleTheme}
          title={theme === "dark" ? "Tema claro" : "Tema escuro"}
          className="w-9 h-9 rounded-lg bg-surface-700/50 border border-white/5 flex items-center justify-center text-white/30 hover:text-white/60 hover:border-white/10 transition-all cursor-pointer"
        >
          {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

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

        {/* User menu */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu((o) => !o)}
            className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-lg hover:bg-white/5 transition-all cursor-pointer"
          >
            <div className="w-9 h-9 rounded-lg bg-accent/20 border border-accent/30 flex items-center justify-center">
              <span className="font-bold text-xs text-accent">
                {(user?.name || "U").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
              </span>
            </div>
            <ChevronDown className={`w-3.5 h-3.5 text-white/20 transition-transform ${showUserMenu ? "rotate-180" : ""}`} />
          </button>
          {showUserMenu && (
            <>
              <div className="fixed inset-0 z-[9998]" onClick={() => setShowUserMenu(false)} />
              <div className="absolute right-0 top-full mt-2 w-56 z-[9999] rounded-xl border border-white/10 bg-surface-800 shadow-2xl shadow-black/50 overflow-hidden">
                <div className="px-4 py-3 border-b border-white/5">
                  <p className="text-sm font-medium text-white/80 truncate">{user?.name}</p>
                  <p className="text-[11px] text-white/30 font-mono truncate">{user?.email}</p>
                </div>
                <div className="py-1">
                  <button
                    onClick={() => { setShowUserMenu(false); onChangePassword?.(); }}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-white/60 hover:bg-white/[0.04] hover:text-white/80 transition-colors cursor-pointer"
                  >
                    <Lock className="w-4 h-4" />
                    Alterar Senha
                  </button>
                  <button
                    onClick={() => { setShowUserMenu(false); onLogout?.(); }}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-status-error/70 hover:bg-status-error/5 hover:text-status-error transition-colors cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                    Sair
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {notificationPanel}
    </motion.header>
  );
}
