import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";

const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function formatDisplay(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay();
}

export default function DatePicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const popRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const selected = new Date(value + "T12:00:00");
  const [viewYear, setViewYear] = useState(selected.getFullYear());
  const [viewMonth, setViewMonth] = useState(selected.getMonth());

  const today = new Date();
  const todayDate = todayStr();
  const isToday = value === todayDate;

  // Posiciona o popup abaixo do botão (recalcula em scroll/resize)
  const updatePos = useCallback(() => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      // Alinha pela direita do botão pra não sair da tela
      const left = Math.max(8, rect.right - 288); // 288 = w-72
      setPos({ top: rect.bottom + 8, left });
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePos();
    window.addEventListener("scroll", updatePos, true);
    window.addEventListener("resize", updatePos);
    return () => {
      window.removeEventListener("scroll", updatePos, true);
      window.removeEventListener("resize", updatePos);
    };
  }, [open, updatePos]);

  // Fecha ao clicar fora
  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (
        btnRef.current && !btnRef.current.contains(e.target) &&
        popRef.current && !popRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  };

  const nextMonth = () => {
    const nextM = viewMonth === 11 ? 0 : viewMonth + 1;
    const nextY = viewMonth === 11 ? viewYear + 1 : viewYear;
    if (new Date(nextY, nextM, 1) > today) return;
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  };

  const selectDay = (day) => {
    const m = String(viewMonth + 1).padStart(2, "0");
    const d = String(day).padStart(2, "0");
    onChange(`${viewYear}-${m}-${d}`);
    setOpen(false);
  };

  const isFuture = (day) => new Date(viewYear, viewMonth, day) > today;
  const isSelected = (day) => selected.getFullYear() === viewYear && selected.getMonth() === viewMonth && selected.getDate() === day;
  const isTodayCell = (day) => today.getFullYear() === viewYear && today.getMonth() === viewMonth && today.getDate() === day;

  const canGoNext = (() => {
    const nextM = viewMonth === 11 ? 0 : viewMonth + 1;
    const nextY = viewMonth === 11 ? viewYear + 1 : viewYear;
    return new Date(nextY, nextM, 1) <= today;
  })();

  const popup = open && createPortal(
    <div
      ref={popRef}
      style={{ position: "fixed", top: pos.top, left: pos.left }}
      className="z-[9999] w-72 rounded-xl border border-white/10 bg-surface-800 shadow-2xl shadow-black/50 p-4"
    >
      {/* Month/Year nav */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={prevMonth} className="w-7 h-7 rounded-md hover:bg-white/5 flex items-center justify-center text-white/40 hover:text-white/70 cursor-pointer transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-medium text-white/70">
          {MONTHS[viewMonth]} {viewYear}
        </span>
        <button
          onClick={nextMonth}
          disabled={!canGoNext}
          className="w-7 h-7 rounded-md hover:bg-white/5 flex items-center justify-center text-white/40 hover:text-white/70 cursor-pointer transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {DAYS.map((d) => (
          <div key={d} className="text-center text-[10px] font-mono text-white/25 py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: firstDay }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}

        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const future = isFuture(day);
          const sel = isSelected(day);
          const todayC = isTodayCell(day);

          return (
            <button
              key={day}
              onClick={() => !future && selectDay(day)}
              disabled={future}
              className={`w-full aspect-square rounded-lg text-xs font-mono flex items-center justify-center transition-all cursor-pointer
                ${sel
                  ? "bg-accent text-white font-bold"
                  : todayC
                    ? "bg-accent/15 text-accent border border-accent/30"
                    : future
                      ? "text-white/10 cursor-not-allowed"
                      : "text-white/50 hover:bg-white/5 hover:text-white/80"
                }
              `}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>,
    document.body
  );

  return (
    <div className="flex items-center gap-2">
      <button
        ref={btnRef}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 bg-surface-700/50 border border-white/5 rounded-lg px-3 py-2 text-sm text-white/60 font-mono hover:border-white/10 transition-all cursor-pointer"
      >
        <Calendar className="w-4 h-4 text-white/30" />
        {formatDisplay(value)}
      </button>
      {!isToday && (
        <button
          onClick={() => { onChange(todayDate); setViewYear(today.getFullYear()); setViewMonth(today.getMonth()); }}
          className="px-2 py-1.5 rounded text-[10px] font-mono text-accent border border-accent/30 hover:bg-accent/10 transition-all cursor-pointer"
        >
          HOJE
        </button>
      )}
      {popup}
    </div>
  );
}
