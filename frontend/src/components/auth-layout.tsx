import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Link2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function AuthLayout({ title, description, children, footer }: { title: string; description: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 px-4 py-10">
      <Link to="/login" className="mb-6 flex items-center gap-2 font-semibold">
        <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground"><Link2 className="size-4" /></span>ShortLink
      </Link>
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-1 p-6 pb-4 text-center">
          <CardTitle as="h1" className="text-xl">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="p-6 pt-0">{children}</CardContent>
      </Card>
      {footer && <p className="mt-4 text-center text-sm text-muted-foreground">{footer}</p>}
    </div>
  );
}
