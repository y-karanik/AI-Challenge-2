import * as React from "react";
import { Minus, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type NumberStepperProps = Omit<
  React.ComponentProps<"input">,
  "type" | "value" | "onChange"
> & {
  value: string | number;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
  step?: number;
};

/**
 * Number input with custom +/- stepper buttons matching the design system.
 * - Hides native browser spin buttons
 * - Allows manual typing; blocks non-numeric and out-of-range values
 * - Supports press-and-hold for continuous increment/decrement
 */
export const NumberStepper = React.forwardRef<HTMLInputElement, NumberStepperProps>(
  ({ className, value, onChange, min = 1, max, step = 1, disabled, ...props }, ref) => {
    const holdTimer = React.useRef<ReturnType<typeof setInterval> | null>(null);
    const holdTimeout = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    const clamp = (n: number) => {
      let v = n;
      if (typeof min === "number") v = Math.max(min, v);
      if (typeof max === "number") v = Math.min(max, v);
      return v;
    };

    const current = () => {
      const n = parseInt(String(value), 10);
      return Number.isFinite(n) ? n : min - step;
    };

    const apply = (delta: number) => {
      const base = current();
      const next = clamp((Number.isFinite(base) ? base : min) + delta);
      onChange(String(next));
    };

    const stopHold = () => {
      if (holdTimer.current) clearInterval(holdTimer.current);
      if (holdTimeout.current) clearTimeout(holdTimeout.current);
      holdTimer.current = null;
      holdTimeout.current = null;
    };

    const startHold = (delta: number) => {
      apply(delta);
      holdTimeout.current = setTimeout(() => {
        holdTimer.current = setInterval(() => apply(delta), 80);
      }, 400);
    };

    React.useEffect(() => () => stopHold(), []);

    const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value.replace(/[^\d]/g, "");
      if (raw === "") return onChange("");
      const n = parseInt(raw, 10);
      if (!Number.isFinite(n)) return;
      onChange(String(clamp(n)));
    };

    const atMin = typeof min === "number" && current() <= min;
    const atMax = typeof max === "number" && current() >= max;

    return (
      <div className="relative w-full">
        <Input
          ref={ref}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={value ?? ""}
          onChange={handleInput}
          disabled={disabled}
          className={cn(
            "pr-20 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
            className,
          )}
          {...props}
        />
        <div className="pointer-events-none absolute inset-y-0 right-1 flex items-center gap-0.5">
          <button
            type="button"
            aria-label="Decrease"
            disabled={disabled || atMin}
            onPointerDown={(e) => {
              e.preventDefault();
              startHold(-step);
            }}
            onPointerUp={stopHold}
            onPointerLeave={stopHold}
            onPointerCancel={stopHold}
            className="pointer-events-auto inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background text-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label="Increase"
            disabled={disabled || atMax}
            onPointerDown={(e) => {
              e.preventDefault();
              startHold(step);
            }}
            onPointerUp={stopHold}
            onPointerLeave={stopHold}
            onPointerCancel={stopHold}
            className="pointer-events-auto inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background text-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  },
);
NumberStepper.displayName = "NumberStepper";
