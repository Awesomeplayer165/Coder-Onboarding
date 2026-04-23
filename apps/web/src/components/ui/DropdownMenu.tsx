import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import type React from "react";

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

export function DropdownMenuContent({
  children,
  align = "start",
  side = "right",
  sideOffset = 4
}: {
  children: React.ReactNode;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  sideOffset?: number;
}) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content className="dropdown-content" align={align} side={side} sideOffset={sideOffset}>
        {children}
      </DropdownMenuPrimitive.Content>
    </DropdownMenuPrimitive.Portal>
  );
}

export function DropdownMenuLabel({ children }: { children: React.ReactNode }) {
  return <DropdownMenuPrimitive.Label className="dropdown-label">{children}</DropdownMenuPrimitive.Label>;
}

export function DropdownMenuSeparator() {
  return <DropdownMenuPrimitive.Separator className="dropdown-separator" />;
}

export function DropdownMenuItem({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <DropdownMenuPrimitive.Item className="dropdown-item" {...(onClick ? { onSelect: onClick } : {})}>
      {children}
    </DropdownMenuPrimitive.Item>
  );
}

export function DropdownMenuShortcut({ children }: { children: React.ReactNode }) {
  return <span className="dropdown-shortcut">{children}</span>;
}
