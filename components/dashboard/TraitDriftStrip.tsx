import { Card } from "@/components/ui/card";

const TRAITS = [
  { name: "warmth", value: 60, color: "bg-amber" },
  { name: "curiosity", value: 50, color: "bg-blue" },
  { name: "directness", value: 55, color: "bg-steel" },
  { name: "playfulness", value: 50, color: "bg-gold" },
  { name: "discipline", value: 50, color: "bg-bone-dim" },
  { name: "patience", value: 60, color: "bg-moss" },
];

export function TraitDriftStrip() {
  return (
    // 3-up below `sm`, matching components/dashboard/live/LiveTraitDriftStrip
    // .tsx: six trait names at a sixth of a phone's width wrap to three lines
    // each and the strip stops reading as a strip.
    <Card className="grid grid-cols-3 gap-4 p-4 sm:grid-cols-6">
      {TRAITS.map((t) => (
        <div key={t.name} className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase text-bone-subtle">{t.name}</span>
          <span className="text-lg text-bone">{t.value}</span>
          <div className="h-1 rounded-full bg-border">
            <div className={`h-full rounded-full ${t.color}`} style={{ width: `${t.value}%` }} />
          </div>
        </div>
      ))}
    </Card>
  );
}
