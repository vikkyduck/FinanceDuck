import * as React from "react";
import { format, parse, isValid } from "date-fns";
import { ru } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DatePickerProps {
  date?: Date;
  onDateChange: (date: Date | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function DatePicker({
  date,
  onDateChange,
  placeholder = "Выберите дату",
  disabled = false,
  className,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState("");

  // Update input value when date changes
  React.useEffect(() => {
    if (date) {
      setInputValue(format(date, "dd.MM.yyyy"));
    } else {
      setInputValue("");
    }
  }, [date]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);

    // Only try to parse if the input has enough characters for a full date
    if (value.length >= 10) {
      // Try to parse date in format dd.MM.yyyy or dd/MM/yyyy
      // Use a fixed reference date (Jan 1, 2000) to avoid issues with current date
      const referenceDate = new Date(2000, 0, 1);
      const parsedDate = parse(value, "dd.MM.yyyy", referenceDate);
      const parsedDateSlash = parse(value, "dd/MM/yyyy", referenceDate);

      if (isValid(parsedDate)) {
        onDateChange(parsedDate);
      } else if (isValid(parsedDateSlash)) {
        onDateChange(parsedDateSlash);
      }
    }
  };

  const handleInputBlur = () => {
    // Reset input to formatted date if invalid
    if (date) {
      setInputValue(format(date, "dd.MM.yyyy"));
    } else if (inputValue && inputValue.length >= 10) {
      const referenceDate = new Date(2000, 0, 1);
      const parsedDate = parse(inputValue, "dd.MM.yyyy", referenceDate);
      if (!isValid(parsedDate)) {
        setInputValue("");
      }
    } else if (inputValue) {
      setInputValue("");
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="flex gap-2">
        <Input
          value={inputValue}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          placeholder="дд.мм.гггг"
          disabled={disabled}
          className={cn("flex-1", className)}
        />
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            disabled={disabled}
            className={cn(
              "px-3",
              !date && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
      </div>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(newDate) => {
            onDateChange(newDate);
            setOpen(false);
          }}
          autoFocus
          className="pointer-events-auto"
        />
      </PopoverContent>
    </Popover>
  );
}
