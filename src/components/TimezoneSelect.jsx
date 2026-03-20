import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Globe, ChevronDown, Check } from "lucide-react";

const TIMEZONES = [
  {
    group: "Brasil",
    options: [
      { value: "E. South America Standard Time", label: "Brasília", offset: "UTC-3" },
      { value: "SA Western Standard Time", label: "Manaus", offset: "UTC-4" },
      { value: "SA Pacific Standard Time", label: "Acre", offset: "UTC-5" },
      { value: "Mid-Atlantic Standard Time", label: "Fernando de Noronha", offset: "UTC-2" },
    ],
  },
  {
    group: "Américas",
    options: [
      { value: "Eastern Standard Time", label: "Eastern US", offset: "UTC-5" },
      { value: "Central Standard Time", label: "Central US", offset: "UTC-6" },
      { value: "Mountain Standard Time", label: "Mountain US", offset: "UTC-7" },
      { value: "Pacific Standard Time", label: "Pacific US", offset: "UTC-8" },
      { value: "Argentina Standard Time", label: "Argentina", offset: "UTC-3" },
      { value: "Venezuela Standard Time", label: "Venezuela", offset: "UTC-4" },
      { value: "Central Standard Time (Mexico)", label: "México Central", offset: "UTC-6" },
    ],
  },
  {
    group: "Europa",
    options: [
      { value: "GMT Standard Time", label: "Londres", offset: "UTC+0" },
      { value: "W. Europe Standard Time", label: "Europa Ocidental", offset: "UTC+1" },
      { value: "Central Europe Standard Time", label: "Europa Central", offset: "UTC+1" },
      { value: "Romance Standard Time", label: "Paris/Madrid", offset: "UTC+1" },
      { value: "E. Europe Standard Time", label: "Europa Oriental", offset: "UTC+2" },
    ],
  },
  {
    group: "Ásia/Oceania",
    options: [
      { value: "India Standard Time", label: "Índia", offset: "UTC+5:30" },
      { value: "China Standard Time", label: "China", offset: "UTC+8" },
      { value: "Tokyo Standard Time", label: "Japão", offset: "UTC+9" },
      { value: "Korea Standard Time", label: "Coreia", offset: "UTC+9" },
      { value: "AUS Eastern Standard Time", label: "Austrália Eastern", offset: "UTC+10" },
    ],
  },
  {
    group: "Outros",
    options: [
      { value: "UTC", label: "UTC", offset: "UTC" },
    ],
  },
];

function findLabel(value) {
  for (const group of TIMEZONES) {
    for (const opt of group.options) {
      if (opt.value === value) return `${opt.label} (${opt.offset})`;
    }
  }
  return value || "Selecionar...";
}

export default function TimezoneSelect({ value, onChange, className = "" }) {
  const [open, setOpen] = useState(false);
  const [positioned, setPositioned] = useState(false);
  const btnRef = useRef(null);
  const popRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const updatePos = useCallback(() => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left });
      setPositioned(true);
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

  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (
        btnRef.current && !btnRef.current.contains(e.target) &&
        popRef.current && !popRef.current.contains(e.target)
      ) {
        setOpen(false);
        setPositioned(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const select = (val) => {
    onChange(val);
    setOpen(false);
    setPositioned(false);
  };

  const popup = open && positioned && createPortal(
    <div
      ref={popRef}
      style={{ position: "fixed", top: pos.top, left: pos.left, width: btnRef.current?.offsetWidth || 300 }}
      className="z-[9999] max-h-72 rounded-xl border border-white/10 bg-surface-800 shadow-2xl shadow-black/50 overflow-y-auto"
    >
      {TIMEZONES.map((group) => (
        <div key={group.group}>
          <div className="px-3 py-1.5 text-[9px] uppercase tracking-wider text-white/25 font-mono sticky top-0 bg-surface-800 border-b border-white/[0.03]">
            {group.group}
          </div>
          {group.options.map((tz) => {
            const isSelected = tz.value === value;
            return (
              <button
                key={tz.value}
                onClick={() => select(tz.value)}
                className={`w-full px-3 py-2 flex items-center justify-between text-left hover:bg-white/[0.04] transition-colors cursor-pointer ${
                  isSelected ? "bg-accent/10" : ""
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`text-xs ${isSelected ? "text-accent font-medium" : "text-white/60"}`}>
                    {tz.label}
                  </span>
                  <span className="text-[10px] font-mono text-white/20">{tz.offset}</span>
                </div>
                {isSelected && <Check className="w-3.5 h-3.5 text-accent shrink-0" />}
              </button>
            );
          })}
        </div>
      ))}
    </div>,
    document.body
  );

  return (
    <div className={className}>
      <button
        ref={btnRef}
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 bg-surface-900/60 border border-white/5 rounded-lg px-3 py-2 text-sm text-white/60 hover:border-white/10 transition-all cursor-pointer"
      >
        <div className="flex items-center gap-2 truncate">
          <Globe className="w-4 h-4 text-white/20 shrink-0" />
          <span className="truncate">{findLabel(value)}</span>
        </div>
        <ChevronDown className={`w-4 h-4 text-white/20 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {popup}
    </div>
  );
}
