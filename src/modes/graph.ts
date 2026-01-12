import { validateSpec, type DiagramSpec } from "../renderDiagram";
import type { ModeProducer } from "./index";

function round2(v: number) {
  return Math.round(v * 100) / 100;
}

/**
 * Graph mode MVP:
 * - Parses "from A to B" as x/y range (symmetric on both axes)
 * - Parses linear "y = ax + b"
 * - Draws grid, axes, and the line
 * - Uses description for a header label (fixes TS unused warning and helps UX)
 */
function makeGraphDiagram(description: string, W: number, H: number): DiagramSpec {
  const w = Math.max(200, Math.min(4000, Math.round(W)));
  const h = Math.max(200, Math.min(4000, Math.round(H)));
  const margin = Math.round(Math.min(w, h) * 0.10);

  // --- defaults: range ---
  let xmin = -10,
    xmax = 10,
    ymin = -10,
    ymax = 10;

  // Parse: "from -10 to 10"
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

  const xToPx = (x: number) => margin + ((x - xmin) / (xmax - xmin)) * (w - 2 * margin);
  const yToPx = (y: number) => h - margin - ((y - ymin) / (ymax - ymin)) * (h - 2 * margin);

  // --- parse linear: y = ax + b ---
  let hasLine = false;
  let a = 1;
  let b = 0;

  {
    // Remove whitespace for easier matching
    const s = description.replace(/\s+/g, "");

    // Match: y=2x+1, y=-x-3, y=3x, y=x+4
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

  // --- Use description (fixes "unused" warning AND helps user) ---
  const header = description.trim()
    ? description.trim().slice(0, 80) + (description.trim().length > 80 ? "…" : "")
    : "Graph mode";

  labels.push({
    text: header,
    x: w / 2,
    y: 18,
    bold: true,
    fontSize: 13,
    color: "#111",
  });

  // --- grid ---
  const gridStroke = "#e3e3e3";
  const gridSW = 1;
  const step = 1;

  for (let x = Math.ceil(xmin); x <= Math.floor(xmax); x += step) {
    const px = xToPx(x);
    segments.push({ a: [px, yToPx(ymin)], b: [px, yToPx(ymax)], stroke: gridStroke, strokeWidth: gridSW });
  }

  for (let y = Math.ceil(ymin); y <= Math.floor(ymax); y += step) {
    const py = yToPx(y);
    segments.push({ a: [xToPx(xmin), py], b: [xToPx(xmax), py], stroke: gridStroke, strokeWidth: gridSW });
  }

  // --- axes ---
  const axisStroke = "#000000";
  const axisSW = 2;

  if (xmin <= 0 && xmax >= 0) {
    const px = xToPx(0);
    segments.push({ a: [px, yToPx(ymin)], b: [px, yToPx(ymax)], stroke: axisStroke, strokeWidth: axisSW });
  }
  if (ymin <= 0 && ymax >= 0) {
    const py = yToPx(0);
    segments.push({ a: [xToPx(xmin), py], b: [xToPx(xmax), py], stroke: axisStroke, strokeWidth: axisSW });
  }

  // --- tick labels (keep it light) ---
  const labelEvery = Math.max(1, Math.round((xmax - xmin) / 10)); // ~10 labels max

  const xAxisY = ymin <= 0 && ymax >= 0 ? yToPx(0) : yToPx(ymin);
  const yAxisX = xmin <= 0 && xmax >= 0 ? xToPx(0) : xToPx(xmin);

  for (let x = Math.ceil(xmin); x <= Math.floor(xmax); x += labelEvery) {
    labels.push({ text: String(x), x: xToPx(x), y: xAxisY + 18, fontSize: 12, color: "#111", bold: false });
  }
  for (let y = Math.ceil(ymin); y <= Math.floor(ymax); y += labelEvery) {
    labels.push({ text: String(y), x: yAxisX - 20, y: yToPx(y), fontSize: 12, color: "#111", bold: false });
  }

  // --- plot the line (sample it) ---
  if (hasLine) {
    const lineStroke = "#000000";
    const lineSW = 3;

    const samples = Math.max(60, Math.round(w / 10));
    let prev: [number, number] | null = null;

    for (let i = 0; i <= samples; i++) {
      const x = xmin + (i / samples) * (xmax - xmin);
      const y = a * x + b;

      const px = xToPx(x);
      const py = yToPx(y);

      const cur: [number, number] = [px, py];
      if (prev) segments.push({ a: prev, b: cur, stroke: lineStroke, strokeWidth: lineSW });
      prev = cur;
    }

    // label equation
    const eq = `y = ${a}x${b === 0 ? "" : b > 0 ? ` + ${b}` : ` - ${Math.abs(b)}`}`;
    labels.push({ text: eq, x: w - margin, y: 40, fontSize: 13, color: "#111", bold: true });

    // intercepts
    // y-intercept (0, b)
    if (xmin <= 0 && xmax >= 0 && b >= ymin && b <= ymax) {
      points.push({ at: [xToPx(0), yToPx(b)], r: 5, fill: "#000000", stroke: "none", strokeWidth: 1 });
      labels.push({ text: `(0, ${round2(b)})`, x: xToPx(0) + 55, y: yToPx(b) - 12, fontSize: 12, color: "#111", bold: true });
    }

    // x-intercept (-b/a, 0)
    if (a !== 0) {
      const xInt = -b / a;
      if (Number.isFinite(xInt) && xInt >= xmin && xInt <= xmax && ymin <= 0 && ymax >= 0) {
        points.push({ at: [xToPx(xInt), yToPx(0)], r: 5, fill: "#000000", stroke: "none", strokeWidth: 1 });
        labels.push({ text: `(${round2(xInt)}, 0)`, x: xToPx(xInt) + 55, y: yToPx(0) - 12, fontSize: 12, color: "#111", bold: true });
      }
    }
  } else {
    // If no equation detected, give a gentle hint (still uses local mode)
    labels.push({
      text: "Tip: Try 'Plot y = 2x + 1' or include 'from -10 to 10'.",
      x: w / 2,
      y: 42,
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
