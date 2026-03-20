import { useState, useEffect, useMemo } from "react";
import { Code, MousePointerClick } from "lucide-react";

const WEEKDAYS = [
  { value: "MON", label: "Seg" },
  { value: "TUE", label: "Ter" },
  { value: "WED", label: "Qua" },
  { value: "THU", label: "Qui" },
  { value: "FRI", label: "Sex" },
  { value: "SAT", label: "Sáb" },
  { value: "SUN", label: "Dom" },
];

const FREQUENCY_OPTIONS = [
  { value: "minutes", label: "A cada X minutos" },
  { value: "hourly", label: "A cada hora" },
  { value: "daily", label: "Diariamente" },
  { value: "weekly", label: "Dias específicos" },
];

function parseCron(cron) {
  // Tenta extrair valores de uma expressão cron de 7 campos (UiPath)
  // sec min hour dayOfMonth month dayOfWeek year
  const parts = (cron || "").trim().split(/\s+/);
  if (parts.length < 6) return null;

  const [, min, hour, , , dow] = parts;

  // A cada X minutos: "0 0/15 * ? * * *"
  if (min.startsWith("0/") && hour === "*") {
    return { frequency: "minutes", interval: parseInt(min.split("/")[1]) || 30, hour: 8, hourEnd: 18, days: ["MON", "TUE", "WED", "THU", "FRI"] };
  }

  // A cada X minutos em range de horas: "0 0/30 8-18 ? * MON-FRI *"
  if (min.startsWith("0/") && hour.includes("-")) {
    const [hStart, hEnd] = hour.split("-").map(Number);
    const days = parseDays(dow);
    return { frequency: "minutes", interval: parseInt(min.split("/")[1]) || 30, hour: hStart, hourEnd: hEnd, days };
  }

  // Horário específico
  if (!min.includes("/") && !hour.includes("/")) {
    const h = parseInt(hour) || 0;
    const m = parseInt(min) || 0;
    const days = parseDays(dow);
    if (days.length > 0 && days.length < 7) {
      return { frequency: "weekly", interval: 30, hour: h, minute: m, hourEnd: 18, days };
    }
    return { frequency: "daily", interval: 30, hour: h, minute: m, hourEnd: 18, days: ["MON", "TUE", "WED", "THU", "FRI"] };
  }

  return null;
}

function parseDays(dow) {
  if (!dow || dow === "*" || dow === "?") return ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
  if (dow === "MON-FRI") return ["MON", "TUE", "WED", "THU", "FRI"];
  if (dow === "MON-SAT") return ["MON", "TUE", "WED", "THU", "FRI", "SAT"];
  return dow.split(",").map(d => d.trim()).filter(Boolean);
}

function buildCron({ frequency, interval, hour, minute = 0, hourEnd, days }) {
  const dow = days.length === 7 ? "*" : days.length === 0 ? "MON-FRI" : days.join(",");
  switch (frequency) {
    case "minutes":
      return `0 0/${interval} ${hour}-${hourEnd} ? * ${dow} *`;
    case "hourly":
      return `0 0 ${hour}-${hourEnd} ? * ${dow} *`;
    case "daily":
      return `0 ${minute} ${hour} ? * ${dow} *`;
    case "weekly":
      return `0 ${minute} ${hour} ? * ${dow} *`;
    default:
      return `0 0 ${hour} ? * ${dow} *`;
  }
}

