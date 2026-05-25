import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Bot, Zap, XCircle, Monitor, Server, Wifi, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export default function StatsPanel({ robots, jobs, sessions }) {
  const totalJobs = jobs.length;
  const faultedJobs = jobs.filter((j) => j.State === "Faulted").length;
  const runningRobots = robots.filter((r) => r.status === "running").length;
  const activeAssistants = sessions.filter(
    (s) => s.State === "Available" && s.Source === "Assistant"
  );
  const assistantCount = activeAssistants.length;
  const totalRobots = robots.length;

  const [showAssistants, setShowAssistants] = useState(false);
  const assistantCardRef = useRef(null);
  const panelRef = useRef(null);
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!showAssistants) return;

    function updatePosition() {
      if (assistantCardRef.current) {
        const rect = assistantCardRef.current.getBoundingClientRect();
        setPanelPos({ top: rect.bottom + 8, left: rect.left });
      }
    }

    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);

    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [showAssistants]);

  useEffect(() => {
    if (!showAssistants) return;
    function handleClick(e) {
      if (
        assistantCardRef.current && !assistantCardRef.current.contains(e.target) &&
        panelRef.current && !panelRef.current.contains(e.target)
      ) {
        setShowAssistants(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showAssistants]);

  const stats = [
    {
      label: "Robôs",
      value: totalRobots,
      icon: Bot,
      color: "text-white/70",
      bgColor: "bg-white/5",
      borderColor: "border-white/10",
    },
    {
      label: "Assistants Ativos",
      value: assistantCount,
      icon: Monitor,
      color: "text-status-paused",
      bgColor: "bg-status-paused/10",
      borderColor: "border-status-paused/20",
      ref: assistantCardRef,
      onClick: () => setShowAssistants((o) => !o),
      clickable: true,
    },
    {
      label: "Jobs Hoje",
      value: totalJobs,
      icon: Zap,
      color: "text-accent",
      bgColor: "bg-accent/10",
      borderColor: "border-accent/20",
    },
    {
      label: "Executando",
      value: runningRobots,
      icon: Server,
      color: "text-status-running",
      bgColor: "bg-status-running/10",
      borderColor: "border-status-running/20",
    },
    {
      label: "Com Erro Hoje",
      value: faultedJobs,
      icon: XCircle,
      color: "text-status-error",
      bgColor: "bg-status-error/10",
      borderColor: "border-status-error/20",
    },
  ];

  const assistantsPanel = showAssistants && createPortal(
    <div
      ref={panelRef}
      style={{ position: "fixed", top: panelPos.top, left: panelPos.left }}
      className="z-[9999] w-80 rounded-xl border border-white/10 bg-surface-800 shadow-2xl shadow-black/50 overflow-hidden"
    >
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <span className="text-sm font-semibold text-white">Assistants Conectados</span>
        <button onClick={() => setShowAssistants(false)} className="text-white/20 hover:text-white/50 cursor-pointer">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="divide-y divide-white/[0.03] max-h-64 overflow-y-auto">
        {activeAssistants.length === 0 && (
          <div className="px-4 py-6 text-center text-white/20 text-xs font-mono">
            Nenhum Assistant conectado
          </div>
        )}
        {activeAssistants.map((s) => (
          <div key={s.Id} className="px-4 py-3">
            <div className="flex items-center gap-2 mb-1">
              <Wifi className="w-3.5 h-3.5 text-status-running" />
              <span className="text-xs font-medium text-white/80">
                {s.MachineName || s.HostMachineName || "—"}
              </span>
            </div>
            <div className="flex items-center gap-3 text-[10px] font-mono text-white/30">
              <span>{s.HostMachineName || "—"}</span>
              <span>{s.Platform || "—"}</span>
              {s.Version && <span>v{s.Version.split("-")[0]}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>,
    document.body
  );

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
      {stats.map((stat, i) => {
        const Icon = stat.icon;
        return (
          <motion.div
            key={stat.label}
            ref={stat.ref}
            onClick={stat.onClick}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1, duration: 0.5, ease: "easeOut" }}
            className={`relative overflow-hidden rounded-xl border ${stat.borderColor} ${stat.bgColor} p-3 sm:p-5 ${stat.clickable ? "cursor-pointer hover:border-white/20 transition-all" : ""}`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] sm:text-xs font-medium text-white/40 uppercase tracking-wider mb-1 truncate">
                  {stat.label}
                </p>
                <p className={`font-mono text-2xl sm:text-3xl font-bold ${stat.color}`}>
                  {String(stat.value).padStart(2, "0")}
                </p>
              </div>
              <div
                className={`hidden sm:flex w-12 h-12 rounded-xl ${stat.bgColor} items-center justify-center shrink-0`}
              >
                <Icon className={`w-6 h-6 ${stat.color}`} />
              </div>
            </div>
            <div
              className={`absolute top-0 right-0 w-20 h-20 ${stat.bgColor} rounded-bl-full opacity-50`}
            />
          </motion.div>
        );
      })}
      {assistantsPanel}
    </div>
  );
}
