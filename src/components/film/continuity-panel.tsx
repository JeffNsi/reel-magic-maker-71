import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ShieldCheck } from "lucide-react";

import {
  getContinuityReport,
  type ContinuityFinding,
  type ContinuityReportView,
} from "@/lib/continuity.functions";

/**
 * CONTINUITY PANEL — advisory only.
 *
 * Shows what the deterministic continuity engine found, and what the render
 * gate *would* block. Nothing here stops a render and no credits are involved.
 * Owner-only: this panel lives on the session-scoped film page and is never
 * rendered on the public share route.
 */

const SEVERITY_ORDER = ["critical", "high", "medium", "low", "info"] as const;

const SEVERITY_LABEL: Record<string, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  info: "Info",
};

function severityClass(severity: string) {
  if (severity === "critical" || severity === "high") return "text-primary";
  if (severity === "medium") return "text-amber-400";
  return "text-muted-foreground";
}

function gateLabel(scene: ContinuityReportView["scenes"][number]) {
  if (!scene.allowed) return { text: "Would block", tone: "text-primary" };
  if (scene.warning_count > 0) return { text: "Warnings", tone: "text-amber-400" };
  return { text: "Clear", tone: "text-emerald-400" };
}

export function ContinuityPanel({ filmId, sessionId }: { filmId: string; sessionId: string }) {
  const fetchReport = useServerFn(getContinuityReport);

  const query = useQuery({
    queryKey: ["continuity", filmId, sessionId],
    enabled: !!sessionId,
    retry: false,
    queryFn: () => fetchReport({ data: { film_id: filmId, session_id: sessionId } }),
  });

  const report = query.data;

  const summary = report
    ? SEVERITY_ORDER.filter((severity) => report.counts[severity] > 0)
        .map((severity) => `${report.counts[severity]} ${SEVERITY_LABEL[severity]?.toLowerCase()}`)
        .join(" · ")
    : "";

  const grouped = SEVERITY_ORDER.map((severity) => ({
    severity,
    items: (report?.findings ?? []).filter((finding) => finding.severity === severity),
  })).filter((group) => group.items.length > 0);

  return (
    <section className="mt-8 rounded-2xl border border-border/70 bg-card p-5">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
        <ShieldCheck className="h-4 w-4 text-primary" />
        Continuity
      </p>

      {query.isLoading && (
        <p className="mt-2 text-sm text-muted-foreground">Checking this film for continuity…</p>
      )}

      {query.isError && (
        <p className="mt-2 text-sm text-muted-foreground">
          The continuity check could not run just now. Nothing about your film changed.
        </p>
      )}

      {report && (
        <>
          <p className="mt-2 text-sm leading-relaxed text-foreground">
            {report.findings.length ? summary : "No continuity issues found."}
          </p>

          {grouped.length > 0 && (
            <ul className="mt-4 space-y-3">
              {grouped.map((group) =>
                group.items.map((finding, index) => (
                  <FindingRow key={`${finding.rule_id}-${index}`} finding={finding} />
                )),
              )}
            </ul>
          )}

          {report.scenes.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {report.scenes.map((scene) => {
                const label = gateLabel(scene);
                return (
                  <span
                    key={scene.scene_id}
                    className="rounded-full border border-border/60 bg-background/60 px-3 py-1 text-xs text-muted-foreground"
                  >
                    Scene {String(scene.scene_number).padStart(2, "0")}{" "}
                    <span className={label.tone}>{label.text}</span>
                  </span>
                );
              })}
            </div>
          )}

          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            This check is advisory. Nothing is blocked, and no credits are used to run it.
          </p>
        </>
      )}
    </section>
  );
}

function FindingRow({ finding }: { finding: ContinuityFinding }) {
  return (
    <li className="rounded-xl border border-border/60 bg-background/60 p-3">
      <p className="flex flex-wrap items-center gap-x-2 text-sm text-foreground">
        <span className={`text-xs font-semibold uppercase ${severityClass(finding.severity)}`}>
          {SEVERITY_LABEL[finding.severity]}
        </span>
        {finding.title}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{finding.message}</p>
      {finding.scene_numbers.length > 0 && (
        <p className="mt-1 text-xs text-muted-foreground">
          Scene{finding.scene_numbers.length > 1 ? "s" : ""}{" "}
          {finding.scene_numbers.map((n) => String(n).padStart(2, "0")).join(", ")}
        </p>
      )}
      {finding.suggested_actions.length > 0 && (
        <ul className="mt-2 space-y-1">
          {finding.suggested_actions.map((action) => (
            <li key={action} className="text-xs leading-relaxed text-muted-foreground">
              — {action}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
