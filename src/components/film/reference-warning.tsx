import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/hooks/use-locale";

export function ReferenceWarning({ message }: { message: string }) {
  const [dismissed, setDismissed] = useState(false);
  const { t } = useLocale();
  if (dismissed) return null;
  return (
    <div
      role="alert"
      className="mt-3 flex items-start gap-2 rounded-md border border-primary p-3 text-xs"
    >
      <span className="flex-1">{message}</span>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t("Dismiss reference warning", "Stäng referensvarning")}
        onClick={() => setDismissed(true)}
      >
        <X />
      </Button>
    </div>
  );
}
