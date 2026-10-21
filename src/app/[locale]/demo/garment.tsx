/**
 * Line drawings of the demo products. Kroj is fictional, so no product photos: simple SVG
 * shapes keep the page light and free of licensed images.
 */

export type GarmentKind =
  "sneaker" | "shirt" | "dress" | "jacket" | "sweater" | "jeans" | "sandal" | "scarf" | "loafer";

const SHAPES: Record<GarmentKind, { fill: string; details?: string }> = {
  sneaker: {
    fill: "M14 80 Q15 62 30 60 L50 56 Q58 48 64 40 L74 44 Q78 58 92 64 L104 70 Q109 80 105 88 H19 Q14 86 14 80 Z",
    details: "M14 88 H106 M56 52 L64 58 M60 47 L68 53 M66 43 L72 49",
  },
  loafer: {
    fill: "M12 82 Q14 68 32 66 L60 62 Q74 56 88 62 Q106 68 108 80 Q108 88 100 88 H20 Q12 88 12 82 Z",
    details: "M12 88 H108 M62 63 Q72 72 86 64",
  },
  shirt: {
    fill: "M40 22 L52 16 Q60 24 68 16 L80 22 L98 38 L88 50 L80 44 V102 H40 V44 L32 50 L22 38 Z",
    details: "M60 24 V102 M64 40 h0.1 M64 56 h0.1 M64 72 h0.1 M64 88 h0.1",
  },
  sweater: {
    fill: "M42 20 Q60 32 78 20 L96 28 L104 84 L92 86 L84 46 V102 H36 V46 L28 86 L16 84 L24 28 Z",
    details: "M36 94 H84 M16 78 L28 80 M92 80 L104 78",
  },
  dress: {
    fill: "M48 14 H52 Q60 24 68 14 H72 L74 40 L66 48 L94 106 H26 L54 48 L46 40 Z",
    details: "M48 46 H72",
  },
  jacket: {
    fill: "M40 18 L52 12 L60 28 L68 12 L80 18 L100 30 L104 92 L90 94 L86 50 V104 H34 V50 L30 94 L16 92 L20 30 Z",
    details: "M60 28 V104 M42 70 H52 M68 70 H78",
  },
  jeans: {
    fill: "M36 14 H84 L90 106 H68 L60 50 L52 106 H30 Z",
    details: "M36 24 H84 M44 24 Q46 36 56 36 M76 24 Q74 36 64 36",
  },
  sandal: {
    fill: "M16 84 Q18 72 38 72 H96 Q106 74 106 82 Q104 92 94 92 H26 Q16 92 16 84 Z",
    details: "M42 72 Q54 48 70 72 M62 72 Q74 56 86 72",
  },
  scarf: {
    fill: "M42 12 H66 V68 L74 104 H56 L52 74 L48 104 H32 L42 68 Z",
    details:
      "M34 108 V114 M40 108 V114 M46 108 V114 M58 108 V114 M64 108 V114 M70 108 V114 M42 40 H66",
  },
};

export function Garment({ kind, className }: { kind: GarmentKind; className?: string }) {
  const shape = SHAPES[kind];
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden="true" focusable="false">
      <path
        d={shape.fill}
        fill="currentColor"
        fillOpacity="0.18"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      {shape.details && (
        <path
          d={shape.details}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}
