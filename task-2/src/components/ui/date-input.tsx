import * as React from "react";
import { Calendar } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type DateInputProps = Omit<React.ComponentProps<"input">, "type"> & {
  type?: "date" | "datetime-local" | "time" | "month" | "week";
};

/**
 * Native date/datetime input with a high-contrast calendar icon pinned to the right.
 * - Hides the default browser indicator but keeps it click-through over the whole input
 * - Icon meets WCAG AA contrast in both themes (uses foreground token)
 */
export const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>(
  ({ className, type = "date", ...props }, ref) => {
    return (
      <div className="relative w-full">
        <Input
          ref={ref}
          type={type}
          className={cn(
            "pr-10 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0",
            className,
          )}
          {...props}
        />
        <Calendar
          aria-hidden
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground"
        />
      </div>
    );
  },
);
DateInput.displayName = "DateInput";
