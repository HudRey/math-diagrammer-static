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
- Do NOT draw a bounding box, frame, or background rectangle unless the user explicitly asks for it.
- When multiple shapes are requested, leave clear space between them unless the user explicitly says they touch/overlap/intersect or share edges/vertices.
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

function normalizeAndClamp(diagram: any, opts?: { allowRects?: boolean; allowTouching?: boolean }) {
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

  // Optional: strip all rectangles when not requested (prevents model "frames")
  if (opts?.allowRects === false) {
    diagram.rects = [];
  }

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

  // --- Enforce spacing between shapes unless touching is explicitly allowed ---
  if (opts?.allowTouching === false) {
    const gap = 30;
    const pad = 20;

    type BBox = { minX: number; minY: number; maxX: number; maxY: number };
    const bboxOverlap = (a: BBox, b: BBox) =>
      a.minX < b.maxX + gap && a.maxX > b.minX - gap && a.minY < b.maxY + gap && a.maxY > b.minY - gap;
    const expand = (b: BBox, d: number): BBox => ({
      minX: b.minX - d,
      minY: b.minY - d,
      maxX: b.maxX + d,
      maxY: b.maxY + d,
    });

    const clampBoxDelta = (b: BBox, dx: number, dy: number) => {
      const nx1 = clamp(b.minX + dx, xLo, xHi);
      const nx2 = clamp(b.maxX + dx, xLo, xHi);
      const ny1 = clamp(b.minY + dy, yLo, yHi);
      const ny2 = clamp(b.maxY + dy, yLo, yHi);
      return { dx: nx1 - b.minX, dy: ny1 - b.minY, nx1, nx2, ny1, ny2 };
    };

    const moveAssociated = (box: BBox, dx: number, dy: number) => {
      const b = expand(box, pad);

      diagram.labels = (diagram.labels ?? []).map((l: any) => {
        if (l.x >= b.minX && l.x <= b.maxX && l.y >= b.minY && l.y <= b.maxY) {
          return { ...l, x: clamp(l.x + dx, xLo, xHi), y: clamp(l.y + dy, yLo, yHi) };
        }
        return l;
      });

      diagram.points = (diagram.points ?? []).map((p: any) => {
        const [px, py] = toPair(p?.at, [0, 0]);
        if (px >= b.minX && px <= b.maxX && py >= b.minY && py <= b.maxY) {
          return { ...p, at: [clamp(px + dx, xLo, xHi), clamp(py + dy, yLo, yHi)] };
        }
        return p;
      });

      diagram.segments = (diagram.segments ?? []).map((s: any) => {
        const a = toPair(s?.a, [0, 0]);
        const b2 = toPair(s?.b, [0, 0]);
        const aIn = a[0] >= b.minX && a[0] <= b.maxX && a[1] >= b.minY && a[1] <= b.maxY;
        const bIn = b2[0] >= b.minX && b2[0] <= b.maxX && b2[1] >= b.minY && b2[1] <= b.maxY;
        if (aIn && bIn) {
          return {
            ...s,
            a: [clamp(a[0] + dx, xLo, xHi), clamp(a[1] + dy, yLo, yHi)],
            b: [clamp(b2[0] + dx, xLo, xHi), clamp(b2[1] + dy, yLo, yHi)],
          };
        }
        return s;
      });
    };

    type Shape = {
      kind: "rect" | "poly" | "circle" | "ellipse";
      idx: number;
      bbox: BBox;
      move: (dx: number, dy: number) => void;
    };

    const shapes: Shape[] = [];

    (diagram.rects ?? []).forEach((r: any, i: number) => {
      const b = { minX: r.x, minY: r.y, maxX: r.x + r.w, maxY: r.y + r.h };
      shapes.push({
        kind: "rect",
        idx: i,
        bbox: b,
        move: (dx, dy) => {
          r.x = clamp(r.x + dx, xLo, xHi - r.w);
          r.y = clamp(r.y + dy, yLo, yHi - r.h);
        },
      });
    });

    (diagram.polygons ?? []).forEach((p: any, i: number) => {
      const pts = arr<any>(p.points).map((pt) => toPair(pt, [0, 0]));
      if (!pts.length) return;
      const xs = pts.map((q) => q[0]);
      const ys = pts.map((q) => q[1]);
      const b = { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
      shapes.push({
        kind: "poly",
        idx: i,
        bbox: b,
        move: (dx, dy) => {
          p.points = pts.map(([x, y]) => [clamp(x + dx, xLo, xHi), clamp(y + dy, yLo, yHi)]);
        },
      });
    });

    (diagram.circles ?? []).forEach((c: any, i: number) => {
      const b = { minX: c.cx - c.r, minY: c.cy - c.r, maxX: c.cx + c.r, maxY: c.cy + c.r };
      shapes.push({
        kind: "circle",
        idx: i,
        bbox: b,
        move: (dx, dy) => {
          c.cx = clamp(c.cx + dx, xLo + c.r, xHi - c.r);
          c.cy = clamp(c.cy + dy, yLo + c.r, yHi - c.r);
        },
      });
    });

    (diagram.ellipses ?? []).forEach((e: any, i: number) => {
      const b = { minX: e.cx - e.rx, minY: e.cy - e.ry, maxX: e.cx + e.rx, maxY: e.cy + e.ry };
      shapes.push({
        kind: "ellipse",
        idx: i,
        bbox: b,
        move: (dx, dy) => {
          e.cx = clamp(e.cx + dx, xLo + e.rx, xHi - e.rx);
          e.cy = clamp(e.cy + dy, yLo + e.ry, yHi - e.ry);
        },
      });
    });

    const placed: Shape[] = [];
    for (const s of shapes) {
      let moved = false;
      for (const p of placed) {
        if (!bboxOverlap(s.bbox, p.bbox)) continue;

        const dxRight = p.bbox.maxX + gap - s.bbox.minX;
        let dx = dxRight;
        let dy = 0;
        let boxDelta = clampBoxDelta(s.bbox, dx, dy);

        if (boxDelta.nx2 > xHi) {
          const dxLeft = p.bbox.minX - gap - s.bbox.maxX;
          dx = dxLeft;
          boxDelta = clampBoxDelta(s.bbox, dx, 0);
        }

        if (boxDelta.nx1 < xLo || boxDelta.nx2 > xHi) {
          const dyDown = p.bbox.maxY + gap - s.bbox.minY;
          dy = dyDown;
          boxDelta = clampBoxDelta(s.bbox, 0, dy);
        }

        s.move(boxDelta.dx, boxDelta.dy);
        moveAssociated(s.bbox, boxDelta.dx, boxDelta.dy);
        s.bbox = {
          minX: s.bbox.minX + boxDelta.dx,
          maxX: s.bbox.maxX + boxDelta.dx,
          minY: s.bbox.minY + boxDelta.dy,
          maxY: s.bbox.maxY + boxDelta.dy,
        };
        moved = true;
      }
      placed.push(s);
      if (moved) {
        // update placed bboxes to reflect any moves
        placed.forEach((pp) => {
          // keep as-is; already updated for moved shapes
        });
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

    const mentionsRect = /(rectangle|square|rect|box|frame|border)/i.test(description);
    const allowsTouching = /(touch|touching|overlap|overlapping|intersect|intersection|share|sharing|adjacent|tangent|inscribed|inside|nested|concentric|cross|connected|meet at|secant)/i.test(
      description
    );
    let safeDiagram = normalizeAndClamp(diagram, { allowRects: mentionsRect, allowTouching: allowsTouching });

    // --- Generic layout for "two <shape>" prompts (place left/right with gap) ---
    const wantsTwo = /(two|2)\s+/i.test(description);
    if (wantsTwo && !allowsTouching) {
      const xLo = MARGIN;
      const xHi = CANVAS_W - MARGIN;
      const yLo = MARGIN;
      const yHi = CANVAS_H - MARGIN;

      const leftBox = { minX: xLo + 20, maxX: 380, minY: 120, maxY: 330 };
      const rightBox = { minX: 520, maxX: xHi - 20, minY: 120, maxY: 330 };

      const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

      const moveAssociated = (box: { minX: number; minY: number; maxX: number; maxY: number }, dx: number, dy: number) => {
        const pad = 18;
        const b = {
          minX: box.minX - pad,
          minY: box.minY - pad,
          maxX: box.maxX + pad,
          maxY: box.maxY + pad,
        };

        safeDiagram.labels = (safeDiagram.labels ?? []).map((l: any) => {
          if (l.x >= b.minX && l.x <= b.maxX && l.y >= b.minY && l.y <= b.maxY) {
            return { ...l, x: clamp(l.x + dx, xLo, xHi), y: clamp(l.y + dy, yLo, yHi) };
          }
          return l;
        });

        safeDiagram.points = (safeDiagram.points ?? []).map((p: any) => {
          const at = toPair(p?.at, [0, 0]);
          if (at[0] >= b.minX && at[0] <= b.maxX && at[1] >= b.minY && at[1] <= b.maxY) {
            return { ...p, at: [clamp(at[0] + dx, xLo, xHi), clamp(at[1] + dy, yLo, yHi)] };
          }
          return p;
        });

        safeDiagram.segments = (safeDiagram.segments ?? []).map((s: any) => {
          const a = toPair(s?.a, [0, 0]);
          const b2 = toPair(s?.b, [0, 0]);
          const aIn = a[0] >= b.minX && a[0] <= b.maxX && a[1] >= b.minY && a[1] <= b.maxY;
          const bIn = b2[0] >= b.minX && b2[0] <= b.maxX && b2[1] >= b.minY && b2[1] <= b.maxY;
          if (aIn && bIn) {
            return {
              ...s,
              a: [clamp(a[0] + dx, xLo, xHi), clamp(a[1] + dy, yLo, yHi)],
              b: [clamp(b2[0] + dx, xLo, xHi), clamp(b2[1] + dy, yLo, yHi)],
            };
          }
          return s;
        });
      };

      const placeBBox = (bbox: { minX: number; minY: number; maxX: number; maxY: number }, box: typeof leftBox) => {
        const cx = (bbox.minX + bbox.maxX) / 2;
        const cy = (bbox.minY + bbox.maxY) / 2;
        const tx = clamp((box.minX + box.maxX) / 2, xLo, xHi);
        const ty = clamp((box.minY + box.maxY) / 2, yLo, yHi);
        return { dx: tx - cx, dy: ty - cy };
      };

      if (/two\s+(rectangles|rectangle|squares|square)/i.test(description) && (safeDiagram.rects?.length ?? 0) >= 2) {
        const r1 = safeDiagram.rects![0];
        const r2 = safeDiagram.rects![1];
        const b1 = { minX: r1.x, minY: r1.y, maxX: r1.x + r1.w, maxY: r1.y + r1.h };
        const b2 = { minX: r2.x, minY: r2.y, maxX: r2.x + r2.w, maxY: r2.y + r2.h };
        const d1 = placeBBox(b1, leftBox);
        const d2 = placeBBox(b2, rightBox);
        r1.x = clamp(r1.x + d1.dx, xLo, xHi - r1.w);
        r1.y = clamp(r1.y + d1.dy, yLo, yHi - r1.h);
        r2.x = clamp(r2.x + d2.dx, xLo, xHi - r2.w);
        r2.y = clamp(r2.y + d2.dy, yLo, yHi - r2.h);
        moveAssociated(b1, d1.dx, d1.dy);
        moveAssociated(b2, d2.dx, d2.dy);
      }

      if (/two\s+(circles|circle)/i.test(description) && (safeDiagram.circles?.length ?? 0) >= 2) {
        const c1 = safeDiagram.circles![0];
        const c2 = safeDiagram.circles![1];
        const b1 = { minX: c1.cx - c1.r, minY: c1.cy - c1.r, maxX: c1.cx + c1.r, maxY: c1.cy + c1.r };
        const b2 = { minX: c2.cx - c2.r, minY: c2.cy - c2.r, maxX: c2.cx + c2.r, maxY: c2.cy + c2.r };
        const d1 = placeBBox(b1, leftBox);
        const d2 = placeBBox(b2, rightBox);
        c1.cx = clamp(c1.cx + d1.dx, xLo + c1.r, xHi - c1.r);
        c1.cy = clamp(c1.cy + d1.dy, yLo + c1.r, yHi - c1.r);
        c2.cx = clamp(c2.cx + d2.dx, xLo + c2.r, xHi - c2.r);
        c2.cy = clamp(c2.cy + d2.dy, yLo + c2.r, yHi - c2.r);
        moveAssociated(b1, d1.dx, d1.dy);
        moveAssociated(b2, d2.dx, d2.dy);
      }

      if (/two\s+(ellipses|ellipse)/i.test(description) && (safeDiagram.ellipses?.length ?? 0) >= 2) {
        const e1 = safeDiagram.ellipses![0];
        const e2 = safeDiagram.ellipses![1];
        const b1 = { minX: e1.cx - e1.rx, minY: e1.cy - e1.ry, maxX: e1.cx + e1.rx, maxY: e1.cy + e1.ry };
        const b2 = { minX: e2.cx - e2.rx, minY: e2.cy - e2.ry, maxX: e2.cx + e2.rx, maxY: e2.cy + e2.ry };
        const d1 = placeBBox(b1, leftBox);
        const d2 = placeBBox(b2, rightBox);
        e1.cx = clamp(e1.cx + d1.dx, xLo + e1.rx, xHi - e1.rx);
        e1.cy = clamp(e1.cy + d1.dy, yLo + e1.ry, yHi - e1.ry);
        e2.cx = clamp(e2.cx + d2.dx, xLo + e2.rx, xHi - e2.rx);
        e2.cy = clamp(e2.cy + d2.dy, yLo + e2.ry, yHi - e2.ry);
        moveAssociated(b1, d1.dx, d1.dy);
        moveAssociated(b2, d2.dx, d2.dy);
      }

      if (/two\s+(polygons|polygon|triangles|triangle|hexagons|hexagon)/i.test(description) && (safeDiagram.polygons?.length ?? 0) >= 2) {
        const p1 = safeDiagram.polygons![0];
        const p2 = safeDiagram.polygons![1];
        const pts1 = arr<any>(p1.points).map((pt) => toPair(pt, [0, 0]));
        const pts2 = arr<any>(p2.points).map((pt) => toPair(pt, [0, 0]));
        if (pts1.length && pts2.length) {
          const xs1 = pts1.map((q) => q[0]);
          const ys1 = pts1.map((q) => q[1]);
          const xs2 = pts2.map((q) => q[0]);
          const ys2 = pts2.map((q) => q[1]);
          const b1 = { minX: Math.min(...xs1), minY: Math.min(...ys1), maxX: Math.max(...xs1), maxY: Math.max(...ys1) };
          const b2 = { minX: Math.min(...xs2), minY: Math.min(...ys2), maxX: Math.max(...xs2), maxY: Math.max(...ys2) };
          const d1 = placeBBox(b1, leftBox);
          const d2 = placeBBox(b2, rightBox);
          p1.points = pts1.map(([x, y]) => [clamp(x + d1.dx, xLo, xHi), clamp(y + d1.dy, yLo, yHi)]);
          p2.points = pts2.map(([x, y]) => [clamp(x + d2.dx, xLo, xHi), clamp(y + d2.dy, yLo, yHi)]);
          moveAssociated(b1, d1.dx, d1.dy);
          moveAssociated(b2, d2.dx, d2.dy);
        }
      }
    }

    // --- Special-case: two reflected triangles ---
    const wantsTwoTriangles = /two\s+triangles?/i.test(description);
    const wantsReflection = /(reflect|reflected|mirror|mirrored)/i.test(description);
    if (wantsTwoTriangles && wantsReflection) {
      // Deterministic mirrored pair with a clear gap between shapes
      const left = [
        [180, 310],
        [320, 150],
        [420, 310],
      ];
      const right = [
        [780, 310],
        [640, 150],
        [540, 310],
      ];

      // base labels from prompt
      const baseLabel = description.match(/base\s+([0-9a-zA-Z+\-]+)\s*(cm|in|m|ft)?/i);
      const base1 = baseLabel ? `${baseLabel[1]}${baseLabel[2] ? " " + baseLabel[2] : ""}` : "15 cm";
      const base2 = /x\s*\+\s*y/i.test(description) ? "x + y" : "?";

      safeDiagram = {
        ...safeDiagram,
        rects: [],
        circles: [],
        ellipses: [],
        polygons: [
          { points: left, stroke: "#000000", strokeWidth: 3, fill: "none" },
          { points: right, stroke: "#000000", strokeWidth: 3, fill: "none" },
        ],
        segments: [],
        points: [],
        labels: [
          { text: "A", x: 165, y: 330, color: "#000000", fontSize: 18, bold: true },
          { text: "B", x: 320, y: 135, color: "#000000", fontSize: 18, bold: true },
          { text: "C", x: 435, y: 330, color: "#000000", fontSize: 18, bold: true },
          { text: "D", x: 795, y: 330, color: "#000000", fontSize: 18, bold: true },
          { text: "E", x: 640, y: 135, color: "#000000", fontSize: 18, bold: true },
          { text: "F", x: 525, y: 330, color: "#000000", fontSize: 18, bold: true },
          { text: base1, x: 300, y: 340, color: "#000000", fontSize: 18, bold: true },
          { text: base2, x: 660, y: 340, color: "#000000", fontSize: 18, bold: true },
        ],
      };
    }

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
