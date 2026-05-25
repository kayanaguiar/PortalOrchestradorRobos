import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import RobotCard from "./RobotCard";

export default function SortableRobotCard({ robot, batchMode, selected, ...props }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: robot.processKey, disabled: batchMode });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : "auto",
  };

  return (
    <div ref={setNodeRef} style={style} className={`relative group/sortable ${batchMode && selected ? "ring-2 ring-accent rounded-xl" : ""}`}>
      {!batchMode && (
        <div
          {...attributes}
          {...listeners}
          className="absolute top-3 right-3 z-10 p-1 rounded-md bg-surface-800/80 border border-white/5 opacity-0 group-hover/sortable:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
          onClick={(e) => e.stopPropagation()}
          title="Arrastar para reordenar"
        >
          <GripVertical className="w-3.5 h-3.5 text-white/30" />
        </div>
      )}
      {batchMode && (
        <div className="absolute top-3 left-3 z-10">
          <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
            selected
              ? "bg-accent border-accent"
              : "border-white/20 bg-surface-800/80"
          }`}>
            {selected && (
              <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M2 6l3 3 5-5" />
              </svg>
            )}
          </div>
        </div>
      )}
      <RobotCard robot={robot} {...props} />
    </div>
  );
}
