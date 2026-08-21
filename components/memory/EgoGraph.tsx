"use client";

import type { Entity } from "@/types/memory";
import type { NeighborLink } from "@/store/memory-store";

/**
 * Degree is not bounded by anything in the data -- a hub entity easily has 50
 * neighbours. Drawing a fixed maximum and deferring the rest to the relations
 * list is what keeps this a static SVG instead of a layout engine.
 */
export const EGO_GRAPH_MAX_NODES = 12;

const SIZE = 220;
const CENTER = SIZE / 2;
const RADIUS = 78;

export function EgoGraph({ center, links }: { center: Entity; links: NeighborLink[] }) {
  if (links.length === 0) {
    return (
      <p className="py-6 text-center text-xs text-bone-ghost">
        Nothing connected to this one yet.
      </p>
    );
  }

  const drawn = links.slice(0, EGO_GRAPH_MAX_NODES);
  const hidden = links.length - drawn.length;

  const placed = drawn.map((link, i) => {
    // Start at 12 o'clock so the first neighbour lands somewhere predictable.
    const angle = (i / drawn.length) * Math.PI * 2 - Math.PI / 2;
    return {
      link,
      x: CENTER + Math.cos(angle) * RADIUS,
      y: CENTER + Math.sin(angle) * RADIUS,
    };
  });

  return (
    <div className="flex flex-col items-center gap-1">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="h-auto w-full max-w-[220px]"
        role="group"
        aria-label={`Connections for ${center.displayName}`}
      >
        {placed.map(({ link, x, y }) => (
          <line
            key={`edge-${link.relationship.id}`}
            x1={CENTER}
            y1={CENTER}
            x2={x}
            y2={y}
            stroke="currentColor"
            strokeWidth={1}
            className="text-border-strong"
          />
        ))}

        {placed.map(({ link, x, y }) => (
          <g key={`node-${link.relationship.id}`} role="img" aria-label={`neighbour ${link.entity.displayName}`}>
            <circle cx={x} cy={y} r={5} className="fill-steel" />
            <text
              x={x}
              y={y - 9}
              textAnchor="middle"
              className="fill-bone-dim font-mono text-[7px]"
            >
              {link.entity.displayName}
            </text>
          </g>
        ))}

        <circle cx={CENTER} cy={CENTER} r={8} className="fill-amber" />
        <text
          x={CENTER}
          y={CENTER + 20}
          textAnchor="middle"
          className="fill-bone font-mono text-[8px]"
        >
          {center.displayName}
        </text>
      </svg>

      {hidden > 0 && (
        <span className="font-mono text-[10px] text-bone-ghost">
          +{hidden} more — see relations below
        </span>
      )}
    </div>
  );
}
