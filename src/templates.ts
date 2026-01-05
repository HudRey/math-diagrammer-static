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

  "rects": [
    { "x": number, "y": number, "w": number, "h": number, "stroke": string, "strokeWidth": number, "fill": string, "rx": number, "ry": number }
  ],
  "circles": [
    { "cx": number, "cy": number, "r": number, "stroke": string, "strokeWidth": number, "fill": string }
  ],
  "ellipses": [
    { "cx": number, "cy": number, "rx": number, "ry": number, "stroke": string, "strokeWidth": number, "fill": string }
  ],

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
- labels should be readable and near their intended features
- include side-length labels ONLY when the diagram request asks (these templates DO include side labels because they’re for measurement problems)
`.trim();

function defaultsBlock() {
  return {
    stroke: "#000000",
    strokeWidth: 3,
    fill: "none",
    fontFamily: "Arial, system-ui, sans-serif",
    fontSize: 18,
    labelColor: "#000000",
  };
}

// Similar triangles helpers (still useful for proportions)
function extractTriangleTriples(desc: string): { tri1: string; tri2: string } {
  const m = desc.match(/triangles?\s+([A-Z]{3})\s+and\s+([A-Z]{3})/i);
  if (m) return { tri1: m[1].toUpperCase(), tri2: m[2].toUpperCase() };
  return { tri1: "ABC", tri2: "MNO" };
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

  return { pairs: [`${a1}↔${a2}`, `${b1}↔${b2}`, `${c1}↔${c2}`] };
}

export const templates: Template[] = [
  // =========================
  // PRE-ALGEBRA: MISSING SIDE (Perimeter)
  // =========================
  {
    id: "pa-rectangle-missing-side-x",
    name: "Pre-Algebra — Rectangle Missing Side (x)",
    defaultDescription:
      "Draw a rectangle for a perimeter problem. Label three sides: top = 12 cm, left = 7 cm, right = 7 cm. Label the bottom side as x cm.",
    promptBuilder: (desc) => `
${JSON_SCHEMA_BLOCK}

Diagram request:
${desc}

Extra constraints:
- Use one rect.
- Put labels centered on each side.
- Use 'x' for the unknown side label if requested.
`.trim(),
    starterJSON: JSON.stringify(
      {
        canvas: { width: 900, height: 450, bg: "#ffffff" },
        defaults: defaultsBlock(),
        rects: [{ x: 250, y: 120, w: 420, h: 220 }],
        labels: [
          { text: "12 cm", x: 460, y: 105, bold: true }, // top
          { text: "x cm", x: 460, y: 365, bold: true },  // bottom unknown
          { text: "7 cm", x: 230, y: 230, bold: true },  // left
          { text: "7 cm", x: 690, y: 230, bold: true },  // right
        ],
      },
      null,
      2
    ),
  },

  {
    id: "pa-rectangle-missing-side-q",
    name: "Pre-Algebra — Rectangle Missing Side (?)",
    defaultDescription:
      "Draw a rectangle for a perimeter problem. Label three sides: top = 18 in, left = 9 in, bottom = 18 in. Label the right side as ?.",
    promptBuilder: (desc) => `
${JSON_SCHEMA_BLOCK}

Diagram request:
${desc}

Extra constraints:
- Use one rect.
- Put labels centered on each side.
- Use '?' for unknown if requested.
`.trim(),
    starterJSON: JSON.stringify(
      {
        canvas: { width: 900, height: 450, bg: "#ffffff" },
        defaults: defaultsBlock(),
        rects: [{ x: 250, y: 120, w: 420, h: 220 }],
        labels: [
          { text: "18 in", x: 460, y: 105, bold: true }, // top
          { text: "18 in", x: 460, y: 365, bold: true }, // bottom
          { text: "9 in", x: 230, y: 230, bold: true },  // left
          { text: "?", x: 690, y: 230, bold: true },     // right unknown
        ],
      },
      null,
      2
    ),
  },

  // =========================
  // PRE-ALGEBRA: UNIT CONVERSION LABELS
  // =========================
  {
    id: "pa-rectangle-unit-conversion-cm-m",
    name: "Pre-Algebra — Unit Conversion (cm ↔ m)",
    defaultDescription:
      "Draw a rectangle with one side labeled 250 cm and the adjacent side labeled 1.8 m. (Unit conversion problem.)",
    promptBuilder: (desc) => `
${JSON_SCHEMA_BLOCK}

Diagram request:
${desc}

Extra constraints:
- Use one rect.
- Put unit labels clearly on the sides.
- Keep spacing generous so units are readable.
`.trim(),
    starterJSON: JSON.stringify(
      {
        canvas: { width: 900, height: 450, bg: "#ffffff" },
        defaults: defaultsBlock(),
        rects: [{ x: 270, y: 130, w: 380, h: 200 }],
        labels: [
          { text: "250 cm", x: 460, y: 115, bold: true }, // top
          { text: "1.8 m", x: 255, y: 230, bold: true },  // left
        ],
      },
      null,
      2
    ),
  },

  {
    id: "pa-rectangle-unit-conversion-in-ft",
    name: "Pre-Algebra — Unit Conversion (in ↔ ft)",
    defaultDescription:
      "Draw a rectangle with one side labeled 36 in and the adjacent side labeled 4 ft. (Unit conversion problem.)",
    promptBuilder: (desc) => `
${JSON_SCHEMA_BLOCK}

Diagram request:
${desc}

