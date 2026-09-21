import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { MediaItem, MediaRole } from "@/generation/catalog/types";
import {
  createUploadUrl,
  listLibrary,
  signUploadedAsset,
  type LibraryItem,
} from "@/lib/generation-run.functions";
import { supabase } from "@/integrations/supabase/client";

const ROLE_KIND: Record<MediaRole, MediaItem["kind"]> = {
  start: "image",
  end: "image",
  reference: "image",
  video: "video",
  audio: "audio",
};

const ACCEPT: Record<MediaItem["kind"], string> = {
  image: "image/*",
  video: "video/*",
  audio: "audio/*",
};

/**
 * One library, two tabs: the creator's own uploads, and stills or clips from any
 * finished run. Both are filtered to the kind the role actually accepts.
 */
export function AssetPicker({
  role,
  open,
  onOpenChange,
  onPick,
}: {
  role: MediaRole;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (item: MediaItem) => void;
}) {
  const kind = ROLE_KIND[role];
  const library = useServerFn(listLibrary);
  const createUrl = useServerFn(createUploadUrl);
  const signAsset = useServerFn(signUploadedAsset);
  const fileInput = useRef<HTMLInputElement>(null);

  const items = useQuery({
    queryKey: ["generation-library"],
    queryFn: () => library({}),
    enabled: open,
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const prepared = await createUrl({ data: { filename: file.name, kind } });
      const { error } = await supabase.storage
        .from("generation-uploads")
        .uploadToSignedUrl(prepared.path, prepared.token, file);
      if (error) throw new Error(error.message);
      return signAsset({ data: { path: prepared.path, kind } });
    },
    onSuccess: async (asset) => {
      onPick({ url: asset.url, kind });
      onOpenChange(false);
      await items.refetch();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const uploads = (items.data?.uploads ?? []).filter((item) => item.kind === kind);
  const results = (items.data?.results ?? []).filter((item) => item.kind === kind);

  function grid(list: LibraryItem[], empty: string) {
    if (items.isLoading) {
      return (
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((n) => (
            <div key={n} className="aspect-square animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      );
    }
    if (list.length === 0) {
      return (
        <div className="rounded-lg border border-dashed border-border/70 p-6 text-center">
          <p className="text-sm text-muted-foreground">{empty}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            disabled={upload.isPending}
            onClick={() => fileInput.current?.click()}
          >
            {upload.isPending ? "Uploading…" : `Upload ${kind}`}
          </Button>
        </div>
      );
    }
    return (
      <div className="grid grid-cols-3 gap-2">
        {list.map((item) => (
          <button
            key={item.url}
            type="button"
            onClick={() => {
              onPick({ url: item.url, kind });
              onOpenChange(false);
            }}
            className="group overflow-hidden rounded-md border border-border/70 transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]"
          >
            <div className="aspect-square bg-black">
              {kind === "image" ? (
                <img src={item.url} alt={item.label} className="h-full w-full object-cover" />
              ) : kind === "video" ? (
                <video src={item.url} muted className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  audio
                </div>
              )}
            </div>
            <p className="truncate px-1 py-1 text-[10px] text-muted-foreground">{item.label}</p>
          </button>
        ))}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl italic">Pick a {kind}</DialogTitle>
          <DialogDescription>
            The {role} slot takes {kind} files. Your own uploads and results from finished runs live
            in the same library.
          </DialogDescription>
        </DialogHeader>

        <input
          ref={fileInput}
          type="file"
          accept={ACCEPT[kind]}
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) upload.mutate(file);
          }}
        />

        <Tabs defaultValue="uploads">
          <TabsList className="w-full">
            <TabsTrigger value="uploads" className="flex-1">
              Your uploads
            </TabsTrigger>
            <TabsTrigger value="results" className="flex-1">
              From runs
            </TabsTrigger>
          </TabsList>
          <TabsContent value="uploads" className="mt-4">
            {grid(uploads, `No ${kind} uploads yet — add one to get started.`)}
            {uploads.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3 w-full"
                disabled={upload.isPending}
                onClick={() => fileInput.current?.click()}
              >
                {upload.isPending ? "Uploading…" : `Upload another ${kind}`}
              </Button>
            )}
          </TabsContent>
          <TabsContent value="results" className="mt-4">
            {grid(results, `No finished runs have produced a ${kind} yet.`)}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
