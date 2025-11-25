import { Building2, Handshake, UserCircle, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SchemeCardProps {
  value: string;
  selected: boolean;
  onSelect: () => void;
  icon: "building" | "handshake" | "user" | "settings";
  title: string;
  description: string;
  rate?: string;
}

const icons = {
  building: Building2,
  handshake: Handshake,
  user: UserCircle,
  settings: Settings2,
};

export const SchemeCard = ({
  value,
  selected,
  onSelect,
  icon,
  title,
  description,
  rate,
}: SchemeCardProps) => {
  const Icon = icons[icon];

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "relative w-full p-4 rounded-xl border-2 transition-all duration-300 text-left",
        "hover:scale-[1.02] hover:shadow-md",
        selected
          ? "border-primary bg-primary/5 shadow-lg"
          : "border-border hover:border-primary/50 bg-card"
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "p-2 rounded-lg transition-colors duration-300",
            selected ? "bg-primary text-primary-foreground" : "bg-muted"
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <h4 className="font-semibold text-base">{title}</h4>
            {rate && (
              <span
                className={cn(
                  "text-sm font-medium px-2 py-0.5 rounded-full",
                  selected ? "bg-primary/20 text-primary" : "bg-muted"
                )}
              >
                {rate}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {description}
          </p>
        </div>
      </div>
      {selected && (
        <div className="absolute top-2 right-2 h-2 w-2 rounded-full bg-primary animate-pulse" />
      )}
    </button>
  );
};
