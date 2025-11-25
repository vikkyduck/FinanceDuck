import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Table, LayoutGrid } from "lucide-react";
import { ViewMode } from "@/hooks/useViewMode";

interface ViewModeToggleProps {
  value: ViewMode;
  onValueChange: (value: ViewMode) => void;
  className?: string;
}

export const ViewModeToggle = ({ value, onValueChange, className }: ViewModeToggleProps) => {
  return (
    <ToggleGroup 
      type="single" 
      value={value} 
      onValueChange={(val) => {
        if (val) onValueChange(val as ViewMode);
      }}
      className={className}
    >
      <ToggleGroupItem value="table" aria-label="Табличный вид">
        <Table className="h-4 w-4" />
      </ToggleGroupItem>
      <ToggleGroupItem value="cards" aria-label="Карточный вид">
        <LayoutGrid className="h-4 w-4" />
      </ToggleGroupItem>
    </ToggleGroup>
  );
};
