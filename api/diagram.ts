import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Structured Outputs strict mode requirement (important):
// If additionalProperties=false at any object level,
// OpenAI requires `required` to list EVERY key in `properties`.
const DIAGRAM_SCHEMA = {
  name: "diagram_spec",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      canvas: {
        type: "object",
        additionalProperties: false,
        properties: {
          width: { type: "integer" },
          height: { type: "integer" },
          bg: { type: "string" },
        },
        required: ["width", "height", "bg"],
      },

      defaults: {
        type: "object",
        additionalProperties: false,
        properties: {
          stroke: { type: "string" },
          strokeWidth: { type: "number" },
          fill: { type: "string" },
          fontFamily: { type: "string" },
          fontSize: { type: "number" },
          labelColor: { type: "string" },
        },
        required: ["stroke", "strokeWidth", "fill", "fontFamily", "fontSize", "labelColor"],
      },

      rects: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            x: { type: "number" },
            y: { type: "number" },
            w: { type: "number" },
            h: { type: "number" },
            stroke: { type: "string" },
            strokeWidth: { type: "number" },
            fill: { type: "string" },
            rx: { type: "number" },
            ry: { type: "number" },
          },
          // NOTE: rx/ry are REQUIRED by schema. Keep them required so the model always outputs them.
          required: ["x", "y", "w", "h", "stroke", "strokeWidth", "fill", "rx", "ry"],
        },
      },

      circles: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            cx: { type: "number" },
            cy: { type: "number" },
            r: { type: "number" },
            stroke: { type: "string" },
            strokeWidth: { type: "number" },
            fill: { type: "string" },
          },
          required: ["cx", "cy", "r", "stroke", "strokeWidth", "fill"],
        },
      },

      ellipses: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            cx: { type: "number" },
            cy: { type: "number" },
            rx: { type: "number" },
            ry: { type: "number" },
            stroke: { type: "string" },
            strokeWidth: { type: "number" },
            fill: { type: "string" },
          },
          required: ["cx", "cy", "rx", "ry", "stroke", "strokeWidth", "fill"],
        },
      },

      polygons: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            points: {
              type: "array",
              items: {
                type: "array",
                minItems: 2,
                maxItems: 2,
                items: { type: "number" },
              },
            },
            stroke: { type: "string" },
            strokeWidth: { type: "number" },
            fill: { type: "string" },
          },
          required: ["points", "stroke", "strokeWidth", "fill"],
        },
      },

      segments: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            a: { type: "array", minItems: 2, maxItems: 2, items: { type: "number" } },
            b: { type: "array", minItems: 2, maxItems: 2, items: { type: "number" } },
            stroke: { type: "string" },
            strokeWidth: { type: "number" },
            dash: { type: "string" },
          },
          required: ["a", "b", "stroke", "strokeWidth", "dash"],
        },
      },

      points: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            at: { type: "array", minItems: 2, maxItems: 2, items: { type: "number" } },
            r: { type: "number" },
            fill: { type: "string" },
            stroke: { type: "string" },
            strokeWidth: { type: "number" },
          },
          required: ["at", "r", "fill", "stroke", "strokeWidth"],
        },
      },

      labels: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            text: { type: "string" },
            x: { type: "number" },
            y: { type: "number" },
            color: { type: "string" },
            fontSize: { type: "number" },
            bold: { type: "boolean" },
          },
          required: ["text", "x", "y", "color", "fontSize", "bold"],
        },
      },
    },

    // REQUIRED must include every top-level key in properties
    required: ["canvas", "defaults", "rects", "circles", "ellipses", "polygons", "segments", "points", "labels"],
  },
};

