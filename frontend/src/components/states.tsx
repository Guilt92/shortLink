import type { ComponentType, ReactNode } from "react";
import { AlertCircle, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EmptyState({ icon: Icon = Inbox, title, description, action }: { icon?: ComponentType<{ className?: string }>; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
      <div className="flex size-10 items-center justify-center rounded-full bg-muted"><Icon className="size-5 text-muted-foreground" /></div>
      <h3 className="font-semibold">{title}</h3>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
      <div className="flex size-10 items-center justify-center rounded-full bg-destructive/10"><AlertCircle className="size-5 text-destructive" /></div>
      <h3 className="font-semibold">Something went wrong</h3>
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      {onRetry && <Button variant="outline" size="sm" onClick={onRetry}>Try again</Button>}
    </div>
  );
}