function describeCron({ frequency, interval, hour, minute = 0, hourEnd, days }) {
  const dayLabels = days.map(d => WEEKDAYS.find(w => w.value === d)?.label || d).join(", ");
  switch (frequency) {
    case "minutes":
      return `A cada ${interval} min, das ${hour}h às ${hourEnd}h (${dayLabels})`;
    case "hourly":
      return `A cada hora, das ${hour}h às ${hourEnd}h (${dayLabels})`;
    case "daily":
      return `Diariamente às ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} (${dayLabels})`;
    case "weekly":
      return `${dayLabels} às ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    default:
      return "";
  }
}

export default function CronBuilder({ value, onChange }) {
  const [manual, setManual] = useState(false);
  const [manualValue, setManualValue] = useState(value || "");

  const parsed = useMemo(() => parseCron(value), [value]);

  const [frequency, setFrequency] = useState(parsed?.frequency || "minutes");
  const [interval, setInterval_] = useState(parsed?.interval || 30);
  const [hour, setHour] = useState(parsed?.hour ?? 8);
  const [minute, setMinute] = useState(parsed?.minute ?? 0);
  const [hourEnd, setHourEnd] = useState(parsed?.hourEnd || 18);
  const [days, setDays] = useState(parsed?.days || ["MON", "TUE", "WED", "THU", "FRI"]);

  // Sync visual → cron
  useEffect(() => {
    if (manual) return;
    const cron = buildCron({ frequency, interval, hour, minute, hourEnd, days });
    if (cron !== value) onChange(cron);
  }, [frequency, interval, hour, minute, hourEnd, days, manual]);

  const toggleDay = (day) => {
    setDays((prev) => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  };

  const description = describeCron({ frequency, interval, hour, minute, hourEnd, days });

  const inputClass = "bg-surface-900/60 border border-white/5 rounded-lg px-3 py-2 text-sm text-white/70 font-mono focus:outline-none focus:border-accent/30 focus:ring-1 focus:ring-accent/20";

  return (
    <div className="space-y-3">
      {/* Mode toggle */}
      <div className="flex items-center justify-between">
        <label className="text-[10px] uppercase tracking-wider text-white/30">Agendamento</label>
        <button
          type="button"
          onClick={() => {
            setManual(!manual);
            if (!manual) setManualValue(value || "");
          }}
          className="flex items-center gap-1.5 text-[10px] text-accent/60 hover:text-accent cursor-pointer transition-colors"
        >
          {manual ? <><MousePointerClick className="w-3 h-3" /> Modo visual</> : <><Code className="w-3 h-3" /> Modo manual</>}
        </button>
      </div>

      {manual ? (
        /* Manual mode */
        <div>
          <input
            type="text"
            value={manualValue}
            onChange={(e) => { setManualValue(e.target.value); onChange(e.target.value); }}
            placeholder="0 0/30 8-18 ? * MON-FRI *"
            className={`w-full ${inputClass}`}
          />
          <p className="text-[10px] text-white/20 mt-1 font-mono">
            Formato: seg min hora diaMes mes diaSemana ano
          </p>
        </div>
      ) : (
        /* Visual mode */
        <div className="space-y-3 bg-surface-900/40 border border-white/[0.04] rounded-xl p-4">
          {/* Frequency */}
          <div className="flex flex-wrap gap-1.5">
            {FREQUENCY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setFrequency(opt.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                  frequency === opt.value
                    ? "bg-accent/15 border-accent/30 text-accent"
                    : "bg-surface-900/60 border-white/[0.06] text-white/40 hover:border-white/10"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Interval (for minutes) */}
          {frequency === "minutes" && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/40">A cada</span>
              <select value={interval} onChange={(e) => setInterval_(Number(e.target.value))} className={inputClass}>
                {[5, 10, 15, 20, 30, 45, 60].map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
              <span className="text-xs text-white/40">minutos</span>
            </div>
          )}

          {/* Time range (for minutes/hourly) */}
          {(frequency === "minutes" || frequency === "hourly") && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/40">Das</span>
              <select value={hour} onChange={(e) => setHour(Number(e.target.value))} className={inputClass}>
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>{String(i).padStart(2, "0")}:00</option>
                ))}
              </select>
              <span className="text-xs text-white/40">às</span>
              <select value={hourEnd} onChange={(e) => setHourEnd(Number(e.target.value))} className={inputClass}>
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>{String(i).padStart(2, "0")}:00</option>
                ))}
              </select>
            </div>
          )}

          {/* Specific time (for daily/weekly) */}
          {(frequency === "daily" || frequency === "weekly") && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/40">Às</span>
              <select value={hour} onChange={(e) => setHour(Number(e.target.value))} className={inputClass}>
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>{String(i).padStart(2, "0")}</option>
                ))}
              </select>
              <span className="text-xs text-white/40">:</span>
              <select value={minute} onChange={(e) => setMinute(Number(e.target.value))} className={inputClass}>
                {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((v) => (
                  <option key={v} value={v}>{String(v).padStart(2, "0")}</option>
                ))}
              </select>
            </div>
          )}

          {/* Days of week */}
          <div>
            <span className="text-[10px] uppercase tracking-wider text-white/20 block mb-1.5">Dias da semana</span>
            <div className="flex gap-1">
              {WEEKDAYS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => toggleDay(d.value)}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                    days.includes(d.value)
                      ? "bg-accent/15 border-accent/30 text-accent"
                      : "bg-surface-900/60 border-white/[0.06] text-white/30 hover:border-white/10"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div className="pt-1 border-t border-white/[0.04]">
            <p className="text-[11px] text-accent/60 font-mono">{description}</p>
            <p className="text-[10px] text-white/15 font-mono mt-0.5">{value}</p>
          </div>
        </div>
      )}
    </div>
  );
}
