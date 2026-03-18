import {
  Play,
  Pause,
  Square,
  RotateCcw,
  Monitor,
  Clock,
  TrendingUp,
  Zap,
  Loader2,
} from "lucide-react";
import { motion } from "motion/react";

const statusConfig = {
  running: {
    label: "Executando",
    color: "text-status-running",
    bg: "bg-status-running",
    glow: "glow-running",
    dotClass: "pulse-running",
  },
  paused: {
    label: "Pausado",
    color: "text-status-paused",
    bg: "bg-status-paused",
    glow: "",
    dotClass: "",
  },
  stopped: {
    label: "Parado",
    color: "text-status-stopped",
    bg: "bg-status-stopped",
    glow: "",
    dotClass: "",
  },
  error: {
    label: "Erro",
    color: "text-status-error",
    bg: "bg-status-error",
    glow: "glow-error",
    dotClass: "pulse-running",
  },
};

export default function RobotCard({ robot, index, onAction, loading }) {
  const config = statusConfig[robot.status];

  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        delay: index * 0.08,
        duration: 0.5,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
      className={`relative overflow-hidden rounded-xl border border-white/5 bg-surface-800/60 backdrop-blur-sm hover:border-white/10 transition-all duration-300 group ${config.glow}`}
    >
      {/* Status bar top accent */}
      <div className={`h-[2px] ${config.bg}`} />

      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <div
                className={`w-2 h-2 rounded-full ${config.bg} ${config.dotClass}`}
              />
              <span
                className={`font-mono text-[10px] uppercase tracking-widest ${config.color}`}
              >
                {config.label}
              </span>
            </div>
            <h3 className="text-white font-semibold text-base truncate">
              {robot.name}
            </h3>
            <p className="text-white/30 text-xs mt-0.5 font-mono">
              {robot.orchestrator}
            </p>
          </div>
          <div className="font-mono text-[11px] text-white/20 flex items-center gap-1">
            <Monitor className="w-3 h-3" />
            {robot.machine}
          </div>
        </div>

        {/* Last log from UiPath /odata/RobotLogs */}
        <div className="mb-4 p-3 rounded-lg bg-surface-900/60 border border-white/5">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5">
              <p className="text-[10px] uppercase tracking-wider text-white/30">
                Último Log
              </p>
              {robot.lastLog && (
                <span
                  className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                    robot.lastLog.Level === "Error"
                      ? "bg-status-error/15 text-status-error"
                      : robot.lastLog.Level === "Warn"
                        ? "bg-status-paused/15 text-status-paused"
                        : "bg-accent/10 text-accent/60"
                  }`}
                >
                  {robot.lastLog.Level.toUpperCase()}
                </span>
              )}
            </div>
            {robot.lastLog?.Timestamp && (
              <span className="font-mono text-[10px] text-white/20">
                {new Date(robot.lastLog.Timestamp).toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
            )}
          </div>
          <p
            className={`font-mono text-xs ${
              robot.lastLog?.Level === "Error"
                ? "text-status-error"
                : robot.lastLog?.Level === "Warn"
                  ? "text-status-paused"
                  : "text-white/70"
            } truncate`}
          >
            {robot.lastLog?.Message ?? "Sem logs disponíveis"}
          </p>
        </div>

        {/* Metrics row */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div>
            <div className="flex items-center gap-1 mb-0.5">
              <Clock className="w-3 h-3 text-white/20" />
              <span className="text-[10px] text-white/30">Runtime</span>
            </div>
            <p className="font-mono text-xs text-white/70">{robot.runtime}</p>
          </div>
          <div>
            <div className="flex items-center gap-1 mb-0.5">
              <Zap className="w-3 h-3 text-white/20" />
              <span className="text-[10px] text-white/30">Execuções</span>
            </div>
            <p className="font-mono text-xs text-white/70">
              {robot.executionsToday}
            </p>
          </div>
          <div>
            <div className="flex items-center gap-1 mb-0.5">
              <TrendingUp className="w-3 h-3 text-white/20" />
              <span className="text-[10px] text-white/30">Sucesso</span>
            </div>
            <p className="font-mono text-xs text-white/70">
              {robot.successRate}%
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 pt-3 border-t border-white/5">
          {loading && (
            <div className="flex items-center gap-2 text-accent text-xs font-mono">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Executando...
            </div>
          )}
          {!loading && robot.status === "running" && (
            <>
              <ActionButton
                icon={Pause}
                label="Pausar"
                onClick={() => onAction(robot.id, "pause")}
                variant="warning"
              />
              <ActionButton
                icon={Square}
                label="Parar"
                onClick={() => onAction(robot.id, "stop")}
                variant="danger"
              />
            </>
          )}
          {!loading && robot.status === "paused" && (
            <>
              <ActionButton
                icon={Play}
                label="Retomar"
                onClick={() => onAction(robot.id, "resume")}
                variant="success"
              />
              <ActionButton
                icon={Square}
                label="Parar"
                onClick={() => onAction(robot.id, "stop")}
                variant="danger"
              />
            </>
          )}
          {!loading && robot.status === "stopped" && (
            <ActionButton
              icon={Play}
              label="Iniciar"
              onClick={() => onAction(robot.id, "start")}
              variant="success"
            />
          )}
          {!loading && robot.status === "error" && (
            <>
              <ActionButton
                icon={RotateCcw}
                label="Reiniciar"
                onClick={() => onAction(robot.id, "restart")}
                variant="accent"
              />
              <ActionButton
                icon={Square}
                label="Parar"
                onClick={() => onAction(robot.id, "stop")}
                variant="danger"
              />
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}

const variantStyles = {
  success:
    "border-status-running/30 text-status-running hover:bg-status-running/10",
  warning:
    "border-status-paused/30 text-status-paused hover:bg-status-paused/10",
  danger: "border-status-error/30 text-status-error hover:bg-status-error/10",
  accent: "border-accent/30 text-accent hover:bg-accent/10",
};

function ActionButton({ icon: Icon, label, onClick, variant }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all duration-200 cursor-pointer ${variantStyles[variant]}`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}
