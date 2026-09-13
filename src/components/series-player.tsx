import { useEffect, useRef, useState } from "react";
import { Download, Loader2, Pause, Play, SkipForward } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MUSIC_BEDS } from "@/lib/story.functions";
import { startScore } from "@/components/film-player";

export type SeriesScene = {
  id: string;
  scene_number: number;
  title: string;
  video_url: string;
  voice_url: string | null;
};

function safeName(text: string, fallback: string) {
  const clean = text.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
  return clean || fallback;
}

/**
 * Plays every finished scene back to back — video, voice-over and one music bed
 * across the whole series — and packs the series into a single zip download.
 */
export function SeriesPlayer({ title, scenes }: { title: string; scenes: SeriesScene[] }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const voiceRef = useRef<HTMLAudioElement>(null);
  const scoreRef = useRef<ReturnType<typeof startScore>>(null);

  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [music, setMusic] = useState("wonder");
  const [zipping, setZipping] = useState(false);

  const current = scenes[Math.min(index, scenes.length - 1)];

  // Stop the generated score when the series stops or the component unmounts.
  useEffect(() => {
    if (!playing) {
      scoreRef.current?.stop();
      scoreRef.current = null;
      return;
    }
    if (!scoreRef.current && music !== "none") {
      scoreRef.current = startScore(music, 0.3);
    }
    return () => {
      scoreRef.current?.stop();
      scoreRef.current = null;
    };
  }, [playing, music]);

  // Start the newly loaded scene while the series is running.
  useEffect(() => {
    if (!playing) return;
    const video = videoRef.current;
    const voice = voiceRef.current;
    if (video) {
      video.currentTime = 0;
      void video.play().catch(() => setPlaying(false));
    }
    if (voice) {
      voice.currentTime = 0;
      void voice.play().catch(() => {});
    }
  }, [index, playing]);

  if (!scenes.length || !current) return null;

  const play = () => {
    setPlaying(true);
    void videoRef.current?.play().catch(() => setPlaying(false));
    void voiceRef.current?.play().catch(() => {});
  };

  const pause = () => {
    setPlaying(false);
    videoRef.current?.pause();
    voiceRef.current?.pause();
  };

  const advance = () => {
    if (index + 1 < scenes.length) {
      setIndex(index + 1);
    } else {
      setIndex(0);
      pause();
    }
  };

  const downloadSeries = async () => {
    setZipping(true);
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      for (const scene of scenes) {
        const base = `${String(scene.scene_number).padStart(2, "0")}-${safeName(
          scene.title,
          `scene-${scene.scene_number}`,
        )}`;
        const video = await fetch(scene.video_url);
        if (!video.ok) throw new Error("A scene could not be downloaded.");
        zip.file(`${base}.mp4`, await video.arrayBuffer());
        if (scene.voice_url) {
          const voice = await fetch(scene.voice_url);
          if (voice.ok) zip.file(`${base}-voice.mp3`, await voice.arrayBuffer());
        }
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${safeName(title, "storyreel-series")}.zip`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Series downloaded.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not download the series.");
    } finally {
      setZipping(false);
    }
  };

  return (
    <section className="rounded-3xl border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
            The series
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {scenes.length} finished {scenes.length === 1 ? "scene" : "scenes"} · playing scene{" "}
            {current.scene_number}
          </p>
        </div>
        <Button
          onClick={() => void downloadSeries()}
          disabled={zipping}
          variant="outline"
          className="h-11 rounded-xl px-5 text-xs font-semibold uppercase tracking-[0.2em]"
        >
          {zipping ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" /> Packing
            </>
          ) : (
            <>
              <Download className="mr-2 size-4" /> Download series
            </>
          )}
        </Button>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl bg-black">
        <video
          ref={videoRef}
          key={current.id}
          src={current.video_url}
          playsInline
          onEnded={advance}
          className="aspect-[9/16] w-full"
        />
      </div>
      {current.voice_url && <audio ref={voiceRef} key={`${current.id}-voice`} src={current.voice_url} />}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          onClick={playing ? pause : play}
          className="h-11 flex-1 rounded-xl bg-primary text-xs font-semibold uppercase tracking-[0.2em] text-primary-foreground hover:shadow-[0_0_24px_var(--glow)]"
        >
          {playing ? (
            <>
              <Pause className="mr-2 size-4" /> Pause series
            </>
          ) : (
            <>
              <Play className="mr-2 size-4" /> Play series
            </>
          )}
        </Button>
        <Button
          onClick={advance}
          variant="ghost"
          className="h-11 rounded-xl px-4 text-xs font-semibold uppercase tracking-[0.2em]"
          aria-label="Next scene"
        >
          <SkipForward className="size-4" />
        </Button>
        <Select value={music} onValueChange={setMusic}>
          <SelectTrigger className="h-11 w-full rounded-xl border-border bg-background/50 text-sm sm:w-52">
            <SelectValue placeholder="Music bed" />
          </SelectTrigger>
          <SelectContent>
            {MUSIC_BEDS.map((bed) => (
              <SelectItem key={bed.value} value={bed.value}>
                {bed.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <ol className="mt-4 flex flex-wrap gap-2">
        {scenes.map((scene, i) => (
          <li key={scene.id}>
            <button
              type="button"
              onClick={() => setIndex(i)}
              aria-current={i === index}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                i === index
                  ? "border-primary text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {scene.scene_number}. {scene.title || `Scene ${scene.scene_number}`}
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
