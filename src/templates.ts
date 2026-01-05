export type Template = {
  id: string;
  name: string;
  defaultDescription: string;
  promptBuilder: (description: string) => string;
  starterJSON: string;
};

const JSON_SCHEMA_BLOCK = `
Return ONLY valid JSON (no markdown, no commentary) matching this structure:

{
  "canvas": { "width": number, "height": number, "bg": string },
  "defaults": { "stroke": string, "strokeWidth": number, "fill": string, "fontFamily": string, "fontSize": number, "labelColor": string },
  "polygons": [
    { "points": [[number,number],...], "stroke": string, "strokeWidth": number, "fill": string }
  ],
  "segments": [
    { "a": [number,number], "b": [number,number], "stroke": string, "strokeWidth": number }
  ],
  "points": [
    { "at": [number,number], "r": number, "fill": string, "stroke": string, "strokeWidth": number }
  ],
  "labels": [
    { "text": string, "x": number, "y": number, "color": string, "fontSize": number, "bold": boolean }
  ]
}

Rules:
- canvas must be 900x450, bg "#ffffff"
- use crisp black strokes "#000000"
- keep shapes and labels at least 40px from edges
- labels should be readable and near their intended vertices
- do not include side lengths unless the prompt asks
`.trim();

function extractTriangleTriples(desc: string): { tri1: string; tri2: string } {
  const m = desc.match(/triangles?\s+([A-Z]{3})\s+and\s+([A-Z]{3})/i);
  if (m) return { tri1: m[1].toUpperCase(), tri2: m[2].toUpperCase() };
  return { tri1: "ABC", tri2: "DEF" };
}

function extractCorrespondingSides(desc: string): { side1: string; side2: string } | null {
  const m = desc.match(/([A-Z]{2})\s+and\s+([A-Z]{2})\s+are\s+correspond/i);
  if (!m) return null;
  return { side1: m[1].toUpperCase(), side2: m[2].toUpperCase() };
}

function buildVertexMapping(tri1: string, tri2: string, side1: string, side2: string) {
  const a1 = side1[0], b1 = side1[1];
  const a2 = side2[0], b2 = side2[1];

  const t1 = tri1.split("");
  const t2 = tri2.split("");

  const c1 = t1.find((ch) => ch !== a1 && ch !== b1) ?? t1[2];
  const c2 = t2.find((ch) => ch !== a2 && ch !== b2) ?? t2[2];

  return {
    pairs: [`${a1}↔${a2}`, `${b1}↔${b2}`, `${c1}↔${c2}`],
  };
}

export const templates = [
  {
    id: "similar-triangles",
    name: "Similar Triangles (dynamic letters)",
    defaultDescription:
      "Draw two similar triangles ABC and MNO where AB and MN are corresponding sides. Label vertices only.",
    promptBuilder: (desc: string) => {
      const { tri1, tri2 } = extractTriangleTriples(desc);
      const corr = extractCorrespondingSides(desc);

      const tri1List = tri1.split("").join(",");
      const tri2List = tri2.split("").join(",");

      let mappingLine = "";
      if (corr) {
        const map = buildVertexMapping(tri1, tri2, corr.side1, corr.side2);
        mappingLine =
          `- Correspondence constraint: side ${corr.side1} in ${tri1} corresponds to side ${corr.side2} in ${tri2}.\n` +
          `  This implies vertex mapping: ${map.pairs.join(", ")}.\n` +
          `  Draw/label triangles consistent with this mapping (orientation can differ, but correspondence must match).`;
      }

      return `
${JSON_SCHEMA_BLOCK}

Diagram request:
${desc}

Extra constraints (important):
- Triangle ${tri1} should be on the left half; triangle ${tri2} on the right half.
- Use exactly 2 polygons total (one per triangle).
- Labels: ${tri1List} near vertices of the first triangle; ${tri2List} near vertices of the second triangle.
${mappingLine ? mappingLine : "- No additional correspondence constraints detected beyond similarity."}
`.trim();
    },
    starterJSON: JSON.stringify(
      {
        canvas: { width: 900, height: 450, bg: "#ffffff" },
        defaults: {
          stroke: "#000000",
          strokeWidth: 3,
          fill: "none",
          fontFamily: "Arial, system-ui, sans-serif",
          fontSize: 18,
          labelColor: "#000000",
        },
        polygons: [
          {
            points: [
              [160, 360],
              [120, 140],
              [300, 270],
            ],
            stroke: "#000000",
            strokeWidth: 3,
            fill: "none",
          },
          {
            points: [
              [560, 390],
              [500, 90],
              [820, 270],
            ],
            stroke: "#000000",
            strokeWidth: 3,
            fill: "none",
          },
        ],
        labels: [
          { text: "A", x: 160, y: 385, color: "#000000", fontSize: 18, bold: true },
          { text: "B", x: 310, y: 270, color: "#000000", fontSize: 18, bold: true },
          { text: "C", x: 110, y: 135, color: "#000000", fontSize: 18, bold: true },
          { text: "D", x: 560, y: 415, color: "#000000", fontSize: 18, bold: true },
          { text: "E", x: 835, y: 270, color: "#000000", fontSize: 18, bold: true },
          { text: "F", x: 490, y: 85, color: "#000000", fontSize: 18, bold: true },
        ],
      },
      null,
      2
    ),
  },

  {
    id: "segment-diagram",
    name: "Line Segments + Points",
    defaultDescription:
      "Draw a segment AB and a segment CD. Mark endpoints with points and label A,B,C,D.",
    promptBuilder: (desc: string) => `
${JSON_SCHEMA_BLOCK}

Diagram request:
${desc}

Extra constraints:
- Use segments + points for endpoints.
- Keep everything centered and clean.
`.trim(),
    starterJSON: JSON.stringify(
      {
        canvas: { width: 900, height: 450, bg: "#ffffff" },
        defaults: {
          stroke: "#000000",
          strokeWidth: 3,
          fill: "none",
          fontFamily: "Arial, system-ui, sans-serif",
          fontSize: 18,
          labelColor: "#000000",
        },
        segments: [
          { a: [180, 230], b: [380, 230], stroke: "#000000", strokeWidth: 3 },
          { a: [560, 160], b: [770, 320], stroke: "#000000", strokeWidth: 3 },
        ],
        points: [
          { at: [180, 230], r: 4, fill: "#000000" },
          { at: [380, 230], r: 4, fill: "#000000" },
          { at: [560, 160], r: 4, fill: "#000000" },
          { at: [770, 320], r: 4, fill: "#000000" },
        ],
        labels: [
          { text: "A", x: 170, y: 250, bold: true },
          { text: "B", x: 390, y: 250, bold: true },
          { text: "C", x: 550, y: 140, bold: true },
          { text: "D", x: 780, y: 340, bold: true },
        ],
      },
      null,
      2
    ),
  },
] satisfies { id: string; name: string; defaultDescription: string; promptBuilder: (d: string) => string; starterJSON: string }[];
