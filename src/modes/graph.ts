import { validateSpec, type DiagramSpec } from "../renderDiagram";
import type { ModeProducer } from "./index";

function round2(v: number) {
  return Math.round(v * 100) / 100;
}

// Cohen–Sutherland line clipping against a rectangle
function clipSegmentToRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  xmin: number,
  ymin: number,
  xmax: number,
  ymax: number
): [number, number, number, number] | null {
  const INSIDE = 0;
  const LEFT = 1;
  const RIGHT = 2;
  const BOTTOM = 4;
  const TOP = 8;

  const outCode = (x: number, y: number) => {
    let c = INSIDE;
    if (x < xmin) c |= LEFT;
    else if (x > xmax) c |= RIGHT;
    if (y < ymin) c |= TOP;       // SVG y grows downward
    else if (y > ymax) c |= BOTTOM;
    return c;
  };

  let code1 = outCode(x1, y1);
  let code2 = outCode(x2, y2);

  while (true) {
    if (!(code1 | code2)) return [x1, y1, x2, y2]; // both inside
    if (code1 & code2) return null; // both share an outside region

    const codeOut = code1 ? code1 : code2;
    let x = 0, y = 0;

    if (codeOut & TOP) {
      y = ymin;
      x = x1 + ((x2 - x1) * (y - y1)) / (y2 - y1);
    } else if (codeOut & BOTTOM) {
      y = ymax;
      x = x1 + ((x2 - x1) * (y - y1)) / (y2 - y1);
    } else if (codeOut & RIGHT) {
      x = xmax;
      y = y1 + ((y2 - y1) * (x - x1)) / (x2 - x1);
    } else if (codeOut & LEFT) {
      x = xmin;
      y = y1 + ((y2 - y1) * (x - x1)) / (x2 - x1);
    }

    if (codeOut === code1) {
      x1 = x; y1 = y;
      code1 = outCode(x1, y1);
    } else {
      x2 = x; y2 = y;
      code2 = outCode(x2, y2);
    }
  }
}

