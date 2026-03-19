import {
  LayoutDashboard,
  Bot,
  ScrollText,
  Settings,
  Radio,
  ChevronRight,
} from "lucide-react";
import { motion } from "motion/react";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", id: "dashboard" },
  { icon: Bot, label: "Robôs", id: "robots" },
  { icon: ScrollText, label: "Histórico", id: "logs" },
  { icon: Settings, label: "Configurações", id: "settings" },
];

export default function Sidebar({ activePage, onNavigate }) {
  return (
    <aside className="fixed left-0 top-0 bottom-0 w-64 bg-surface-800/80 backdrop-blur-xl border-r border-white/5 z-50 flex flex-col">
      {/* Logo */}
      <div className="px-6 py-6 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center glow-accent">
              <Radio className="w-5 h-5 text-accent" />
            </div>
            <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-status-running rounded-full pulse-running" />
          </div>
          <div>
            <h1 className="font-display text-base font-bold tracking-tight text-white">
              RoboCommand
            </h1>
            <p className="font-mono text-[10px] text-accent tracking-widest uppercase">
              Control Center
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item, i) => {
          const isActive = activePage === item.id;
          const Icon = item.icon;
          return (
            <motion.button
              key={item.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.08, duration: 0.4 }}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group cursor-pointer ${
                isActive
                  ? "bg-accent/15 text-accent"
                  : "text-white/50 hover:bg-white/5 hover:text-white/80"
              }`}
            >
              <Icon
                className={`w-[18px] h-[18px] ${isActive ? "text-accent" : "text-white/30 group-hover:text-white/60"}`}
              />
              <span>{item.label}</span>
              {isActive && (
                <ChevronRight className="w-4 h-4 ml-auto text-accent/60" />
              )}
            </motion.button>
          );
        })}
      </nav>

      {/* System status footer */}
      <div className="px-4 py-4 border-t border-white/5">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-2 h-2 rounded-full bg-status-running pulse-running" />
          <span className="font-mono text-[11px] text-white/40">
            SISTEMA OPERACIONAL
          </span>
        </div>
        <div className="font-mono text-[10px] text-white/20">
          v1.0.0 — Última sync: agora
        </div>
      </div>
    </aside>
  );
}