Extra constraints:
- Use one rect.
- Put unit labels clearly on the sides.
- Keep spacing generous so units are readable.
`.trim(),
    starterJSON: JSON.stringify(
      {
        canvas: { width: 900, height: 450, bg: "#ffffff" },
        defaults: defaultsBlock(),
        rects: [{ x: 270, y: 130, w: 380, h: 200 }],
        labels: [
          { text: "36 in", x: 460, y: 115, bold: true },
          { text: "4 ft", x: 255, y: 230, bold: true },
        ],
      },
      null,
      2
    ),
  },

  // =========================
  // PRE-ALGEBRA: AREA & PERIMETER BASICS
  // =========================
  {
    id: "pa-rectangle-perimeter-area",
    name: "Pre-Algebra — Rectangle (P/A with lengths)",
    defaultDescription:
      "Draw rectangle ABCD. Label vertices and label side lengths: AB = 12 cm, BC = 7 cm. No grid.",
    promptBuilder: (desc) => `
${JSON_SCHEMA_BLOCK}

Diagram request:
${desc}

Extra constraints:
- Use one rect.
- Put length labels centered on each side (top/bottom match, left/right match).
- Keep everything clean and not touching edges.
`.trim(),
    starterJSON: JSON.stringify(
      {
        canvas: { width: 900, height: 450, bg: "#ffffff" },
        defaults: defaultsBlock(),
        rects: [{ x: 250, y: 120, w: 420, h: 220 }],
        labels: [
          { text: "A", x: 245, y: 110, bold: true },
          { text: "B", x: 675, y: 110, bold: true },
          { text: "C", x: 675, y: 350, bold: true },
          { text: "D", x: 245, y: 350, bold: true },

          { text: "12 cm", x: 460, y: 105, bold: true },
          { text: "12 cm", x: 460, y: 365, bold: true },
          { text: "7 cm", x: 230, y: 230, bold: true },
          { text: "7 cm", x: 690, y: 230, bold: true },
        ],
      },
      null,
      2
    ),
  },

  {
    id: "pa-triangle-base-height",
    name: "Pre-Algebra — Triangle (base & height)",
    defaultDescription:
      "Draw a triangle with base labeled 14 cm and height labeled 9 cm (show altitude).",
    promptBuilder: (desc) => `
${JSON_SCHEMA_BLOCK}

Diagram request:
${desc}

Extra constraints:
- Use one triangle polygon.
- Show a height (altitude) from a vertex to the base using segments.
- Put base and height labels near correct parts.
`.trim(),
    starterJSON: JSON.stringify(
      {
        canvas: { width: 900, height: 450, bg: "#ffffff" },
        defaults: defaultsBlock(),
        polygons: [{ points: [[260, 340], [640, 340], [500, 150]] }],
        segments: [
          { a: [500, 150], b: [500, 340] },
          { a: [500, 325], b: [515, 325] },
          { a: [515, 325], b: [515, 340] },
        ],
        labels: [
          { text: "14 cm", x: 450, y: 365, bold: true },
          { text: "9 cm", x: 530, y: 245, bold: true },
        ],
      },
      null,
      2
    ),
  },

  // =========================
  // PRE-ALGEBRA: SIMILAR FIGURES / PROPORTIONS
  // =========================
  {
    id: "pa-similar-triangles-dynamic",
    name: "Pre-Algebra — Similar Triangles (dynamic letters)",
    defaultDescription:
      "Draw two similar triangles ABC and MNO where AB and MN are corresponding sides. Include AB = 6 cm and MN = 15 cm.",
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
          `  Draw/label triangles consistent with this mapping.`;
      }

      return `
${JSON_SCHEMA_BLOCK}

Diagram request:
${desc}

Extra constraints (important):
- Triangle ${tri1} should be on the left half; triangle ${tri2} on the right half.
- Use exactly 2 polygons total (one per triangle).
- Labels: ${tri1List} near vertices of the first triangle; ${tri2List} near vertices of the second triangle.
- Include any side-length labels the request mentions, placed near correct corresponding sides.
${mappingLine ? mappingLine : "- No additional correspondence constraints detected beyond similarity."}
`.trim();
    },
    starterJSON: JSON.stringify(
      {
        canvas: { width: 900, height: 450, bg: "#ffffff" },
        defaults: defaultsBlock(),
        polygons: [
          { points: [[170, 340], [130, 160], [320, 260]] },
          { points: [[560, 380], [500, 100], [820, 260]] },
        ],
        labels: [
          { text: "A", x: 170, y: 365, bold: true },
          { text: "B", x: 330, y: 255, bold: true },
          { text: "C", x: 120, y: 145, bold: true },

          { text: "M", x: 560, y: 405, bold: true },
          { text: "N", x: 835, y: 260, bold: true },
          { text: "O", x: 490, y: 90, bold: true },

          { text: "6 cm", x: 245, y: 305, bold: true },
          { text: "15 cm", x: 700, y: 335, bold: true },
        ],
      },
      null,
      2
    ),
  },

  // =========================
  // UTILITY
  // =========================
  {
    id: "segment-diagram",
    name: "Utility — Line Segments + Points",
    defaultDescription:
      "Draw a segment AB and a segment CD. Mark endpoints with points and label A,B,C,D.",
    promptBuilder: (desc) => `
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
        defaults: defaultsBlock(),
        segments: [
          { a: [180, 230], b: [380, 230] },
          { a: [560, 160], b: [770, 320] },
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
];
