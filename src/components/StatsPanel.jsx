import { Bot, Zap, XCircle, Monitor, Server } from "lucide-react";
import { motion } from "motion/react";

export default function StatsPanel({ robots, jobs, sessions }) {
  const totalJobs = jobs.length;
  const faultedJobs = jobs.filter((j) => j.State === "Faulted").length;
  const runningRobots = robots.filter((r) => r.status === "running").length;
  const assistantSessions = sessions.filter(
    (s) => s.State === "Available" && s.Source === "Assistant"
  ).length;

  const totalRobots = robots.length;

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
      value: assistantSessions,
      icon: Monitor,
      color: "text-status-paused",
      bgColor: "bg-status-paused/10",
      borderColor: "border-status-paused/20",
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

  return (
    <div className="grid grid-cols-5 gap-4">
      {stats.map((stat, i) => {
        const Icon = stat.icon;
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
                  {String(stat.value).padStart(2, "0")}
                </p>
              </div>
              <div
                className={`w-12 h-12 rounded-xl ${stat.bgColor} flex items-center justify-center`}
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
    </div>
  );
}
