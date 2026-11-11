import * as React from "react";
import * as L from "@radix-ui/react-label";
import { cn } from "@/lib/utils";

const Label = React.forwardRef<React.ElementRef<typeof L.Root>, React.ComponentPropsWithoutRef<typeof L.Root>>(({ className, ...props }, ref) => (
  <L.Root ref={ref} className={cn("text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70", className)} {...props} />
));
Label.displayName = "Label";
export { Label };
