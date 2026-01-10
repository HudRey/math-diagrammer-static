export type DiagramSpec = {
  canvas: {
    width: number;
    height: number;
    bg: string;
  };

  polygons?: {
    id?: string;
    points: [number, number][];
    stroke?: string;
    strokeWidth?: number;
    fill?: string;
  }[];

  segments?: {
    a: [number, number];
    b: [number, number];
    stroke?: string;
    strokeWidth?: number;
  }[];

  rects?: {
    x: number;
    y: number;
    w: number;
    h: number;
    stroke?: string;
    strokeWidth?: number;
    fill?: string;
    rx?: number;
    ry?: number;
  }[];

  circles?: {
    cx: number;
    cy: number;
    r: number;
    stroke?: string;
    strokeWidth?: number;
    fill?: string;
  }[];

  ellipses?: {
    cx: number;
    cy: number;
    rx: number;
    ry: number;
    stroke?: string;
    strokeWidth?: number;
    fill?: string;
  }[];

  points?: {
    at: [number, number];
    r?: number;
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
  }[];

  labels?: {
    text: string;
    x: number;
    y: number;
    color?: string;
    fontSize?: number;
    bold?: boolean;
  }[];

  defaults?: {
    stroke?: string;
    strokeWidth?: number;
    fill?: string;
    fontFamily?: string;
    fontSize?: number;
    labelColor?: string;
  };
};