function systemPrompt() {
  return `
You are a diagram JSON generator. Output MUST match the provided JSON schema EXACTLY.

Non-negotiable rules:
- Output ONLY JSON. No markdown. No commentary.
- Include ALL top-level keys: canvas, defaults, rects, circles, ellipses, polygons, segments, points, labels.
  If unused, set them to empty arrays [].
- canvas MUST be: width=900, height=450, bg="#ffffff".
- defaults MUST be present and readable:
  stroke="#000000", strokeWidth=3, fill="none", fontFamily="Arial, system-ui, sans-serif", fontSize=18, labelColor="#000000".
- Keep ALL geometry and labels at least 40px from the edges (the server will clamp, but try to be correct).
- Use simple, clean diagrams that print well. Avoid clutter.
- You MAY choose reasonable numeric values when the user does not provide any.
  - Prefer clean integers or simple fractions.
  - If the user provides a variable or unknown (e.g., "x", "?"), keep it as text in labels.
  - If no numbers are given, choose sensible sizes and still label vertices/sides clearly.
- Prefer rectangles/segments/labels for Pre-Algebra diagrams unless the user explicitly asks for something else.
- If the user asks to plot points or connect points:
  - You MUST output:
    - points: at least two point markers in "points"
    - segments: at least one connecting segment in "segments"
    - labels: point labels near the markers
  - Do NOT draw axes unless explicitly requested.
  - Place the two points near the center with clear separation (roughly 200-350px apart).
- For triangles or polygons, label vertices with capital letters (A, B, C, ...).
- For rectangles, label sides with measurements (like "7 cm") and place labels near the sides.
- For rects, ALWAYS include rx and ry (use 0 if not rounded).
- Use the defaults for any missing style properties in shapes/labels.
- For segments, ALWAYS include dash:
  - Use dash="" for solid lines.
  - For dashed lines (e.g., altitudes), use dash like "6 6".
- Follow the schema EXACTLY. Do NOT add extra properties.

Few-shot examples (learn the pattern and apply it):

EXAMPLE 1:
User: Draw a rectangle. Label top = 12 cm, left = 7 cm, right = 7 cm, bottom = x cm.
Output:
{"canvas":{"width":900,"height":450,"bg":"#ffffff"},"defaults":{"stroke":"#000000","strokeWidth":3,"fill":"none","fontFamily":"Arial, system-ui, sans-serif","fontSize":18,"labelColor":"#000000"},"rects":[{"x":250,"y":120,"w":400,"h":220,"stroke":"#000000","strokeWidth":3,"fill":"none","rx":0,"ry":0}],"circles":[],"ellipses":[],"polygons":[],"segments":[],"points":[],"labels":[{"text":"12 cm","x":450,"y":95,"color":"#000000","fontSize":22,"bold":false},{"text":"7 cm","x":225,"y":230,"color":"#000000","fontSize":22,"bold":false},{"text":"7 cm","x":675,"y":230,"color":"#000000","fontSize":22,"bold":false},{"text":"x cm","x":450,"y":365,"color":"#000000","fontSize":22,"bold":false}]}

EXAMPLE 2:
User: Plot points A(-2,3) and B(4,-1). Draw segment AB.
Output:
{"canvas":{"width":900,"height":450,"bg":"#ffffff"},"defaults":{"stroke":"#000000","strokeWidth":3,"fill":"none","fontFamily":"Arial, system-ui, sans-serif","fontSize":18,"labelColor":"#000000"},"rects":[],"circles":[],"ellipses":[],"polygons":[],"segments":[{"a":[350,150],"b":[600,300],"stroke":"#000000","strokeWidth":3,"dash":""}],"points":[{"at":[350,150],"r":5,"fill":"#000000","stroke":"none","strokeWidth":1},{"at":[600,300],"r":5,"fill":"#000000","stroke":"none","strokeWidth":1}],"labels":[{"text":"A(-2, 3)","x":320,"y":135,"color":"#000000","fontSize":18,"bold":false},{"text":"B(4, -1)","x":630,"y":315,"color":"#000000","fontSize":18,"bold":false}]}

EXAMPLE 3:
User: Draw a triangle with vertices A, B, and C.
Output:
{"canvas":{"width":900,"height":450,"bg":"#ffffff"},"defaults":{"stroke":"#000000","strokeWidth":3,"fill":"none","fontFamily":"Arial, system-ui, sans-serif","fontSize":18,"labelColor":"#000000"},"rects":[],"circles":[],"ellipses":[],"polygons":[{"points":[[320,320],[600,320],[460,140]],"stroke":"#000000","strokeWidth":3,"fill":"none"}],"segments":[],"points":[{"at":[320,320],"r":5,"fill":"#000000","stroke":"none","strokeWidth":1},{"at":[600,320],"r":5,"fill":"#000000","stroke":"none","strokeWidth":1},{"at":[460,140],"r":5,"fill":"#000000","stroke":"none","strokeWidth":1}],"labels":[{"text":"A","x":300,"y":335,"color":"#000000","fontSize":18,"bold":true},{"text":"B","x":620,"y":335,"color":"#000000","fontSize":18,"bold":true},{"text":"C","x":460,"y":115,"color":"#000000","fontSize":18,"bold":true}]}

EXAMPLE 4:
User: Give me two triangles, rotated in different directions with their vertices labeled.
Output:
{"canvas":{"width":900,"height":450,"bg":"#ffffff"},"defaults":{"stroke":"#000000","strokeWidth":3,"fill":"none","fontFamily":"Arial, system-ui, sans-serif","fontSize":18,"labelColor":"#000000"},"rects":[],"circles":[],"ellipses":[],"polygons":[{"points":[[200,330],[320,140],[400,300]],"stroke":"#000000","strokeWidth":3,"fill":"none"},{"points":[[560,120],[740,220],[600,360]],"stroke":"#000000","strokeWidth":3,"fill":"none"}],"segments":[],"points":[{"at":[200,330],"r":5,"fill":"#000000","stroke":"none","strokeWidth":1},{"at":[320,140],"r":5,"fill":"#000000","stroke":"none","strokeWidth":1},{"at":[400,300],"r":5,"fill":"#000000","stroke":"none","strokeWidth":1},{"at":[560,120],"r":5,"fill":"#000000","stroke":"none","strokeWidth":1},{"at":[740,220],"r":5,"fill":"#000000","stroke":"none","strokeWidth":1},{"at":[600,360],"r":5,"fill":"#000000","stroke":"none","strokeWidth":1}],"labels":[{"text":"A","x":180,"y":345,"color":"#000000","fontSize":18,"bold":true},{"text":"B","x":330,"y":125,"color":"#000000","fontSize":18,"bold":true},{"text":"C","x":410,"y":315,"color":"#000000","fontSize":18,"bold":true},{"text":"D","x":540,"y":105,"color":"#000000","fontSize":18,"bold":true},{"text":"E","x":755,"y":220,"color":"#000000","fontSize":18,"bold":true},{"text":"F","x":610,"y":380,"color":"#000000","fontSize":18,"bold":true}]}

EXAMPLE 5:
User: Two rectangles to find the perimeter of each, know that the sides in the smaller rectangle are x + 4, and 5 and the other is double the first.
Output:
{"canvas":{"width":900,"height":450,"bg":"#ffffff"},"defaults":{"stroke":"#000000","strokeWidth":3,"fill":"none","fontFamily":"Arial, system-ui, sans-serif","fontSize":18,"labelColor":"#000000"},"rects":[{"x":140,"y":150,"w":220,"h":140,"stroke":"#000000","strokeWidth":3,"fill":"none","rx":0,"ry":0},{"x":520,"y":110,"w":440,"h":280,"stroke":"#000000","strokeWidth":3,"fill":"none","rx":0,"ry":0}],"circles":[],"ellipses":[],"polygons":[],"segments":[],"points":[],"labels":[{"text":"x + 4","x":250,"y":135,"color":"#000000","fontSize":18,"bold":true},{"text":"x + 4","x":250,"y":310,"color":"#000000","fontSize":18,"bold":true},{"text":"5","x":125,"y":220,"color":"#000000","fontSize":18,"bold":true},{"text":"5","x":370,"y":220,"color":"#000000","fontSize":18,"bold":true},{"text":"2(x + 4)","x":740,"y":95,"color":"#000000","fontSize":18,"bold":true},{"text":"2(x + 4)","x":740,"y":405,"color":"#000000","fontSize":18,"bold":true},{"text":"10","x":500,"y":250,"color":"#000000","fontSize":18,"bold":true},{"text":"10","x":975,"y":250,"color":"#000000","fontSize":18,"bold":true}]}

EXAMPLE 6:
User: A circle with a sector 1/3 of the circle, with a radius of 4cm.
Output:
{"canvas":{"width":900,"height":450,"bg":"#ffffff"},"defaults":{"stroke":"#000000","strokeWidth":3,"fill":"none","fontFamily":"Arial, system-ui, sans-serif","fontSize":18,"labelColor":"#000000"},"rects":[],"circles":[{"cx":450,"cy":225,"r":150,"stroke":"#000000","strokeWidth":3,"fill":"none"}],"ellipses":[],"polygons":[{"points":[[450,225],[600,225],[375,95]],"stroke":"#000000","strokeWidth":3,"fill":"none"}],"segments":[{"a":[450,225],"b":[600,225],"stroke":"#000000","strokeWidth":3,"dash":""},{"a":[450,225],"b":[375,95],"stroke":"#000000","strokeWidth":3,"dash":""}],"points":[{"at":[450,225],"r":4,"fill":"#000000","stroke":"none","strokeWidth":1}],"labels":[{"text":"r = 4 cm","x":520,"y":205,"color":"#000000","fontSize":18,"bold":true},{"text":"1/3 sector","x":470,"y":120,"color":"#000000","fontSize":18,"bold":false}]}

EXAMPLE 7:
User: A right trapezoid.
Output:
{"canvas":{"width":900,"height":450,"bg":"#ffffff"},"defaults":{"stroke":"#000000","strokeWidth":3,"fill":"none","fontFamily":"Arial, system-ui, sans-serif","fontSize":18,"labelColor":"#000000"},"rects":[],"circles":[],"ellipses":[],"polygons":[{"points":[[260,320],[260,150],[610,150],[720,320]],"stroke":"#000000","strokeWidth":3,"fill":"none"}],"segments":[{"a":[260,300],"b":[280,300],"stroke":"#000000","strokeWidth":3,"dash":""},{"a":[280,300],"b":[280,320],"stroke":"#000000","strokeWidth":3,"dash":""}],"points":[],"labels":[{"text":"A","x":240,"y":335,"color":"#000000","fontSize":18,"bold":true},{"text":"B","x":240,"y":135,"color":"#000000","fontSize":18,"bold":true},{"text":"C","x":615,"y":135,"color":"#000000","fontSize":18,"bold":true},{"text":"D","x":735,"y":335,"color":"#000000","fontSize":18,"bold":true}]}

EXAMPLE 8:
User: A hexagon with a line going from its center to one of its vertices that is 3 cm, and one side length of 2 cm. Make sure the altitude from the center to one of its bases is marked with a dashed line.
Output:
{"canvas":{"width":900,"height":450,"bg":"#ffffff"},"defaults":{"stroke":"#000000","strokeWidth":3,"fill":"none","fontFamily":"Arial, system-ui, sans-serif","fontSize":18,"labelColor":"#000000"},"rects":[],"circles":[],"ellipses":[],"polygons":[{"points":[[450,110],[560,170],[560,290],[450,350],[340,290],[340,170]],"stroke":"#000000","strokeWidth":3,"fill":"none"}],"segments":[{"a":[450,225],"b":[560,170],"stroke":"#000000","strokeWidth":3,"dash":""},{"a":[450,225],"b":[450,130],"stroke":"#000000","strokeWidth":3,"dash":"6 6"}],"points":[{"at":[450,225],"r":4,"fill":"#000000","stroke":"none","strokeWidth":1}],"labels":[{"text":"O","x":430,"y":245,"color":"#000000","fontSize":18,"bold":true},{"text":"3 cm","x":520,"y":160,"color":"#000000","fontSize":18,"bold":true},{"text":"2 cm","x":510,"y":320,"color":"#000000","fontSize":18,"bold":true},{"text":"altitude (dashed)","x":470,"y":175,"color":"#000000","fontSize":16,"bold":false}]}

EXAMPLE 9:
User: Draw a triangle with a dashed altitude from vertex C to side AB. Label A, B, C.
Output:
{"canvas":{"width":900,"height":450,"bg":"#ffffff"},"defaults":{"stroke":"#000000","strokeWidth":3,"fill":"none","fontFamily":"Arial, system-ui, sans-serif","fontSize":18,"labelColor":"#000000"},"rects":[],"circles":[],"ellipses":[],"polygons":[{"points":[[260,320],[640,320],[460,130]],"stroke":"#000000","strokeWidth":3,"fill":"none"}],"segments":[{"a":[460,130],"b":[460,320],"stroke":"#000000","strokeWidth":3,"dash":"6 6"},{"a":[450,300],"b":[470,300],"stroke":"#000000","strokeWidth":3,"dash":""},{"a":[470,300],"b":[470,320],"stroke":"#000000","strokeWidth":3,"dash":""}],"points":[{"at":[260,320],"r":5,"fill":"#000000","stroke":"none","strokeWidth":1},{"at":[640,320],"r":5,"fill":"#000000","stroke":"none","strokeWidth":1},{"at":[460,130],"r":5,"fill":"#000000","stroke":"none","strokeWidth":1}],"labels":[{"text":"A","x":245,"y":335,"color":"#000000","fontSize":18,"bold":true},{"text":"B","x":660,"y":335,"color":"#000000","fontSize":18,"bold":true},{"text":"C","x":460,"y":105,"color":"#000000","fontSize":18,"bold":true}]}

EXAMPLE 10:
User: Give me two similar triangles, triangle ABC and triangle XYZ, where AB = 6 cm, BC = 9 cm, and XY = 10 cm corresponds to AB. Find YZ if YZ corresponds to BC.
Output:
{"canvas":{"width":900,"height":450,"bg":"#ffffff"},"defaults":{"stroke":"#000000","strokeWidth":3,"fill":"none","fontFamily":"Arial, system-ui, sans-serif","fontSize":18,"labelColor":"#000000"},"rects":[],"circles":[],"ellipses":[],"polygons":[{"points":[[180,320],[300,140],[380,320]],"stroke":"#000000","strokeWidth":3,"fill":"none"},{"points":[[560,340],[680,120],[780,340]],"stroke":"#000000","strokeWidth":3,"fill":"none"}],"segments":[],"points":[{"at":[180,320],"r":5,"fill":"#000000","stroke":"none","strokeWidth":1},{"at":[300,140],"r":5,"fill":"#000000","stroke":"none","strokeWidth":1},{"at":[380,320],"r":5,"fill":"#000000","stroke":"none","strokeWidth":1},{"at":[560,340],"r":5,"fill":"#000000","stroke":"none","strokeWidth":1},{"at":[680,120],"r":5,"fill":"#000000","stroke":"none","strokeWidth":1},{"at":[780,340],"r":5,"fill":"#000000","stroke":"none","strokeWidth":1}],"labels":[{"text":"A","x":165,"y":340,"color":"#000000","fontSize":18,"bold":true},{"text":"B","x":310,"y":125,"color":"#000000","fontSize":18,"bold":true},{"text":"C","x":390,"y":340,"color":"#000000","fontSize":18,"bold":true},{"text":"X","x":545,"y":360,"color":"#000000","fontSize":18,"bold":true},{"text":"Y","x":690,"y":105,"color":"#000000","fontSize":18,"bold":true},{"text":"Z","x":790,"y":360,"color":"#000000","fontSize":18,"bold":true},{"text":"6 cm","x":240,"y":330,"color":"#000000","fontSize":18,"bold":true},{"text":"9 cm","x":350,"y":240,"color":"#000000","fontSize":18,"bold":true},{"text":"10 cm","x":650,"y":350,"color":"#000000","fontSize":18,"bold":true},{"text":"?","x":745,"y":250,"color":"#000000","fontSize":18,"bold":true}]}

EXAMPLE 11:
User: Two parallel lines are cut by a transversal. One angle is (3x + 10) deg, its alternate interior angle is (5x - 30) deg. Solve for x and find the angle.
Output:
{"canvas":{"width":900,"height":450,"bg":"#ffffff"},"defaults":{"stroke":"#000000","strokeWidth":3,"fill":"none","fontFamily":"Arial, system-ui, sans-serif","fontSize":18,"labelColor":"#000000"},"rects":[],"circles":[],"ellipses":[],"polygons":[],"segments":[{"a":[180,160],"b":[740,160],"stroke":"#000000","strokeWidth":3,"dash":""},{"a":[180,320],"b":[740,320],"stroke":"#000000","strokeWidth":3,"dash":""},{"a":[320,90],"b":[600,380],"stroke":"#000000","strokeWidth":3,"dash":""}],"points":[],"labels":[{"text":"(3x + 10) deg","x":360,"y":190,"color":"#000000","fontSize":18,"bold":true},{"text":"(5x - 30) deg","x":520,"y":290,"color":"#000000","fontSize":18,"bold":true}]}

EXAMPLE 12:
User: Plot triangle ABC with A(0,0), B(6,0), C(2,4). Find area and perimeter.
Output:
{"canvas":{"width":900,"height":450,"bg":"#ffffff"},"defaults":{"stroke":"#000000","strokeWidth":3,"fill":"none","fontFamily":"Arial, system-ui, sans-serif","fontSize":18,"labelColor":"#000000"},"rects":[],"circles":[],"ellipses":[],"polygons":[],"segments":[{"a":[100,225],"b":[800,225],"stroke":"#000000","strokeWidth":3,"dash":""},{"a":[450,60],"b":[450,390],"stroke":"#000000","strokeWidth":3,"dash":""},{"a":[450,225],"b":[630,225],"stroke":"#000000","strokeWidth":3,"dash":""},{"a":[630,225],"b":[510,135],"stroke":"#000000","strokeWidth":3,"dash":""},{"a":[510,135],"b":[450,225],"stroke":"#000000","strokeWidth":3,"dash":""}],"points":[{"at":[450,225],"r":5,"fill":"#000000","stroke":"none","strokeWidth":1},{"at":[630,225],"r":5,"fill":"#000000","stroke":"none","strokeWidth":1},{"at":[510,135],"r":5,"fill":"#000000","stroke":"none","strokeWidth":1}],"labels":[{"text":"A(0,0)","x":430,"y":240,"color":"#000000","fontSize":18,"bold":false},{"text":"B(6,0)","x":650,"y":240,"color":"#000000","fontSize":18,"bold":false},{"text":"C(2,4)","x":510,"y":115,"color":"#000000","fontSize":18,"bold":false}]}
`.trim();
}

