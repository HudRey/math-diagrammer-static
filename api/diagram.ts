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
    required: [
      "canvas",
      "defaults",
      "rects",
      "circles",
      "ellipses",
      "polygons",
      "segments",
      "points",
      "labels",
    ],
  },
};

function systemPrompt() {
  return `
You output diagram JSON that matches the schema exactly.

Hard rules:
- Always output ALL top-level keys: canvas, defaults, rects, circles, ellipses, polygons, segments, points, labels.
  If a section is unused, output it as an empty array [].
- canvas is 900x450 with bg "#ffffff"
- defaults.stroke "#000000" and defaults.labelColor "#000000"
- Keep shapes/labels at least 40px from edges.
- Labels readable and near intended objects.
- Do not invent side lengths unless the user asks.
- Do not include extra keys.
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

  // Defaults: ensure sane baseline (model will already include due to schema, but keep safe)
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

  // Rects: clamp x/y and size to keep within margins
  diagram.rects = arr<any>(diagram.rects).map((r) => {
    const w = num(r.w, 0);
    const h = num(r.h, 0);

    // clamp top-left so bottom-right stays inside
    const x = clamp(num(r.x, 0), xLo, Math.max(xLo, xHi - w));
    const y = clamp(num(r.y, 0), yLo, Math.max(yLo, yHi - h));

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

  // Labels: clamp x/y (keep text inside page-ish)
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
      max_output_tokens: 1200,
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
        // helpful for debugging; keep small
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
