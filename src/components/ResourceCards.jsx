import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { Layers, Database, KeyRound, ChevronRight, Loader2 } from "lucide-react";

// Cards de resumo de Filas / Buckets / Assets no Dashboard.
// Tudo vem do mesmo summary polado no App (um fetch só) — sem buscar por conta própria.
export default function ResourceCards({ queueTotals, queuesLoading }) {
  const navigate = useNavigate();

  const cards = [
    {
      title: "Filas",
      icon: Layers,
      to: "/queues",
      main: queueTotals.queues,
      loading: queuesLoading && !queueTotals.queues,
      subStats: [
        { label: "Aguardando", value: queueTotals.new, color: "text-accent" },
        { label: "Sucesso hoje", value: queueTotals.successfulToday, color: "text-status-running" },
        { label: "Falhas hoje", value: queueTotals.failedToday, color: queueTotals.failedToday > 0 ? "text-status-error" : "text-white/40" },
      ],
    },
    { title: "Buckets", icon: Database, to: "/buckets", main: queueTotals.buckets, loading: queuesLoading && !queueTotals.buckets, subline: "Storage de arquivos" },
    { title: "Assets", icon: KeyRound, to: "/assets", main: queueTotals.assets, loading: queuesLoading && !queueTotals.assets, subline: "Variáveis e credenciais" },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {cards.map((c, i) => {
        const Icon = c.icon;
        return (
          <motion.button
            key={c.title}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            onClick={() => navigate(c.to)}
            className="group text-left rounded-xl border border-white/5 bg-surface-800/60 p-4 hover:border-white/10 hover:bg-surface-800 transition-all cursor-pointer"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Icon className="w-4 h-4 text-accent/60" />
                <span className="text-sm font-semibold text-white/80">{c.title}</span>
              </div>
              <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-white/50 transition-colors" />
            </div>

            <div className="flex items-baseline gap-2 h-9">
              {c.loading ? (
                <Loader2 className="w-5 h-5 animate-spin text-white/20" />
              ) : (
                <span className="font-mono text-3xl font-bold text-white">{c.main ?? "—"}</span>
              )}
            </div>

            {/* Linha de baixo — mesma altura em todos os cards pra alinhar */}
            <div className="mt-2 min-h-[1.25rem] flex items-center gap-3 flex-wrap">
              {c.subStats ? (
                c.subStats.map((s) => (
                  <span key={s.label} className={`text-[11px] font-mono ${s.color}`}>
                    {s.label}: <span className="font-bold">{s.value}</span>
                  </span>
                ))
              ) : (
                <span className="text-[11px] font-mono text-white/30">{c.subline}</span>
              )}
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}