export const config = { runtime: "nodejs" };

// ----------------- server-side normalization -----------------
const CANVAS_W = 900;
const CANVAS_H = 450;
const MARGIN = 40;

function num(v: any, fallback: number) {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : fallback;
}
function str(v: any, fallback: string) {
  return typeof v === "string" && v.trim() ? v : fallback;
}
function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}
function arr<T>(v: any): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

// More forgiving: supports A(-2,3), A = (-2, 3), A: (-2,3)
function parsePointPairsFromText(text: string): Array<{ name: string; x: number; y: number }> {
  const re = /([A-Z])\s*(?:=|:)?\s*\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/g;
  const out: Array<{ name: string; x: number; y: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push({ name: m[1], x: Number(m[2]), y: Number(m[3]) });
  }
  return out;
}

function mapToCanvas(points: Array<{ x: number; y: number }>, w: number, h: number, margin: number) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);

  let minX = Math.min(...xs);
  let maxX = Math.max(...xs);
  let minY = Math.min(...ys);
  let maxY = Math.max(...ys);

  // Avoid zero ranges
  if (minX === maxX) {
    minX -= 1;
    maxX += 1;
  }
  if (minY === maxY) {
    minY -= 1;
    maxY += 1;
  }

  const pxMinX = margin;
  const pxMaxX = w - margin;
  const pxMinY = margin;
  const pxMaxY = h - margin;

  const scaleX = (pxMaxX - pxMinX) / (maxX - minX);
  const scaleY = (pxMaxY - pxMinY) / (maxY - minY);

  // Use the smaller scale to preserve aspect
  const scale = Math.min(scaleX, scaleY);

  // Center the mapped points
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  const pxMidX = w / 2;
  const pxMidY = h / 2;

  // IMPORTANT: invert Y so positive math-y goes UP visually
  const toPx = (x: number, y: number) => {
    const px = pxMidX + (x - midX) * scale;
    const py = pxMidY - (y - midY) * scale;
    return [px, py] as [number, number];
  };

  return { toPx };
}