function makeGraphDiagram(description: string, W: number, H: number): DiagramSpec {
  const w = Math.max(300, Math.min(4000, Math.round(W)));
  const h = Math.max(260, Math.min(4000, Math.round(H)));

  const margin = Math.round(Math.min(w, h) * 0.10);
  const plotX0 = margin;
  const plotY0 = margin;
  const plotX1 = w - margin;
  const plotY1 = h - margin;

  // ---- parse range: "from -10 to 10" ----
  let xmin = -10, xmax = 10, ymin = -10, ymax = 10;
  {
    const m = description.match(/from\s+(-?\d+(\.\d+)?)\s+to\s+(-?\d+(\.\d+)?)/i);
    if (m) {
      const a = Number(m[1]);
      const b = Number(m[3]);
      if (Number.isFinite(a) && Number.isFinite(b) && a !== b) {
        xmin = Math.min(a, b);
        xmax = Math.max(a, b);
        ymin = xmin;
        ymax = xmax;
      }
    }
  }

  const xToPx = (x: number) => plotX0 + ((x - xmin) / (xmax - xmin)) * (plotX1 - plotX0);
  const yToPx = (y: number) => plotY1 - ((y - ymin) / (ymax - ymin)) * (plotY1 - plotY0);

  // ---- parse linear: y = ax + b ----
  let hasLine = false;
  let a = 1;
  let b = 0;
  {
    const s = description.replace(/\s+/g, "");
    const m = s.match(/y=([+-]?\d*\.?\d*)\*?x([+-]\d+(\.\d+)?)?/i);
    if (m) {
      const rawA = m[1];
      const rawB = m[2];

      if (rawA === "" || rawA === "+") a = 1;
      else if (rawA === "-") a = -1;
      else a = Number(rawA);

      b = rawB ? Number(rawB) : 0;

      if (Number.isFinite(a) && Number.isFinite(b)) hasLine = true;
    }
  }

  const segments: NonNullable<DiagramSpec["segments"]> = [];
  const labels: NonNullable<DiagramSpec["labels"]> = [];
  const points: NonNullable<DiagramSpec["points"]> = [];

  // ---- plot border ----
  segments.push({ a: [plotX0, plotY0], b: [plotX1, plotY0], stroke: "#cfcfcf", strokeWidth: 2 });
  segments.push({ a: [plotX1, plotY0], b: [plotX1, plotY1], stroke: "#cfcfcf", strokeWidth: 2 });
  segments.push({ a: [plotX1, plotY1], b: [plotX0, plotY1], stroke: "#cfcfcf", strokeWidth: 2 });
  segments.push({ a: [plotX0, plotY1], b: [plotX0, plotY0], stroke: "#cfcfcf", strokeWidth: 2 });

  // ---- grid (clipped by construction: we only draw inside plot rect) ----
  const gridStroke = "#ededed";
  const gridSW = 1;
  const step = 1;

  for (let x = Math.ceil(xmin); x <= Math.floor(xmax); x += step) {
    const px = xToPx(x);
    segments.push({ a: [px, plotY0], b: [px, plotY1], stroke: gridStroke, strokeWidth: gridSW });
  }
  for (let y = Math.ceil(ymin); y <= Math.floor(ymax); y += step) {
    const py = yToPx(y);
    segments.push({ a: [plotX0, py], b: [plotX1, py], stroke: gridStroke, strokeWidth: gridSW });
  }

  // ---- axes ----
  const axisStroke = "#111111";
  const axisSW = 2;

  if (xmin <= 0 && xmax >= 0) {
    const px = xToPx(0);
    segments.push({ a: [px, plotY0], b: [px, plotY1], stroke: axisStroke, strokeWidth: axisSW });
  }
  if (ymin <= 0 && ymax >= 0) {
    const py = yToPx(0);
    segments.push({ a: [plotX0, py], b: [plotX1, py], stroke: axisStroke, strokeWidth: axisSW });
  }

  // ---- ticks labels (small + outside plot a bit) ----
  const labelEvery = Math.max(1, Math.round((xmax - xmin) / 10));
  const xAxisY = ymin <= 0 && ymax >= 0 ? yToPx(0) : plotY1;
  const yAxisX = xmin <= 0 && xmax >= 0 ? xToPx(0) : plotX0;

  for (let x = Math.ceil(xmin); x <= Math.floor(xmax); x += labelEvery) {
    labels.push({ text: String(x), x: xToPx(x), y: xAxisY + 18, fontSize: 12, color: "#111", bold: false });
  }
  for (let y = Math.ceil(ymin); y <= Math.floor(ymax); y += labelEvery) {
    labels.push({ text: String(y), x: yAxisX - 20, y: yToPx(y), fontSize: 12, color: "#111", bold: false });
  }

  // ---- plot line: sample + CLIP each segment to plot rect ----
  if (hasLine) {
    const lineStroke = "#111111";
    const lineSW = 3;

    const samples = Math.max(80, Math.round(w / 8));
    let prev: [number, number] | null = null;

    for (let i = 0; i <= samples; i++) {
      const x = xmin + (i / samples) * (xmax - xmin);
      const y = a * x + b;

      const px = xToPx(x);
      const py = yToPx(y);

      const cur: [number, number] = [px, py];
      if (prev) {
        const clipped = clipSegmentToRect(
          prev[0], prev[1], cur[0], cur[1],
          plotX0, plotY0, plotX1, plotY1
        );
        if (clipped) {
          segments.push({
            a: [clipped[0], clipped[1]],
            b: [clipped[2], clipped[3]],
            stroke: lineStroke,
            strokeWidth: lineSW,
          });
        }
      }
      prev = cur;
    }

    // equation label (small, top-right inside plot)
    const eq = `y = ${a}x${b === 0 ? "" : b > 0 ? ` + ${b}` : ` - ${Math.abs(b)}`}`;
    labels.push({ text: eq, x: plotX1 - 40, y: plotY0 + 18, fontSize: 13, color: "#111", bold: true });

    // intercept markers (kept if inside)
    if (xmin <= 0 && xmax >= 0 && b >= ymin && b <= ymax) {
      points.push({ at: [xToPx(0), yToPx(b)], r: 5, fill: "#111111", stroke: "none", strokeWidth: 1 });
      labels.push({ text: `(0, ${round2(b)})`, x: xToPx(0) + 55, y: yToPx(b) - 12, fontSize: 12, color: "#111", bold: true });
    }

    if (a !== 0) {
      const xInt = -b / a;
      if (Number.isFinite(xInt) && xInt >= xmin && xInt <= xmax && ymin <= 0 && ymax >= 0) {
        points.push({ at: [xToPx(xInt), yToPx(0)], r: 5, fill: "#111111", stroke: "none", strokeWidth: 1 });
        labels.push({ text: `(${round2(xInt)}, 0)`, x: xToPx(xInt) + 55, y: yToPx(0) - 12, fontSize: 12, color: "#111", bold: true });
      }
    }
  } else {
    // We still “use” the description without drawing it on canvas:
    // (This keeps TS happy and helps UX via an unobtrusive hint.)
    labels.push({
      text: "Tip: Try: Plot y = 2x + 1 (and optionally: from -10 to 10)",
      x: w / 2,
      y: 18,
      fontSize: 12,
      color: "#111",
      bold: false,
    });
  }

  return validateSpec({
    canvas: { width: w, height: h, bg: "#ffffff" },
    defaults: {
      stroke: "#000000",
      strokeWidth: 3,
      fill: "none",
      fontFamily: "Arial, system-ui, sans-serif",
      fontSize: 18,
      labelColor: "#111",
    },
    segments,
    labels,
    points,
  });
}

export const graphProducer: ModeProducer = {
  mode: "graph",
  label: "Graph (Cartesian Plane)",
  placeholder:
    "Example: Create a coordinate plane from -10 to 10. Plot y = 2x + 1. Mark intercepts and label them.",
  example:
    "Create a coordinate plane from -10 to 10 on both axes. Plot y = 2x + 1. Mark intercepts and label them.",
  async produce({ description, canvasWidth, canvasHeight }) {
    return makeGraphDiagram(description, canvasWidth, canvasHeight);
  },
};
