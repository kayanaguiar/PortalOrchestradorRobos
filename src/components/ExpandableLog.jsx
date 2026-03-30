import { useState } from "react";

export default function ExpandableLog({ message, className = "" }) {
  const [expanded, setExpanded] = useState(false);

  if (!message) return <span className={className}>—</span>;

  return (
    <span
      onClick={(e) => {
        e.stopPropagation();
        setExpanded((v) => !v);
      }}
      title={expanded ? "Clique para recolher" : "Clique para expandir"}
      className={`${className} cursor-pointer hover:opacity-80 transition-opacity ${expanded ? "whitespace-pre-wrap break-all" : "truncate"}`}
    >
      {message}
    </span>
  );
}
