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

export function validateSpec(obj: any): DiagramSpec {
  if (!obj || typeof obj !== "object") throw new Error("JSON must be an object.");
  if (!obj.canvas) throw new Error("Missing canvas.");

  const w = n(obj.canvas.width, NaN);
  const h = n(obj.canvas.height, NaN);

  if (!Number.isFinite(w) || !Number.isFinite(h)) {
    throw new Error("canvas.width and canvas.height must be numbers.");
  }
  if (w < 100 || h < 100) throw new Error("Canvas is too small (min ~100×100).");
  if (w > 4000 || h > 4000) throw new Error("Canvas is too large (max ~4000×4000).");

  return obj as DiagramSpec;
}

export function renderDiagramSVG(spec: DiagramSpec) {
  const W = n(spec.canvas.width, 900);
  const H = n(spec.canvas.height, 450);
  const bg = s(spec.canvas.bg, "#ffffff");

  const defStroke = s(spec.defaults?.stroke, "#000000");
  const defStrokeWidth = n(spec.defaults?.strokeWidth, 3);
  const defFill = s(spec.defaults?.fill, "none");

  const fontFamily = s(spec.defaults?.fontFamily, "Arial, system-ui, sans-serif");
  const baseFontSize = n(spec.defaults?.fontSize, 18);
  const labelColor = s(spec.defaults?.labelColor, "#000000");

  const rects = (spec.rects ?? [])
    .map((r) => {
      const stroke = s(r.stroke, defStroke);
      const sw = n(r.strokeWidth, defStrokeWidth);
      const fill = s(r.fill, defFill);
      const rx = r.rx != null ? ` rx="${n(r.rx, 0)}"` : "";
      const ry = r.ry != null ? ` ry="${n(r.ry, 0)}"` : "";
      return `<rect x="${n(r.x, 0)}" y="${n(r.y, 0)}" width="${n(r.w, 0)}" height="${n(
        r.h,
        0
      )}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${rx}${ry} />`;
    })
    .join("\n");

  const circles = (spec.circles ?? [])
    .map((c) => {
      const stroke = s(c.stroke, defStroke);
      const sw = n(c.strokeWidth, defStrokeWidth);
      const fill = s(c.fill, defFill);
      return `<circle cx="${n(c.cx, 0)}" cy="${n(c.cy, 0)}" r="${n(
        c.r,
        0
      )}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" />`;
    })
    .join("\n");

  const ellipses = (spec.ellipses ?? [])
    .map((e) => {
      const stroke = s(e.stroke, defStroke);
      const sw = n(e.strokeWidth, defStrokeWidth);
      const fill = s(e.fill, defFill);
      return `<ellipse cx="${n(e.cx, 0)}" cy="${n(e.cy, 0)}" rx="${n(
        e.rx,
        0
      )}" ry="${n(e.ry, 0)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" />`;
    })
    .join("\n");

  const polys = (spec.polygons ?? [])
    .map((p) => {
      const pts = p.points.map(([x, y]) => `${n(x, 0)},${n(y, 0)}`).join(" ");
      const stroke = s(p.stroke, defStroke);
      const sw = n(p.strokeWidth, defStrokeWidth);
      const fill = s(p.fill, defFill);
      return `<polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" />`;
    })
    .join("\n");

  const segs = (spec.segments ?? [])
    .map((seg) => {
      const [x1, y1] = seg.a;
      const [x2, y2] = seg.b;
      const stroke = s(seg.stroke, defStroke);
      const sw = n(seg.strokeWidth, defStrokeWidth);
      return `<line x1="${n(x1, 0)}" y1="${n(y1, 0)}" x2="${n(x2, 0)}" y2="${n(
        y2,
        0
      )}" stroke="${stroke}" stroke-width="${sw}" />`;
    })
    .join("\n");

  const pts = (spec.points ?? [])
    .map((p) => {
      const [x, y] = p.at;
      const r = n(p.r, 4);
      const fill = s(p.fill, "#000000");
      const stroke = s(p.stroke, "none");
      const sw = n(p.strokeWidth, 1);
      return `<circle cx="${n(x, 0)}" cy="${n(y, 0)}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" />`;
    })
    .join("\n");

  // IMPORTANT: labels include data-label-index to enable dragging
  const labels = (spec.labels ?? [])
    .map((l, i) => {
      const weight = l.bold ? 700 : 400;
      const fs = n(l.fontSize, baseFontSize);
      const color = s(l.color, labelColor);
      return `<text
        data-label-index="${i}"
        x="${n(l.x, 0)}"
        y="${n(l.y, 0)}"
        fill="${color}"
        font-size="${fs}"
        font-family="${esc(fontFamily)}"
        font-weight="${weight}"
        dominant-baseline="middle"
        text-anchor="middle"
        style="cursor: move;"
      >${esc(l.text)}</text>`;
    })
    .join("\n");

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
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
