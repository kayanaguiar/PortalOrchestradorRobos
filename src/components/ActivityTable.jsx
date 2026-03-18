import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
} from "lucide-react";
import { motion } from "motion/react";

// Mapeia Level do /odata/RobotLogs para ícone e cor
const levelConfig = {
  Info: { icon: CheckCircle2, color: "text-status-running" },
  Error: { icon: XCircle, color: "text-status-error" },
  Warn: { icon: AlertTriangle, color: "text-status-paused" },
  Trace: { icon: CheckCircle2, color: "text-white/30" },
  Fatal: { icon: XCircle, color: "text-status-error" },
};

function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function ActivityTable({ logs }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4, duration: 0.6 }}
      className="rounded-xl border border-white/5 bg-surface-800/60 backdrop-blur-sm overflow-hidden"
    >
      <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-white">
            Robot Logs
          </h2>
          <p className="text-[11px] text-white/30 mt-0.5 font-mono">
            /odata/RobotLogs — ÚLTIMOS {logs.length} REGISTROS
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-white/20">
          <Clock className="w-3.5 h-3.5" />
          <span className="font-mono text-[10px]">LIVE</span>
          <div className="w-1.5 h-1.5 rounded-full bg-status-running pulse-running" />
        </div>
      </div>

      <div className="divide-y divide-white/[0.03]">
        {logs.map((log, i) => {
          const cfg = levelConfig[log.Level] || levelConfig.Info;
          const Icon = cfg.icon;
          return (
            <motion.div
              key={log.Id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 + i * 0.05, duration: 0.3 }}
              className="px-5 py-3 flex items-center gap-4 hover:bg-white/[0.02] transition-colors"
            >
              <Icon className={`w-4 h-4 shrink-0 ${cfg.color}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-white/80">
                    {log.ProcessName}
                  </span>
                  <span
                    className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                      log.Level === "Error"
                        ? "bg-status-error/15 text-status-error"
                        : log.Level === "Warn"
                          ? "bg-status-paused/15 text-status-paused"
                          : "bg-white/5 text-white/30"
                    }`}
                  >
                    {log.Level.toUpperCase()}
                  </span>
                </div>
                <p className="text-[11px] text-white/25 mt-0.5 truncate font-mono">
                  {log.Message}
                </p>
              </div>
              <span className="font-mono text-[11px] text-white/20 shrink-0">
                {formatTime(log.Timestamp)}
              </span>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
