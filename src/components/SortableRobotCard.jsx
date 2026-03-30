import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import RobotCard from "./RobotCard";

export default function SortableRobotCard({ robot, ...props }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: robot.processKey });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : "auto",
  };

  return (
    <div ref={setNodeRef} style={style} className="relative group/sortable">
      <div
        {...attributes}
        {...listeners}
        className="absolute top-3 right-3 z-10 p-1 rounded-md bg-surface-800/80 border border-white/5 opacity-0 group-hover/sortable:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
        onClick={(e) => e.stopPropagation()}
        title="Arrastar para reordenar"
      >
        <GripVertical className="w-3.5 h-3.5 text-white/30" />
      </div>
      <RobotCard robot={robot} {...props} />
    </div>
  );
}
