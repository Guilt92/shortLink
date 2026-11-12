import * as React from "react";
import * as M from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";
import { rememberTrigger } from "@/lib/focus";

export const DropdownMenu = M.Root;
export const DropdownMenuTrigger = React.forwardRef<React.ElementRef<typeof M.Trigger>, React.ComponentPropsWithoutRef<typeof M.Trigger>>(({ onFocus, onPointerDown, ...p }, ref) => (
  <M.Trigger ref={ref} onFocus={(e) => { rememberTrigger(e.currentTarget); onFocus?.(e); }} onPointerDown={(e) => { rememberTrigger(e.currentTarget); onPointerDown?.(e); }} {...p} />
));
DropdownMenuTrigger.displayName = "DropdownMenuTrigger";
export const DropdownMenuContent = React.forwardRef<React.ElementRef<typeof M.Content>, React.ComponentPropsWithoutRef<typeof M.Content>>(({ className, sideOffset = 4, ...p }, ref) => (
  <M.Portal>
    <M.Content ref={ref} sideOffset={sideOffset} className={cn("z-50 min-w-[10rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95", className)} {...p} />
  </M.Portal>
));
DropdownMenuContent.displayName = "DropdownMenuContent";
export const DropdownMenuItem = React.forwardRef<React.ElementRef<typeof M.Item>, React.ComponentPropsWithoutRef<typeof M.Item> & { destructive?: boolean }>(({ className, destructive, ...p }, ref) => (
  <M.Item ref={ref} className={cn("relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0", destructive && "text-destructive focus:text-destructive", className)} {...p} />
));
DropdownMenuItem.displayName = "DropdownMenuItem";
export const DropdownMenuLabel = ({ className, ...p }: React.ComponentPropsWithoutRef<typeof M.Label>) => <M.Label className={cn("px-2 py-1.5 text-xs font-medium text-muted-foreground", className)} {...p} />;
export const DropdownMenuSeparator = ({ className, ...p }: React.ComponentPropsWithoutRef<typeof M.Separator>) => <M.Separator className={cn("-mx-1 my-1 h-px bg-muted", className)} {...p} />;
