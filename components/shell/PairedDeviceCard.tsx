import { Card } from "@/components/ui/card";

export function PairedDeviceCard() {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-moss" />
        <span className="font-mono text-[11px] uppercase tracking-wide text-bone-subtle">
          demo device
        </span>
      </div>
      <p className="font-mono text-sm text-bone">DEMO-DESKTOP</p>
      <p className="font-mono text-xs text-bone-subtle">tunnel · 47ms</p>
      <p className="font-mono text-xs text-bone-subtle">uptime · 6h 12m</p>
    </Card>
  );
}
