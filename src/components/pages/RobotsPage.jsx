import { useState } from "react";
import {
  Monitor,
  Clock,
  TrendingUp,
  Zap,
  Play,
  Pause,
  Square,
  RotateCcw,
  ChevronLeft,
  Server,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

const statusConfig = {
  running: {
    label: "Executando",
    color: "text-status-running",
    bg: "bg-status-running",
    dotClass: "pulse-running",
  },
  paused: {
    label: "Pausado",
    color: "text-status-paused",
    bg: "bg-status-paused",
    dotClass: "",
  },
  stopped: {
    label: "Parado",
    color: "text-status-stopped",
    bg: "bg-status-stopped",
    dotClass: "",
  },
  error: {
    label: "Erro",
    color: "text-status-error",
    bg: "bg-status-error",
    dotClass: "pulse-running",
  },
};

const levelColors = {
  Info: "text-accent/60",
  Warn: "text-status-paused",
  Error: "text-status-error",
};

const levelBg = {
  Info: "bg-white/5",
  Warn: "bg-status-paused/15",
  Error: "bg-status-error/15",
};

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDate(ts) {
  return new Date(ts).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function RobotsPage({ robots, logHistory, onAction }) {
  const [selectedRobotId, setSelectedRobotId] = useState(null);

  const selectedRobot = robots.find((r) => r.id === selectedRobotId);
  const logs = selectedRobotId ? (logHistory[selectedRobotId] || []) : [];

  if (selectedRobot) {
    const config = statusConfig[selectedRobot.status];
    return (
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3 }}
      >
        {/* Back button */}
        <button
          onClick={() => setSelectedRobotId(null)}
          className="flex items-center gap-2 text-sm text-white/40 hover:text-white/70 transition-colors mb-6 cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
          Voltar para lista
        </button>

        {/* Robot detail header */}
        <div className="rounded-xl border border-white/5 bg-surface-800/60 p-6 mb-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-2.5 h-2.5 rounded-full ${config.bg} ${config.dotClass}`} />
                <span className={`font-mono text-xs uppercase tracking-widest ${config.color}`}>
                  {config.label}
                </span>
              </div>
              <h2 className="text-2xl font-bold text-white">{selectedRobot.name}</h2>
              <p className="text-white/30 text-sm mt-1 font-mono">{selectedRobot.orchestrator}</p>
            </div>
            <div className="flex gap-2">
              {selectedRobot.status === "running" && (
                <>
                  <ActionBtn icon={Pause} label="Pausar" variant="warning" onClick={() => onAction(selectedRobot.id, "pause")} />
                  <ActionBtn icon={Square} label="Parar" variant="danger" onClick={() => onAction(selectedRobot.id, "stop")} />
                </>
              )}
              {selectedRobot.status === "paused" && (
                <>
                  <ActionBtn icon={Play} label="Retomar" variant="success" onClick={() => onAction(selectedRobot.id, "resume")} />
                  <ActionBtn icon={Square} label="Parar" variant="danger" onClick={() => onAction(selectedRobot.id, "stop")} />
                </>
              )}
              {selectedRobot.status === "stopped" && (
                <ActionBtn icon={Play} label="Iniciar" variant="success" onClick={() => onAction(selectedRobot.id, "start")} />
              )}
              {selectedRobot.status === "error" && (
                <>
                  <ActionBtn icon={RotateCcw} label="Reiniciar" variant="accent" onClick={() => onAction(selectedRobot.id, "restart")} />
                  <ActionBtn icon={Square} label="Parar" variant="danger" onClick={() => onAction(selectedRobot.id, "stop")} />
                </>
              )}
            </div>
          </div>

          {/* Info grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <InfoCard icon={Monitor} label="Máquina" value={selectedRobot.machine} />
            <InfoCard icon={Clock} label="Runtime" value={selectedRobot.runtime} />
            <InfoCard icon={Zap} label="Execuções Hoje" value={selectedRobot.executionsToday} />
            <InfoCard icon={TrendingUp} label="Taxa de Sucesso" value={`${selectedRobot.successRate}%`} />
          </div>
        </div>

        {/* Last log */}
        {selectedRobot.lastLog && (
          <div className="rounded-xl border border-white/5 bg-surface-800/60 p-5 mb-6">
            <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">Último Log</h3>
            <div className="flex items-center gap-3">
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${levelBg[selectedRobot.lastLog.Level]} ${levelColors[selectedRobot.lastLog.Level]}`}>
                {selectedRobot.lastLog.Level.toUpperCase()}
              </span>
              <span className="font-mono text-sm text-white/70">{selectedRobot.lastLog.Message}</span>
              <span className="font-mono text-xs text-white/20 ml-auto">{formatTime(selectedRobot.lastLog.Timestamp)}</span>
            </div>
          </div>
        )}

        {/* Log history */}
        <div className="rounded-xl border border-white/5 bg-surface-800/60 overflow-hidden">
          <div className="px-5 py-4 border-b border-white/5">
            <h3 className="text-sm font-semibold text-white">Histórico de Logs</h3>
            <p className="text-[11px] text-white/30 mt-0.5 font-mono">/odata/RobotLogs?$filter=ProcessName eq '{selectedRobot.name}'</p>
          </div>
          <div className="divide-y divide-white/[0.03]">
            {logs.map((log, i) => (
              <motion.div
                key={log.Id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.04 }}
                className="px-5 py-3 flex items-center gap-4 hover:bg-white/[0.02] transition-colors"
              >
                <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded shrink-0 ${levelBg[log.Level]} ${levelColors[log.Level]}`}>
                  {log.Level.toUpperCase()}
                </span>
                <span className="font-mono text-xs text-white/60 flex-1 truncate">{log.Message}</span>
                <span className="font-mono text-[11px] text-white/20 shrink-0">
                  {formatDate(log.Timestamp)} {formatTime(log.Timestamp)}
                </span>
              </motion.div>
            ))}
            {logs.length === 0 && (
              <div className="px-5 py-8 text-center text-white/20 text-sm">
                Nenhum log disponível
              </div>
            )}
          </div>
        </div>
      </motion.div>
    );
  }

  // List view
  return (
    <div>
      <div className="rounded-xl border border-white/5 bg-surface-800/60 overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5">
          <h2 className="text-sm font-semibold text-white">Todos os Robôs</h2>
          <p className="text-[11px] text-white/30 mt-0.5 font-mono">
            {robots.length} ROBÔS CADASTRADOS — CLIQUE PARA VER DETALHES
          </p>
        </div>
        <div className="divide-y divide-white/[0.03]">
          {robots.map((robot, i) => {
            const config = statusConfig[robot.status];
            return (
              <motion.div
                key={robot.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.06 }}
                onClick={() => setSelectedRobotId(robot.id)}
                className="px-5 py-4 flex items-center gap-5 hover:bg-white/[0.03] transition-colors cursor-pointer"
              >
                {/* Status dot */}
                <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${config.bg} ${config.dotClass}`} />

                {/* Name & orchestrator */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">{robot.name}</span>
                    <span className={`text-[10px] font-mono uppercase tracking-wider ${config.color}`}>
                      {config.label}
                    </span>
                  </div>
                  <p className="text-xs text-white/25 font-mono mt-0.5">{robot.orchestrator}</p>
                </div>

                {/* Last log */}
                <div className="hidden md:block flex-1 min-w-0">
                  <p className="font-mono text-xs text-white/40 truncate">
                    {robot.lastLog?.Message ?? "—"}
                  </p>
                </div>

                {/* Machine */}
                <div className="hidden lg:flex items-center gap-1.5 text-white/20">
                  <Server className="w-3 h-3" />
                  <span className="font-mono text-xs">{robot.machine}</span>
                </div>

                {/* Metrics */}
                <div className="hidden xl:flex items-center gap-4 text-white/30 font-mono text-xs">
                  <span>{robot.executionsToday} exec</span>
                  <span>{robot.successRate}%</span>
                </div>

                {/* Runtime */}
                <span className="font-mono text-xs text-white/20">{robot.runtime}</span>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function InfoCard({ icon: Icon, label, value }) {
  return (
    <div className="p-3 rounded-lg bg-surface-900/60 border border-white/5">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3.5 h-3.5 text-white/20" />
        <span className="text-[10px] text-white/30 uppercase tracking-wider">{label}</span>
      </div>
      <p className="font-mono text-sm text-white/80">{value}</p>
    </div>
  );
}

const variantStyles = {
  success: "border-status-running/30 text-status-running hover:bg-status-running/10",
  warning: "border-status-paused/30 text-status-paused hover:bg-status-paused/10",
  danger: "border-status-error/30 text-status-error hover:bg-status-error/10",
  accent: "border-accent/30 text-accent hover:bg-accent/10",
};

function ActionBtn({ icon: Icon, label, onClick, variant }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-2 rounded-lg border text-xs font-medium transition-all duration-200 cursor-pointer ${variantStyles[variant]}`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}
