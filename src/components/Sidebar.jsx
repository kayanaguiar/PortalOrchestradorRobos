import {
  LayoutDashboard,
  Bot,
  ScrollText,
  Settings,
  Timer,
  Radio,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  Users,
  ClipboardList,
  X,
} from "lucide-react";
import { motion } from "motion/react";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", id: "dashboard" },
  { icon: Bot, label: "Robôs", id: "robots" },
  { icon: ScrollText, label: "Histórico", id: "logs" },
  { icon: Timer, label: "Gatilhos", id: "triggers" },
  { icon: ClipboardList, label: "Auditoria", id: "audit", adminOnly: true },
  { icon: Users, label: "Usuários", id: "users", adminOnly: true },
  { icon: Settings, label: "Configurações", id: "settings" },
];

export default function Sidebar({ activePage, onNavigate, collapsed, onToggle, userRole, isMobile, mobileOpen, onMobileClose }) {
  // Mobile: overlay
  if (isMobile) {
    if (!mobileOpen) return null;
    return (
      <>
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={onMobileClose} />
        <aside className="fixed left-0 top-0 bottom-0 w-64 bg-surface-800/95 backdrop-blur-xl border-r border-white/5 z-50 flex flex-col">
          <SidebarContent
            activePage={activePage}
            onNavigate={onNavigate}
            collapsed={false}
            userRole={userRole}
          />
          <div className="absolute top-4 right-3">
            <button onClick={onMobileClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-white/30 hover:text-white/60 hover:bg-white/5 cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        </aside>
      </>
    );
  }

  // Desktop
  return (
    <aside className={`fixed left-0 top-0 bottom-0 bg-surface-800/80 backdrop-blur-xl border-r border-white/5 z-50 flex flex-col transition-all duration-300 ${collapsed ? "w-16" : "w-64"}`}>
      <SidebarContent
        activePage={activePage}
        onNavigate={onNavigate}
        collapsed={collapsed}
        userRole={userRole}
      />
      {/* Toggle button */}
      <div className={`py-2 border-t border-white/5 ${collapsed ? "px-2" : "px-3"}`}>
        <button
          onClick={onToggle}
          className={`w-full flex items-center gap-2 rounded-lg py-2 text-white/30 hover:text-white/60 hover:bg-white/5 transition-all cursor-pointer ${collapsed ? "justify-center px-0" : "px-3"}`}
        >
          {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          {!collapsed && <span className="text-xs">Recolher</span>}
        </button>
      </div>
    </aside>
  );
}

function SidebarContent({ activePage, onNavigate, collapsed, userRole }) {
  return (
    <>
      {/* Logo */}
      <div className={`py-6 border-b border-white/5 ${collapsed ? "px-3" : "px-6"}`}>
        <div className="flex items-center gap-3">
          <div className="relative shrink-0">
            <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center glow-accent">
              <Radio className="w-5 h-5 text-accent" />
            </div>
            <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-status-running rounded-full pulse-running" />
          </div>
          {!collapsed && (
            <div>
              <h1 className="font-display text-base font-bold tracking-tight text-white">
                RoboCommand
              </h1>
              <p className="font-mono text-[10px] text-accent tracking-widest uppercase">
                Control Center
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className={`flex-1 py-4 space-y-1 ${collapsed ? "px-2" : "px-3"}`}>
        {navItems.filter(item => !item.adminOnly || userRole === "admin").map((item, i) => {
          const isActive = activePage === item.id;
          const Icon = item.icon;
          return (
            <motion.button
              key={item.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.08, duration: 0.4 }}
              onClick={() => onNavigate(item.id)}
              title={collapsed ? item.label : undefined}
              className={`w-full flex items-center gap-3 rounded-lg text-sm font-medium transition-all duration-200 group cursor-pointer ${
                collapsed ? "px-0 py-2.5 justify-center" : "px-3 py-2.5"
              } ${
                isActive
                  ? "bg-accent/15 text-accent"
                  : "text-white/50 hover:bg-white/5 hover:text-white/80"
              }`}
            >
              <Icon
                className={`w-4.5 h-4.5 shrink-0 ${isActive ? "text-accent" : "text-white/30 group-hover:text-white/60"}`}
              />
              {!collapsed && <span>{item.label}</span>}
              {!collapsed && isActive && (
                <ChevronRight className="w-4 h-4 ml-auto text-accent/60" />
              )}
            </motion.button>
          );
        })}
      </nav>
    </>
  );
}
