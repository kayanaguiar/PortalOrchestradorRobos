import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check } from "lucide-react";

export default function CustomSelect({ value, onChange, options = [], placeholder = "Selecionar...", icon: Icon, className = "" }) {
  const [open, setOpen] = useState(false);
  const [positioned, setPositioned] = useState(false);
  const btnRef = useRef(null);
  const popRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const selectedOption = options.find((o) => o.value === value);
  const label = selectedOption?.label || placeholder;

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
      className="z-[9999] max-h-64 rounded-xl border border-white/10 bg-surface-800 shadow-2xl shadow-black/50 overflow-y-auto"
    >
      {options.length === 0 && (
        <div className="px-3 py-4 text-center text-white/20 text-xs font-mono">
          Nenhuma opção disponível
        </div>
      )}
      {options.map((opt) => {
        const isSelected = opt.value === value;
        return (
          <button
            key={opt.value}
            onClick={() => select(opt.value)}
            className={`w-full px-3 py-2.5 flex items-center justify-between text-left hover:bg-white/[0.04] transition-colors cursor-pointer ${
              isSelected ? "bg-accent/10" : ""
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              {opt.icon && <opt.icon className="w-4 h-4 text-white/20 shrink-0" />}
              <div className="min-w-0">
                <span className={`text-xs truncate block ${isSelected ? "text-accent font-medium" : "text-white/60"}`}>
                  {opt.label}
                </span>
                {opt.subtitle && (
                  <span className="text-[10px] text-white/20 font-mono truncate block">{opt.subtitle}</span>
                )}
              </div>
            </div>
            {isSelected && <Check className="w-3.5 h-3.5 text-accent shrink-0" />}
          </button>
        );
      })}
    </div>,
    document.body
  );

  return (
    <div className={className}>
      <button
        ref={btnRef}
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center justify-between gap-2 bg-surface-900/60 border border-white/5 rounded-lg px-3 py-2 text-sm hover:border-white/10 transition-all cursor-pointer ${
          selectedOption ? "text-white/70" : "text-white/30"
        }`}
      >
        <div className="flex items-center gap-2 truncate">
          {Icon && <Icon className="w-4 h-4 text-white/20 shrink-0" />}
          <span className="truncate">{label}</span>
        </div>
        <ChevronDown className={`w-4 h-4 text-white/20 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {popup}
    </div>
  );
}
