import { Search, Bell, RefreshCw, Wifi, WifiOff, Loader2 } from "lucide-react";
import { motion } from "motion/react";

export default function Header({ title, subtitle, connected, loading, onRefresh }) {
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
        <div className="flex items-center gap-3 mt-1">
          <p className="text-sm text-white/30 font-mono">{subtitle}</p>
          {/* Connection status */}
          <div className={`flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono ${
            connected
              ? "bg-status-running/10 text-status-running"
              : "bg-status-paused/10 text-status-paused"
          }`}>
            {connected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {connected ? "API CONECTADA" : "MODO DEMO"}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
          <input
            type="text"
            placeholder="Buscar robô..."
            className="bg-surface-700/50 border border-white/5 rounded-lg pl-9 pr-4 py-2 text-sm text-white/70 placeholder:text-white/20 focus:outline-none focus:border-accent/30 focus:ring-1 focus:ring-accent/20 w-64 transition-all"
          />
        </div>

        {/* Refresh */}
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

        {/* Notifications */}
        <button className="relative w-9 h-9 rounded-lg bg-surface-700/50 border border-white/5 flex items-center justify-center text-white/30 hover:text-white/60 hover:border-white/10 transition-all cursor-pointer">
          <Bell className="w-4 h-4" />
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-status-error rounded-full flex items-center justify-center">
            <span className="font-mono text-[8px] text-white font-bold">
              2
            </span>
          </div>
        </button>

        {/* User avatar */}
        <div className="w-9 h-9 rounded-lg bg-accent/20 border border-accent/30 flex items-center justify-center">
          <span className="font-bold text-xs text-accent">MM</span>
        </div>
      </div>
    </motion.header>
  );
}
