import { restoreFocus } from "@/lib/focus";
import * as React from "react";
import * as A from "@radix-ui/react-alert-dialog";
import { cn } from "@/lib/utils";
import { buttonVariants } from "./button";

export const AlertDialog = A.Root;
export const AlertDialogContent = React.forwardRef<React.ElementRef<typeof A.Content>, React.ComponentPropsWithoutRef<typeof A.Content>>(({ className, ...p }, ref) => (
  <A.Portal>
    <A.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
    <A.Content ref={ref} className={cn("fixed left-1/2 top-1/2 z-50 grid w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border bg-background p-6 shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0", className)} {...p} onCloseAutoFocus={(e) => { p.onCloseAutoFocus?.(e); restoreFocus(e); }} />
  </A.Portal>
));
AlertDialogContent.displayName = "AlertDialogContent";
export const AlertDialogTitle = ({ className, ...p }: React.ComponentPropsWithoutRef<typeof A.Title>) => <A.Title className={cn("text-lg font-semibold", className)} {...p} />;
export const AlertDialogDescription = ({ className, ...p }: React.ComponentPropsWithoutRef<typeof A.Description>) => <A.Description className={cn("text-sm text-muted-foreground", className)} {...p} />;
export const AlertDialogFooter = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)} {...p} />;
export const AlertDialogCancel = ({ className, ...p }: React.ComponentPropsWithoutRef<typeof A.Cancel>) => <A.Cancel className={cn(buttonVariants({ variant: "outline" }), className)} {...p} />;
export const AlertDialogAction = ({ className, ...p }: React.ComponentPropsWithoutRef<typeof A.Action>) => <A.Action className={cn(buttonVariants(), className)} {...p} />;
