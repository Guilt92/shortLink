import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function CopyButton({ value, label = "Copy", size = "icon" }: { value: string; label?: string; size?: "icon" | "sm" }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setDone(false), 1500);
    } catch {
      toast.error("Could not copy. Copy it manually instead.");
    }
  };
  return (
    <Button type="button" variant="ghost" size={size} className={size === "icon" ? "size-8" : undefined} onClick={copy} aria-label={`${label} ${value}`}>
      {done ? <Check /> : <Copy />}{size === "sm" && (done ? "Copied" : label)}
    </Button>
  );
}
