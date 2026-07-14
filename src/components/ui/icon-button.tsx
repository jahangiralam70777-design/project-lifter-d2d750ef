import * as React from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * IconButton — icon-only button with TypeScript-enforced accessible name.
 *
 * Either `aria-label` (preferred) or `aria-labelledby` is required at the
 * type level so an icon-only button cannot ship without an accessible name.
 * Defaults to the 44px-tap-target icon size and adds a visible focus ring.
 */
type AccessibleName =
  | { "aria-label": string; "aria-labelledby"?: string }
  | { "aria-label"?: string; "aria-labelledby": string };

export type IconButtonProps = Omit<ButtonProps, "size" | "aria-label" | "aria-labelledby"> & {
  size?: "default" | "sm";
} & AccessibleName;

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton({ className, size = "default", variant = "ghost", ...props }, ref) {
    return (
      <Button
        ref={ref}
        variant={variant}
        size={size === "sm" ? "icon-sm" : "icon"}
        className={cn(
          "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-ring",
          className,
        )}
        {...props}
      />
    );
  },
);
