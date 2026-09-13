import { useEffect, useRef, useState } from "react";
import { Download, Loader2, Mic, Pause, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MUSIC_BEDS, VOICES } from "@/lib/story.functions";

/** Chord voicings (Hz) for each mood, played as a slow generated score. */
const BEDS: Record<string, { notes: number[]; cutoff: number; tremolo: number }> = {
  tension: { notes: [98, 146.8, 220, 293.7], cutoff: 700, tremolo: 0.18 },
  wonder: { notes: [130.8, 196, 261.6, 392], cutoff: 1400, tremolo: 0.1 },
  dread: { notes: [65.4, 98, 138.6, 155.6], cutoff: 420, tremolo: 0.25 },
  hope: { notes: [146.8, 220, 293.7, 440], cutoff: 1800, tremolo: 0.08 },
};

type Score = { ctx: AudioContext; master: GainNode; stop: () => void };

export function startScore(bed: string, volume: number): Score | null {
  const spec = BEDS[bed];
  if (!spec) return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;

  const ctx = new Ctor();
  void ctx.resume().catch(() => {});

  const master = ctx.createGain();
  master.gain.value = volume;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = spec.cutoff;
  filter.connect(master);
  master.connect(ctx.destination);

  const nodes: (OscillatorNode | GainNode)[] = [];
  spec.notes.forEach((freq, index) => {
    [0, 1].forEach((detune) => {
      const osc = ctx.createOscillator();
      osc.type = index === 0 ? "triangle" : "sine";
      osc.frequency.value = freq;
      osc.detune.value = detune === 0 ? -6 : 6;

      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.gain.linearRampToValueAtTime(0.16 / (index + 1), ctx.currentTime + 2.5 + index * 0.6);

      const lfo = ctx.createOscillator();
      lfo.frequency.value = spec.tremolo + index * 0.03;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.05;
      lfo.connect(lfoGain).connect(gain.gain);

      osc.connect(gain).connect(filter);
      osc.start();
      lfo.start();
      nodes.push(osc, gain, lfo);
    });
  });

  return {
    ctx,
    master,
    stop: () => {
      master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.6);
      window.setTimeout(() => void ctx.close().catch(() => {}), 800);
      nodes.length = 0;
    },
  };
}

