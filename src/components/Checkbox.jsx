import { Check, Minus } from "lucide-react";

// Checkbox padrão do projeto (tema escuro + cor de acento).
// Suporta estado "indeterminate" (seleção parcial, ex.: selecionar todos).
// Para de propagar o clique — pode ser usado dentro de linhas clicáveis sem disparar a linha.
export default function Checkbox({
  checked = false,
  indeterminate = false,
  onChange,
  disabled = false,
  className = "",
  title,
}) {
  const active = checked || indeterminate;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked}
      disabled={disabled}
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onChange?.(!checked);
      }}
      className={`w-4 h-4 shrink-0 rounded-[5px] border flex items-center justify-center transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
        active
          ? "bg-accent border-accent text-white"
          : "border-white/20 bg-surface-900/60 hover:border-white/40"
      } ${className}`}
    >
      {indeterminate
        ? <Minus className="w-3 h-3" strokeWidth={3} />
        : checked
          ? <Check className="w-3 h-3" strokeWidth={3} />
          : null}
    </button>
  );
}