function esc(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function n(v: unknown, fallback: number) {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : fallback;
}

function s(v: unknown, fallback: string) {
  return typeof v === "string" && v.trim() ? v : fallback;
}

/**
 * validateSpec()
 * - throws if the spec is invalid
 * - returns a NORMALIZED spec (arrays are always present, defaults filled)
 */
export function validateSpec(obj: any): DiagramSpec {
  if (!obj || typeof obj !== "object") throw new Error("JSON must be an object.");
  if (!obj.canvas) throw new Error("Missing canvas.");

  const w = n(obj.canvas.width, NaN);
  const h = n(obj.canvas.height, NaN);
  const bg = s(obj.canvas.bg, "#ffffff");

  if (!Number.isFinite(w) || !Number.isFinite(h)) {
    throw new Error("canvas.width and canvas.height must be numbers.");
  }
  if (w < 100 || h < 100) throw new Error("Canvas is too small (min ~100×100).");
  if (w > 4000 || h > 4000) throw new Error("Canvas is too large (max ~4000×4000).");

  // Normalize defaults
  const defaults = obj.defaults ?? {};
  const normDefaults: DiagramSpec["defaults"] = {
    stroke: s(defaults.stroke, "#000000"),
    strokeWidth: n(defaults.strokeWidth, 3),
    fill: s(defaults.fill, "none"),
    fontFamily: s(defaults.fontFamily, "Arial, system-ui, sans-serif"),
    fontSize: n(defaults.fontSize, 18),
    labelColor: s(defaults.labelColor, "#000000"),
  };

  // Normalize arrays (always arrays)
  const asArray = <T>(v: any): T[] => (Array.isArray(v) ? v : []);

  const spec: DiagramSpec = {
    canvas: { width: w, height: h, bg },
    defaults: normDefaults,

    rects: asArray(obj.rects),
    circles: asArray(obj.circles),
    ellipses: asArray(obj.ellipses),
    polygons: asArray(obj.polygons),
    segments: asArray(obj.segments),
    points: asArray(obj.points),
    labels: asArray(obj.labels),
  };

  // Optional: light-touch label sanitation (prevents crashes on weird model output)
  spec.labels = spec.labels!.map((l: any) => ({
    text: s(l?.text, ""),
    x: n(l?.x, 0),
    y: n(l?.y, 0),
    color: l?.color,
    fontSize: l?.fontSize,
    bold: !!l?.bold,
  }));

  return spec;
}

export function renderDiagramSVG(spec: DiagramSpec) {
  // spec is assumed to be validated/normalized at the boundary
  const W = n(spec.canvas.width, 900);
  const H = n(spec.canvas.height, 450);
  const bg = s(spec.canvas.bg, "#ffffff");

  const defStroke = s(spec.defaults?.stroke, "#000000");
  const defStrokeWidth = n(spec.defaults?.strokeWidth, 3);
  const defFill = s(spec.defaults?.fill, "none");

  const fontFamily = s(spec.defaults?.fontFamily, "Arial, system-ui, sans-serif");
  const baseFontSize = n(spec.defaults?.fontSize, 18);
  const labelColor = s(spec.defaults?.labelColor, "#000000");

  // Helper: wrap a single shape in a draggable <g>
  const wrap = (entity: string, index: number, inner: string) => {
    return `<g data-entity="${entity}" data-index="${index}" style="cursor: grab; touch-action: none;">${inner}</g>`;
  };

  const rects = (spec.rects ?? [])
    .map((r, i) => {
      const stroke = s(r.stroke, defStroke);
      const sw = n(r.strokeWidth, defStrokeWidth);
      const fill = s(r.fill, defFill);
      const rx = n(r.rx, 0);
      const ry = n(r.ry, 0);

      const inner = `<rect x="${n(r.x, 0)}" y="${n(r.y, 0)}" width="${n(r.w, 0)}" height="${n(
        r.h,
        0
      )}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" rx="${rx}" ry="${ry}" />`;
      return wrap("rect", i, inner);
    })
    .join("\n");

  const circles = (spec.circles ?? [])
    .map((c, i) => {
      const stroke = s(c.stroke, defStroke);
      const sw = n(c.strokeWidth, defStrokeWidth);
      const fill = s(c.fill, defFill);

      const inner = `<circle cx="${n(c.cx, 0)}" cy="${n(c.cy, 0)}" r="${n(
        c.r,
        0
      )}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" />`;
      return wrap("circle", i, inner);
    })
    .join("\n");

  const ellipses = (spec.ellipses ?? [])
    .map((e, i) => {
      const stroke = s(e.stroke, defStroke);
      const sw = n(e.strokeWidth, defStrokeWidth);
      const fill = s(e.fill, defFill);

      const inner = `<ellipse cx="${n(e.cx, 0)}" cy="${n(e.cy, 0)}" rx="${n(
        e.rx,
        0
      )}" ry="${n(e.ry, 0)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" />`;
      return wrap("ellipse", i, inner);
    })
    .join("\n");

  const polys = (spec.polygons ?? [])
    .map((p, i) => {
      const pts = (p.points ?? []).map(([x, y]) => `${n(x, 0)},${n(y, 0)}`).join(" ");
      const stroke = s(p.stroke, defStroke);
      const sw = n(p.strokeWidth, defStrokeWidth);
      const fill = s(p.fill, defFill);

      const inner = `<polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" />`;
      return wrap("polygon", i, inner);
    })
    .join("\n");

  const segs = (spec.segments ?? [])
    .map((seg, i) => {
      const [x1, y1] = seg.a ?? [0, 0];
      const [x2, y2] = seg.b ?? [0, 0];
      const stroke = s(seg.stroke, defStroke);
      const sw = n(seg.strokeWidth, defStrokeWidth);

      const inner = `<line x1="${n(x1, 0)}" y1="${n(y1, 0)}" x2="${n(x2, 0)}" y2="${n(
        y2,
        0
      )}" stroke="${stroke}" stroke-width="${sw}" />`;
      return wrap("segment", i, inner);
    })
    .join("\n");

  const pts = (spec.points ?? [])
    .map((p, i) => {
      const [x, y] = p.at ?? [0, 0];
      const r = n(p.r, 4);
      const fill = s(p.fill, "#000000");
      const stroke = s(p.stroke, "none");
      const sw = n(p.strokeWidth, 1);

      const inner = `<circle cx="${n(x, 0)}" cy="${n(y, 0)}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" />`;
      return wrap("point", i, inner);
    })
    .join("\n");

  // Labels include data-label-index to enable dragging
  const labels = (spec.labels ?? [])
    .map((l, i) => {
      const weight = l.bold ? 700 : 400;
      const fs = n(l.fontSize, baseFontSize);
      const color = s(l.color, labelColor);

      return `<text data-label-index="${i}" x="${n(l.x, 0)}" y="${n(l.y, 0)}" fill="${color}" font-size="${fs}" font-family="${esc(
        fontFamily
      )}" font-weight="${weight}" dominant-baseline="middle" text-anchor="middle" style="cursor: move; touch-action: none;">${esc(
        l.text
      )}</text>`;
    })
    .join("\n");

  return `<svg id="diagramSvg" xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="100%" height="100%" fill="${bg}" />
  ${rects}
  ${circles}
  ${ellipses}
  ${polys}
  ${segs}
  ${pts}
  ${labels}
</svg>`.trim();
}

