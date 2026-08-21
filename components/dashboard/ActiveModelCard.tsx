import { Card } from "@/components/ui/card";

const FALLBACKS = [
  { name: "groq · llama-3.1-8b", tier: "fallback 1" },
  { name: "cerebras · gpt-oss-120b", tier: "fallback 2" },
  { name: "ollama · local", tier: "offline" },
];

export function ActiveModelCard() {
  return (
    <Card className="flex flex-col gap-3 p-4">
      <span className="font-mono text-[11px] uppercase text-bone-subtle">active model</span>
      <p className="font-display text-lg font-bold text-bone">gemini-flash-lite</p>
      <p className="font-mono text-xs text-bone-subtle">primary · free tier</p>
      <ul className="mt-2 flex flex-col gap-1">
        {FALLBACKS.map((f) => (
          <li key={f.name} className="flex justify-between font-mono text-xs text-bone-dim">
            <span>{f.name}</span>
            <span className="text-bone-ghost">{f.tier}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
