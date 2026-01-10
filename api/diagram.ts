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
          // rx/ry optional (server will default them to 0)
          required: ["x", "y", "w", "h", "stroke", "strokeWidth", "fill"],
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
          },
          required: ["a", "b", "stroke", "strokeWidth"],
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
- Do NOT invent numeric values the user did not provide.
  - If the user says "x" or "unknown", show that exact text in a label.
  - If no numbers are given, use generic labels (like "x", "y", "?" or names like "A", "B") rather than making up measurements.
- Prefer rectangles/segments/labels for Pre-Algebra diagrams unless the user explicitly asks for something else.

Internal steps (do not output these steps):
1) Identify the primary diagram type (rectangle, polygon, segment diagram, coordinate plot, etc.).
2) Choose minimal shapes to represent it clearly.
3) Place labels near relevant sides/points.
4) Emit JSON matching schema.

Few-shot examples (learn the pattern and apply it):

EXAMPLE 1:
User: Draw a rectangle. Label top = 12 cm, left = 7 cm, right = 7 cm, bottom = x cm.
Output:
{"canvas":{"width":900,"height":450,"bg":"#ffffff"},"defaults":{"stroke":"#000000","strokeWidth":3,"fill":"none","fontFamily":"Arial, system-ui, sans-serif","fontSize":18,"labelColor":"#000000"},"rects":[{"x":250,"y":120,"w":400,"h":220,"stroke":"#000000","strokeWidth":3,"fill":"none","rx":0,"ry":0}],"circles":[],"ellipses":[],"polygons":[],"segments":[],"points":[],"labels":[{"text":"12 cm","x":450,"y":95,"color":"#000000","fontSize":22,"bold":false},{"text":"7 cm","x":225,"y":230,"color":"#000000","fontSize":22,"bold":false},{"text":"7 cm","x":675,"y":230,"color":"#000000","fontSize":22,"bold":false},{"text":"x cm","x":450,"y":365,"color":"#000000","fontSize":22,"bold":false}]}

EXAMPLE 2:
User: Plot points A(-2,3) and B(4,-1). Draw segment AB.
Output:
{"canvas":{"width":900,"height":450,"bg":"#ffffff"},"defaults":{"stroke":"#000000","strokeWidth":3,"fill":"none","fontFamily":"Arial, system-ui, sans-serif","fontSize":18,"labelColor":"#000000"},"rects":[],"circles":[],"ellipses":[],"polygons":[],"segments":[{"a":[350,150],"b":[600,300],"stroke":"#000000","strokeWidth":3}],"points":[{"at":[350,150],"r":5,"fill":"#000000","stroke":"none","strokeWidth":1},{"at":[600,300],"r":5,"fill":"#000000","stroke":"none","strokeWidth":1}],"labels":[{"text":"A(-2, 3)","x":320,"y":135,"color":"#000000","fontSize":18,"bold":false},{"text":"B(4, -1)","x":630,"y":315,"color":"#000000","fontSize":18,"bold":false}]}

EXAMPLE 3:
User: Draw a triangle with vertices A, B, and C.
Output:
{"canvas":{"width":900,"height":450,"bg":"#ffffff"},"defaults":{"stroke":"#000000","strokeWidth":3,"fill":"none","fontFamily":"Arial, system-ui, sans-serif","fontSize":18,"labelColor":"#000000"},"rects":[],"circles":[],"ellipses":[],"polygons":[{"points":[[320,320],[600,320],[460,140]],"stroke":"#000000","strokeWidth":3,"fill":"none"}],"segments":[],"points":[{"at":[320,320],"r":5,"fill":"#000000","stroke":"none","strokeWidth":1},{"at":[600,320],"r":5,"fill":"#000000","stroke":"none","strokeWidth":1},{"at":[460,140],"r":5,"fill":"#000000","stroke":"none","strokeWidth":1}],"labels":[{"text":"A","x":300,"y":335,"color":"#000000","fontSize":18,"bold":true},{"text":"B","x":620,"y":335,"color":"#000000","fontSize":18,"bold":true},{"text":"C","x":460,"y":115,"color":"#000000","fontSize":18,"bold":true}]}
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

function normalizeAndClamp(diagram: any) {
  if (!diagram || typeof diagram !== "object") {
    throw new Error("Model returned non-object diagram.");
  }

  // Force deterministic canvas for MVP
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

  // Rects: clamp size and position to remain inside margins
  diagram.rects = arr<any>(diagram.rects).map((r) => {
    let w = Math.max(0, num(r.w, 0));
    let h = Math.max(0, num(r.h, 0));

    // Clamp size so it can fit inside margins at all
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
    };
  });

  // Circles: clamp center so circle stays inside
  diagram.circles = arr<any>(diagram.circles).map((c) => {
    const r = Math.max(0, num(c.r, 0));
    const cx = clamp(num(c.cx, 0), xLo + r, xHi - r);
    const cy = clamp(num(c.cy, 0), yLo + r, yHi - r);
    return { ...c, cx, cy, r };
  });

  // Ellipses: clamp center so ellipse stays inside
  diagram.ellipses = arr<any>(diagram.ellipses).map((e) => {
    const rx = Math.max(0, num(e.rx, 0));
    const ry = Math.max(0, num(e.ry, 0));
    const cx = clamp(num(e.cx, 0), xLo + rx, xHi - rx);
    const cy = clamp(num(e.cy, 0), yLo + ry, yHi - ry);
    return { ...e, cx, cy, rx, ry };
  });

  // Segments: clamp endpoints
  diagram.segments = arr<any>(diagram.segments).map((seg) => {
    const ax = clamp(num(seg?.a?.[0], 0), xLo, xHi);
    const ay = clamp(num(seg?.a?.[1], 0), yLo, yHi);
    const bx = clamp(num(seg?.b?.[0], 0), xLo, xHi);
    const by = clamp(num(seg?.b?.[1], 0), yLo, yHi);
    return { ...seg, a: [ax, ay], b: [bx, by] };
  });

  // Polygons: clamp each point
  diagram.polygons = arr<any>(diagram.polygons).map((p) => {
    const points = arr<any>(p.points).map((pt) => {
      const px = clamp(num(pt?.[0], 0), xLo, xHi);
      const py = clamp(num(pt?.[1], 0), yLo, yHi);
      return [px, py];
    });
    return { ...p, points };
  });

  // Points: clamp each location
  diagram.points = arr<any>(diagram.points).map((p) => {
    const px = clamp(num(p?.at?.[0], 0), xLo, xHi);
    const py = clamp(num(p?.at?.[1], 0), yLo, yHi);
    return { ...p, at: [px, py] };
  });

  // Labels: clamp x/y
  diagram.labels = arr<any>(diagram.labels).map((l) => {
    const x = clamp(num(l.x, 0), xLo, xHi);
    const y = clamp(num(l.y, 0), yLo, yHi);
    return {
      ...l,
      text: str(l.text, ""),
      x,
      y,
      color: str(l.color, "#000000"),
      fontSize: num(l.fontSize, 18),
      bold: !!l.bold,
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

    res.status(200).json({ diagram: safeDiagram, usage: resp.usage ?? null });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? String(e) });
  }
}
