import * as React from "react";
import * as A from "@radix-ui/react-avatar";
import { cn } from "@/lib/utils";

export function UserAvatar({ name, className }: { name: string; className?: string }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("") || "?";
  return (
    <A.Root className={cn("relative flex size-8 shrink-0 overflow-hidden rounded-full", className)}>
      <A.Fallback className="flex size-full items-center justify-center rounded-full bg-muted text-xs font-medium">{initials}</A.Fallback>
    </A.Root>
  );
}
export type { React };
