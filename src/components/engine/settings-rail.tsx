import { rolesSummary } from "@/generation/catalog";
import type { ModelEntry } from "@/generation/catalog/types";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";

/**
 * The settings rail is generated entirely from the catalogue entry. A new model
 * brings its own controls with no change here.
 */
export function SettingsRail({
  entry,
  settings,
  onChange,
  disabled,
}: {
  entry: ModelEntry;
  settings: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  disabled?: boolean;
}) {
  const fields = Object.entries(entry.settings);
  const caps = (
    <p className="text-xs leading-relaxed text-muted-foreground">
      {entry.label}: {rolesSummary(entry)}
    </p>
  );

  if (fields.length === 0) {
    return (
      <div className="space-y-2">
        {caps}
        <p className="text-xs text-muted-foreground">
          {entry.label} takes no settings — the prompt alone drives it.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {caps}
      {fields.map(([key, field]) => {
        const id = `setting-${key}`;
        const label = key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());

        if (field.type === "enum") {
          const value =
            typeof settings[key] === "string" ? (settings[key] as string) : field.default;
          return (
            <div key={key} className="space-y-2">
              <Label htmlFor={id}>{label}</Label>
              <Select
                value={value}
                disabled={disabled ?? false}
                onValueChange={(next) => onChange(key, next)}
              >
                <SelectTrigger id={id}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {field.values.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        }

        if (field.type === "range") {
          const value =
            typeof settings[key] === "number" ? (settings[key] as number) : field.default;
          return (
            <div key={key} className="space-y-2">
              <div className="flex items-baseline justify-between">
                <Label htmlFor={id}>{label}</Label>
                <span className="text-xs text-muted-foreground">{value}</span>
              </div>
              <Slider
                id={id}
                min={field.min}
                max={field.max}
                step={field.step ?? 1}
                value={[value]}
                disabled={disabled ?? false}
                onValueChange={([next]) => onChange(key, next)}
              />
            </div>
          );
        }

        const value =
          typeof settings[key] === "boolean" ? (settings[key] as boolean) : field.default;
        return (
          <div key={key} className="flex items-center justify-between gap-4">
            <Label htmlFor={id}>{label}</Label>
            <Switch
              id={id}
              checked={value}
              disabled={disabled ?? false}
              onCheckedChange={(next) => onChange(key, next)}
            />
          </div>
        );
      })}
    </div>
  );
}
