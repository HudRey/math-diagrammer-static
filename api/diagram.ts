import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const DIAGRAM_SCHEMA = {
  name: "diagram_spec",
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
          required: ["x", "y", "w", "h"],
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
          required: ["cx", "cy", "r"],
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
          required: ["cx", "cy", "rx", "ry"],
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
          required: ["points"],
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
          required: ["a", "b"],
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
          required: ["at"],
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
          required: ["text", "x", "y"],
        },
      },
    },
    required: ["canvas", "defaults"],
  },
  strict: true,
};

function systemPrompt() {
  return `
You output diagram JSON that matches the schema exactly.

Hard rules:
- canvas is 900x450 with bg "#ffffff"
- default stroke "#000000", no extra keys
- keep shapes and labels at least 40px from edges
- labels readable and near their intended objects
- do not invent side lengths unless the user asks
`.trim();
}

export default {
  async fetch(request: Request) {
    try {
      if (request.method !== "POST") {
        return new Response(JSON.stringify({ error: "Use POST" }), {
          status: 405,
          headers: { "content-type": "application/json" },
        });
      }

      const body = await request.json().catch(() => null);
      const description = body?.description;

      if (!description || typeof description !== "string") {
        return new Response(JSON.stringify({ error: "Missing description" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
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

      const out = resp.output?.[0];
      const content = out?.content?.[0];
      const jsonText = (content as any)?.text;

      if (!jsonText) {
        return new Response(JSON.stringify({ error: "No model output" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        });
      }

      const diagram = JSON.parse(jsonText);

      return new Response(JSON.stringify({ diagram, usage: resp.usage ?? null }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e?.message ?? String(e) }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }
  },
};
