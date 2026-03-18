import { Bot, Play, Pause, AlertTriangle } from "lucide-react";
import { motion } from "motion/react";

const stats = [
  {
    label: "Total Robôs",
    icon: Bot,
    color: "text-accent",
    bgColor: "bg-accent/10",
    borderColor: "border-accent/20",
    getValue: (robots) => robots.length,
  },
  {
    label: "Ativos",
    icon: Play,
    color: "text-status-running",
    bgColor: "bg-status-running/10",
    borderColor: "border-status-running/20",
    getValue: (robots) => robots.filter((r) => r.status === "running").length,
  },
  {
    label: "Pausados",
    icon: Pause,
    color: "text-status-paused",
    bgColor: "bg-status-paused/10",
    borderColor: "border-status-paused/20",
    getValue: (robots) => robots.filter((r) => r.status === "paused").length,
  },
  {
    label: "Com Erro",
    icon: AlertTriangle,
    color: "text-status-error",
    bgColor: "bg-status-error/10",
    borderColor: "border-status-error/20",
    getValue: (robots) => robots.filter((r) => r.status === "error").length,
  },
];

export default function StatsPanel({ robots }) {
  return (
    <div className="grid grid-cols-4 gap-4">
      {stats.map((stat, i) => {
        const Icon = stat.icon;
        const value = stat.getValue(robots);
        return (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1, duration: 0.5, ease: "easeOut" }}
            className={`relative overflow-hidden rounded-xl border ${stat.borderColor} ${stat.bgColor} p-5`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-white/40 uppercase tracking-wider mb-1">
                  {stat.label}
                </p>
                <p className={`font-mono text-3xl font-bold ${stat.color}`}>
                  {String(value).padStart(2, "0")}
                </p>
              </div>
              <div
                className={`w-12 h-12 rounded-xl ${stat.bgColor} flex items-center justify-center`}
              >
                <Icon className={`w-6 h-6 ${stat.color}`} />
              </div>
            </div>
            {/* Decorative corner accent */}
            <div
              className={`absolute top-0 right-0 w-20 h-20 ${stat.bgColor} rounded-bl-full opacity-50`}
            />
          </motion.div>
        );
      })}
    </div>
  );
}