function toPair(v: any, fallback: [number, number]): [number, number] {
  if (!Array.isArray(v) || v.length !== 2) return fallback;
  const x = Number(v[0]);
  const y = Number(v[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return fallback;
  return [x, y];
}

function normalizeAndClamp(diagram: any) {
  if (!diagram || typeof diagram !== "object") {
    throw new Error("Model returned non-object diagram.");
  }

  // Force deterministic canvas
  diagram.canvas = diagram.canvas ?? {};
  diagram.canvas.width = CANVAS_W;
  diagram.canvas.height = CANVAS_H;
  diagram.canvas.bg = "#ffffff";

  // Defaults: ensure sane baseline
  diagram.defaults = diagram.defaults ?? {};
  diagram.defaults.stroke = str(diagram.defaults.stroke, "#000000");
  diagram.defaults.strokeWidth = num(diagram.defaults.strokeWidth, 3);
  diagram.defaults.fill = str(diagram.defaults.fill, "none");
  diagram.defaults.fontFamily = str(diagram.defaults.fontFamily, "Arial, system-ui, sans-serif");
  diagram.defaults.fontSize = num(diagram.defaults.fontSize, 18);
  diagram.defaults.labelColor = str(diagram.defaults.labelColor, "#000000");

  const xLo = MARGIN;
  const yLo = MARGIN;
  const xHi = CANVAS_W - MARGIN;
  const yHi = CANVAS_H - MARGIN;

  // Rects: clamp size and position
  diagram.rects = arr<any>(diagram.rects).map((r) => {
    let w = Math.max(0, num(r.w, 0));
    let h = Math.max(0, num(r.h, 0));

    w = Math.min(w, xHi - xLo);
    h = Math.min(h, yHi - yLo);

    const x = clamp(num(r.x, 0), xLo, xHi - w);
    const y = clamp(num(r.y, 0), yLo, yHi - h);

    return {
      ...r,
      x,
      y,
      w,
      h,
      rx: num(r.rx, 0),
      ry: num(r.ry, 0),
      stroke: str(r.stroke, "#000000"),
      strokeWidth: num(r.strokeWidth, 3),
      fill: str(r.fill, "none"),
    };
  });

  // Circles: clamp center
  diagram.circles = arr<any>(diagram.circles).map((c) => {
    const r = Math.max(0, num(c.r, 0));
    const cx = clamp(num(c.cx, 0), xLo + r, xHi - r);
    const cy = clamp(num(c.cy, 0), yLo + r, yHi - r);
    return {
      ...c,
      cx,
      cy,
      r,
      stroke: str(c.stroke, "#000000"),
      strokeWidth: num(c.strokeWidth, 3),
      fill: str(c.fill, "none"),
    };
  });

  // Ellipses: clamp center
  diagram.ellipses = arr<any>(diagram.ellipses).map((e) => {
    const rx = Math.max(0, num(e.rx, 0));
    const ry = Math.max(0, num(e.ry, 0));
    const cx = clamp(num(e.cx, 0), xLo + rx, xHi - rx);
    const cy = clamp(num(e.cy, 0), yLo + ry, yHi - ry);
    return {
      ...e,
      cx,
      cy,
      rx,
      ry,
      stroke: str(e.stroke, "#000000"),
      strokeWidth: num(e.strokeWidth, 3),
      fill: str(e.fill, "none"),
    };
  });

  // Segments: clamp endpoints + default stroke/strokeWidth
  diagram.segments = arr<any>(diagram.segments)
    .map((seg) => {
      const a = toPair(seg?.a, [450, 225]);
      const b = toPair(seg?.b, [650, 275]);
      const ax = clamp(a[0], xLo, xHi);
      const ay = clamp(a[1], yLo, yHi);
      const bx = clamp(b[0], xLo, xHi);
      const by = clamp(b[1], yLo, yHi);
      const dash = typeof seg?.dash === "string" ? seg.dash.trim() : "";
      return {
        ...seg,
        a: [ax, ay],
        b: [bx, by],
        stroke: str(seg?.stroke, "#000000"),
        strokeWidth: num(seg?.strokeWidth, 3),
        dash,
      };
    })
    .filter((seg) => seg.a[0] !== seg.b[0] || seg.a[1] !== seg.b[1]);

  // Polygons: clamp each point + default styles
  diagram.polygons = arr<any>(diagram.polygons).map((p) => {
    const points = arr<any>(p.points).map((pt) => {
      const px = clamp(num(pt?.[0], 0), xLo, xHi);
      const py = clamp(num(pt?.[1], 0), yLo, yHi);
      return [px, py];
    });
    return {
      ...p,
      points,
      stroke: str(p.stroke, "#000000"),
      strokeWidth: num(p.strokeWidth, 3),
      fill: str(p.fill, "none"),
    };
  });

  // Points: clamp each location + default styles
  diagram.points = arr<any>(diagram.points).map((p) => {
    const at = toPair(p?.at, [450, 225]);
    const px = clamp(at[0], xLo, xHi);
    const py = clamp(at[1], yLo, yHi);
    return {
      ...p,
      at: [px, py],
      r: Math.max(1, num(p?.r, 5)),
      fill: str(p?.fill, "#000000"),
      stroke: str(p?.stroke, "none"),
      strokeWidth: num(p?.strokeWidth, 1),
    };
  });

  // Labels: clamp x/y + defaults
  diagram.labels = arr<any>(diagram.labels).map((l) => {
    const x = clamp(num(l?.x, 0), xLo, xHi);
    const y = clamp(num(l?.y, 0), yLo, yHi);
    return {
      ...l,
      text: str(l?.text, "?"),
      x,
      y,
      color: str(l?.color, "#000000"),
      fontSize: Math.max(10, num(l?.fontSize, 18)),
      bold: !!l?.bold,
    };
  });

  // Ensure arrays exist (defensive)
  diagram.rects ??= [];
  diagram.circles ??= [];
  diagram.ellipses ??= [];
  diagram.polygons ??= [];
  diagram.segments ??= [];
  diagram.points ??= [];
  diagram.labels ??= [];

  // --- Improve vertex label placement: push single-letter labels away from polygon centroid ---
  function dist2(ax: number, ay: number, bx: number, by: number) {
    const dx = ax - bx;
    const dy = ay - by;
    return dx * dx + dy * dy;
  }

  const VERTEX_SNAP_R2 = 18 * 18;
  const LABEL_PUSH = 16;

  for (const poly of diagram.polygons ?? []) {
    const pts = arr<any>(poly.points).map((p) => toPair(p, [0, 0]));
    if (pts.length < 3) continue;

    const cx = pts.reduce((sum, p) => sum + p[0], 0) / pts.length;
    const cy = pts.reduce((sum, p) => sum + p[1], 0) / pts.length;

    for (const lab of diagram.labels ?? []) {
      const t = str(lab?.text, "");
      if (!/^[A-Z]$/.test(t)) continue;

      for (const [vx, vy] of pts) {
        if (dist2(lab.x, lab.y, vx, vy) <= VERTEX_SNAP_R2) {
          const dx = vx - cx;
          const dy = vy - cy;
          const len = Math.hypot(dx, dy) || 1;
          const ux = dx / len;
          const uy = dy / len;

          lab.x = clamp(vx + ux * LABEL_PUSH, xLo, xHi);
          lab.y = clamp(vy + uy * LABEL_PUSH, yLo, yHi);
          break;
        }
      }
    }
  }

  return diagram;
}

// ----------------- handler -----------------
export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Use POST" });
      return;
    }

    const description = req.body?.description;
    if (!description || typeof description !== "string") {
      res.status(400).json({ error: "Missing description" });
      return;
    }

    const wantsPlot = /plot points?|connect (them|points|a and b)|segment\s+[a-z]{1,3}/i.test(description);

    const resp = await client.responses.create({
      model: "gpt-4o-mini",
      input: [
        { role: "system", content: systemPrompt() },
        { role: "user", content: description },
      ],
      text: {
        format: {
          type: "json_schema",
          strict: true,
          name: DIAGRAM_SCHEMA.name,
          schema: DIAGRAM_SCHEMA.schema,
        },
      },
      temperature: 0.2,
      max_output_tokens: 900,
    });

    const jsonText = resp.output_text;
    if (!jsonText || typeof jsonText !== "string") {
      res.status(500).json({ error: "Empty output_text from model." });
      return;
    }

    let diagram: any;
    try {
      diagram = JSON.parse(jsonText);
    } catch (parseErr: any) {
      res.status(500).json({
        error: "Failed to parse model JSON.",
        details: parseErr?.message ?? String(parseErr),
        snippet: String(jsonText).slice(0, 300),
      });
      return;
    }

    const safeDiagram = normalizeAndClamp(diagram);

    // --- Coordinate mapping override (deterministic) ---
    const parsed = parsePointPairsFromText(description);

    if (parsed.length >= 2) {
      const mapper = mapToCanvas(parsed, CANVAS_W, CANVAS_H, MARGIN);

      const xLo = MARGIN;
      const yLo = MARGIN;
      const xHi = CANVAS_W - MARGIN;
      const yHi = CANVAS_H - MARGIN;

      safeDiagram.points = parsed.map((p) => {
        const [pxRaw, pyRaw] = mapper.toPx(p.x, p.y);
        const px = clamp(pxRaw, xLo, xHi);
        const py = clamp(pyRaw, yLo, yHi);
        return { at: [px, py], r: 5, fill: "#000000", stroke: "none", strokeWidth: 1 };
      });

      const connect = /connect|segment|draw.*segment/i.test(description);
      safeDiagram.segments = connect
        ? [
            {
              a: safeDiagram.points[0].at,
              b: safeDiagram.points[1].at,
              stroke: "#000000",
              strokeWidth: 3,
            },
          ]
        : [];

      safeDiagram.labels = parsed.map((p, i) => {
        const at = safeDiagram.points[i].at;
        const lx = clamp(at[0] + 18, xLo, xHi);
        const ly = clamp(at[1] - 18, yLo, yHi);
        return {
          text: `${p.name}(${p.x}, ${p.y})`,
          x: lx,
          y: ly,
          color: "#000000",
          fontSize: 18,
          bold: false,
        };
      });

      // Keep arrays present
      safeDiagram.rects ??= [];
      safeDiagram.circles ??= [];
      safeDiagram.ellipses ??= [];
      safeDiagram.polygons ??= [];
    } else if (wantsPlot) {
      // Fallback: wants plot but no coordinates parsed
      safeDiagram.points ??= [];
      safeDiagram.segments ??= [];
      safeDiagram.labels ??= [];

      if (safeDiagram.points.length < 2) {
        safeDiagram.points = [
          { at: [380, 170], r: 5, fill: "#000000", stroke: "none", strokeWidth: 1 },
          { at: [620, 290], r: 5, fill: "#000000", stroke: "none", strokeWidth: 1 },
        ];
      }

      if (safeDiagram.segments.length < 1) {
        safeDiagram.segments = [
          { a: safeDiagram.points[0].at, b: safeDiagram.points[1].at, stroke: "#000000", strokeWidth: 3 },
        ];
      }

      if (safeDiagram.labels.length < 2) {
        safeDiagram.labels = [
          {
            text: "A",
            x: safeDiagram.points[0].at[0] - 25,
            y: safeDiagram.points[0].at[1] - 15,
            color: "#000000",
            fontSize: 18,
            bold: true,
          },
          {
            text: "B",
            x: safeDiagram.points[1].at[0] + 25,
            y: safeDiagram.points[1].at[1] + 15,
            color: "#000000",
            fontSize: 18,
            bold: true,
          },
        ];
      }
    }

    res.status(200).json({ diagram: safeDiagram, usage: resp.usage ?? null });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? String(e) });
  }
}