function Fader({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center gap-3 text-xs text-muted-foreground">
      <span className="w-14 shrink-0 uppercase tracking-widest">{label}</span>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(value * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="h-1 w-full cursor-pointer appearance-none rounded-full bg-border accent-primary"
        aria-label={`${label} volume`}
      />
    </label>
  );
}

/**
 * Plays a generated clip together with its voice-over and a generated score,
 * so the short sounds finished — and lets the user record the voice-over.
 */
export function FilmPlayer({
  videoUrl,
  voiceUrl,
  narration,
  generationId,
  onNarrate,
  narrating,
}: {
  videoUrl: string;
  voiceUrl: string | null;
  narration: string;
  generationId: string | null;
  onNarrate?: ((input: { text: string; voice: string; music: string }) => void) | undefined;
  narrating?: boolean | undefined;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const voiceRef = useRef<HTMLAudioElement>(null);
  const scoreRef = useRef<Score | null>(null);

  const [playing, setPlaying] = useState(false);
  const [text, setText] = useState(narration);
  const [voice, setVoice] = useState<string>("alloy");
  const [music, setMusic] = useState<string>("wonder");
  const [filmVol, setFilmVol] = useState(0.6);
  const [voiceVol, setVoiceVol] = useState(1);
  const [musicVol, setMusicVol] = useState(0.35);

  useEffect(() => setText(narration), [narration]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.volume = filmVol;
  }, [filmVol]);

  useEffect(() => {
    if (voiceRef.current) voiceRef.current.volume = voiceVol;
  }, [voiceVol]);

  useEffect(() => {
    if (scoreRef.current) scoreRef.current.master.gain.value = musicVol;
  }, [musicVol]);

  const stopScore = () => {
    scoreRef.current?.stop();
    scoreRef.current = null;
  };

  useEffect(() => stopScore, []);

  const play = () => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = 0;
    void video.play();
    if (voiceRef.current) {
      voiceRef.current.currentTime = 0;
      void voiceRef.current.play().catch(() => {});
    }
    stopScore();
    if (music !== "none") scoreRef.current = startScore(music, musicVol);
    setPlaying(true);
  };

  const pause = () => {
    videoRef.current?.pause();
    voiceRef.current?.pause();
    stopScore();
    setPlaying(false);
  };

  return (
    <div className="space-y-5">
      <div className="surface-cinema mx-auto w-full max-w-sm overflow-hidden rounded-3xl p-2">
        <video
          ref={videoRef}
          src={videoUrl}
          playsInline
          controls
          onEnded={() => {
            stopScore();
            setPlaying(false);
          }}
          className="aspect-[9/16] w-full rounded-2xl bg-black object-cover"
        />
        {voiceUrl && <audio ref={voiceRef} src={voiceUrl} preload="auto" className="hidden" />}
      </div>

      <div className="mx-auto flex w-full max-w-sm flex-col gap-3">
        <div className="flex gap-3">
          <Button
            onClick={playing ? pause : play}
            className="h-12 flex-1 rounded-2xl bg-primary text-xs font-semibold uppercase tracking-[0.2em] text-primary-foreground hover:shadow-[0_0_24px_var(--glow)]"
          >
            {playing ? (
              <>
                <Pause className="mr-2 size-4" /> Pause
              </>
            ) : (
              <>
                <Play className="mr-2 size-4" /> Play film
              </>
            )}
          </Button>
          <Button asChild variant="outline" className="h-12 rounded-2xl px-6">
            <a
              href={videoUrl}
              download={`jejeincvibe-${generationId ?? "short"}.mp4`}
              className="text-xs font-semibold uppercase tracking-[0.2em]"
            >
              <Download className="mr-2 size-4" /> Video
            </a>
          </Button>
        </div>

        <div className="rounded-2xl border border-border bg-card/60 p-4">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Mix
          </p>
          <div className="space-y-3">
            <Fader label="Film" value={filmVol} onChange={setFilmVol} />
            {voiceUrl && <Fader label="Voice" value={voiceVol} onChange={setVoiceVol} />}
            <Fader label="Music" value={musicVol} onChange={setMusicVol} />
          </div>
          <div className="mt-4 flex items-center gap-3">
            <Select
              value={music}
              onValueChange={(v) => {
                setMusic(v);
                if (playing) {
                  stopScore();
                  if (v !== "none") scoreRef.current = startScore(v, musicVol);
                }
              }}
            >
              <SelectTrigger className="h-10 rounded-xl border-border bg-background/60 text-sm">
                <SelectValue placeholder="Score" />
              </SelectTrigger>
              <SelectContent>
                {MUSIC_BEDS.map((bed) => (
                  <SelectItem key={bed.value} value={bed.value}>
                    {bed.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {voiceUrl && (
              <Button asChild variant="ghost" className="h-10 shrink-0 rounded-xl px-4">
                <a href={voiceUrl} download={`jejeincvibe-${generationId ?? "short"}-voice.mp3`}>
                  <Download className="mr-2 size-4" /> Voice
                </a>
              </Button>
            )}
          </div>
        </div>

        {onNarrate && (
          <div className="rounded-2xl border border-border bg-card/60 p-4">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Voice-over
            </p>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 600))}
              rows={3}
              placeholder="One line of narration for this scene..."
              className="resize-none rounded-xl border-border bg-background/50 text-sm"
            />
            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <Select value={voice} onValueChange={setVoice}>
                <SelectTrigger className="h-11 rounded-xl border-border bg-background/60 text-sm">
                  <SelectValue placeholder="Voice" />
                </SelectTrigger>
                <SelectContent>
                  {VOICES.map((v) => (
                    <SelectItem key={v.value} value={v.value}>
                      {v.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={() => onNarrate({ text, voice, music })}
                disabled={narrating || !text.trim()}
                variant="outline"
                className="h-11 shrink-0 rounded-xl px-5 text-xs font-semibold uppercase tracking-[0.2em]"
              >
                {narrating ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" /> Recording
                  </>
                ) : (
                  <>
                    <Mic className="mr-2 size-4" /> {voiceUrl ? "Re-record" : "Add voice-over"}
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
