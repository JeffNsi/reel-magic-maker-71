import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  platformKeyStatus,
  removePlatformKey,
  savePlatformKey,
} from "@/lib/generation-key.functions";

/**
 * The key lamp: whether the creator's own platform key is held, and whether a
 * run is in flight. The key value itself never reaches the browser.
 */
export function KeyLamp({
  busy,
  open,
  onOpenChange,
}: {
  busy: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const status = useServerFn(platformKeyStatus);
  const save = useServerFn(savePlatformKey);
  const remove = useServerFn(removePlatformKey);
  const queryClient = useQueryClient();
  const [value, setValue] = useState("");

  const held = useQuery({ queryKey: ["platform-key"], queryFn: () => status() });

  const saving = useMutation({
    mutationFn: (api_key: string) => save({ data: { api_key } }),
    onSuccess: async () => {
      setValue("");
      onOpenChange(false);
      toast.success("Key saved for this browser.");
      await queryClient.invalidateQueries({ queryKey: ["platform-key"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removing = useMutation({
    mutationFn: () => remove({}),
    onSuccess: async () => {
      toast.success("Key removed.");
      await queryClient.invalidateQueries({ queryKey: ["platform-key"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const hasKey = held.data?.held ?? false;
  const lamp = busy ? "bg-primary animate-pulse" : hasKey ? "bg-emerald-400" : "bg-muted-foreground";

  return (
    <>
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        className="group flex items-center gap-2 rounded-full border border-border/70 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]"
      >
        <span className={`h-2 w-2 rounded-full ${lamp}`} aria-hidden />
        <span>
          {busy ? "Run in flight" : hasKey ? "Key held" : held.isLoading ? "Checking…" : "No key"}
        </span>
      </button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl italic">Your platform key</DialogTitle>
            <DialogDescription>
              The full model catalogue runs on your own generation account. The key is stored in a
              secure cookie for 30 days — never in this browser's storage and never in our database.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Input
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="id:secret"
              autoComplete="off"
              spellCheck={false}
              aria-label="Platform API key"
            />
            <p className="text-xs text-muted-foreground">
              The key has two parts joined by a colon.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              disabled={!hasKey || removing.isPending}
              onClick={() => removing.mutate()}
            >
              {removing.isPending ? "Removing…" : "Remove key"}
            </Button>
            <Button
              type="button"
              disabled={!value.trim() || saving.isPending}
              onClick={() => saving.mutate(value.trim())}
            >
              {saving.isPending ? "Saving…" : "Save key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
