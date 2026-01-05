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
- include side-length labels ONLY when the diagram request asks
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

// Similar triangles helpers (useful for proportions)
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
  // ======================================================
  // PRE-ALGEBRA — PERIMETER/AREA: MISSING SIDE
  // ======================================================
  {
    id: "pa-rectangle-missing-side-x",
    name: "PA — Rectangle Missing Side (x)",
    defaultDescription:
      "Draw a rectangle for a perimeter problem. Label top = 12 cm, left = 7 cm, right = 7 cm, bottom = x cm.",
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
          { text: "12 cm", x: 460, y: 105, bold: true },
          { text: "x cm", x: 460, y: 365, bold: true },
          { text: "7 cm", x: 230, y: 230, bold: true },
          { text: "7 cm", x: 690, y: 230, bold: true },
        ],
      },
      null,
      2
    ),
  },

  {
    id: "pa-rectangle-missing-side-question",
    name: "PA — Rectangle Missing Side (?)",
    defaultDescription:
      "Draw a rectangle. Label top = 18 in, left = 9 in, bottom = 18 in, right = ?.",
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
          { text: "18 in", x: 460, y: 105, bold: true },
          { text: "18 in", x: 460, y: 365, bold: true },
          { text: "9 in", x: 230, y: 230, bold: true },
          { text: "?", x: 690, y: 230, bold: true },
        ],
      },
      null,
      2
    ),
  },

  // ======================================================
  // PRE-ALGEBRA — UNIT CONVERSION LABELS
  // ======================================================
  {
    id: "pa-unit-conversion-cm-m",
    name: "PA — Rectangle Unit Conversion (cm ↔ m)",
    defaultDescription:
      "Draw a rectangle with one side labeled 250 cm and the adjacent side labeled 1.8 m.",
    promptBuilder: (desc) => `
${JSON_SCHEMA_BLOCK}

Diagram request:
${desc}

Extra constraints:
- Use one rect.
- Keep unit labels clear and readable.
`.trim(),
    starterJSON: JSON.stringify(
      {
        canvas: { width: 900, height: 450, bg: "#ffffff" },
        defaults: defaultsBlock(),
        rects: [{ x: 270, y: 130, w: 380, h: 200 }],
        labels: [
          { text: "250 cm", x: 460, y: 115, bold: true },
          { text: "1.8 m", x: 255, y: 230, bold: true },
        ],
      },
      null,
      2
    ),
  },

  {
    id: "pa-unit-conversion-in-ft",
    name: "PA — Rectangle Unit Conversion (in ↔ ft)",
    defaultDescription:
      "Draw a rectangle with one side labeled 36 in and the adjacent side labeled 4 ft.",
    promptBuilder: (desc) => `
${JSON_SCHEMA_BLOCK}

Diagram request:
${desc}

Extra constraints:
- Use one rect.
- Keep unit labels clear and readable.
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

  // ======================================================
  // PRE-ALGEBRA — AREA/PERIMETER FOUNDATIONS
  // ======================================================
  {
    id: "pa-rectangle-with-lengths",
    name: "PA — Rectangle (lengths)",
    defaultDescription:
      "Draw rectangle ABCD. Label AB = 12 cm and BC = 7 cm. Label vertices.",
    promptBuilder: (desc) => `
${JSON_SCHEMA_BLOCK}

Diagram request:
${desc}

Extra constraints:
- Use one rect.
- Put length labels centered on each side.
- Keep vertex labels near corners.
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
    id: "pa-rectangle-algebraic-sides",
    name: "PA — Rectangle (algebraic sides)",
    defaultDescription:
      "Draw a rectangle with side lengths labeled (2x + 3) and (x - 1).",
    promptBuilder: (desc) => `
${JSON_SCHEMA_BLOCK}

Diagram request:
${desc}

Extra constraints:
- Use one rect.
- Put expressions centered on the sides.
`.trim(),
    starterJSON: JSON.stringify(
      {
        canvas: { width: 900, height: 450, bg: "#ffffff" },
        defaults: defaultsBlock(),
        rects: [{ x: 270, y: 130, w: 380, h: 200 }],
        labels: [
          { text: "2x + 3", x: 460, y: 115, bold: true },
          { text: "2x + 3", x: 460, y: 345, bold: true },
          { text: "x - 1", x: 255, y: 230, bold: true },
          { text: "x - 1", x: 665, y: 230, bold: true },
        ],
      },
      null,
      2
    ),
  },

  {
    id: "pa-triangle-base-height",
    name: "PA — Triangle (base & height)",
    defaultDescription:
      "Draw a triangle with base labeled 14 cm and height labeled 9 cm (show altitude).",
    promptBuilder: (desc) => `
${JSON_SCHEMA_BLOCK}

Diagram request:
${desc}

Extra constraints:
- Use one polygon.
- Show a height segment to the base with a right-angle marker.
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

  {
    id: "pa-parallelogram-base-height",
    name: "PA — Parallelogram (base & height)",
    defaultDescription:
      "Draw a parallelogram with base labeled 16 cm and height labeled 6 cm (show height).",
    promptBuilder: (desc) => `
${JSON_SCHEMA_BLOCK}

Diagram request:
${desc}

Extra constraints:
- Use one polygon.
- Show a perpendicular height segment with right-angle marker.
`.trim(),
    starterJSON: JSON.stringify(
      {
        canvas: { width: 900, height: 450, bg: "#ffffff" },
        defaults: defaultsBlock(),
        polygons: [{ points: [[260, 320], [380, 150], [700, 150], [580, 320]] }],
        segments: [
          { a: [380, 150], b: [380, 320] },
          { a: [380, 305], b: [395, 305] },
          { a: [395, 305], b: [395, 320] },
        ],
        labels: [
          { text: "16 cm", x: 420, y: 345, bold: true },
          { text: "6 cm", x: 405, y: 235, bold: true },
        ],
      },
      null,
      2
    ),
  },

  {
    id: "pa-trapezoid-bases-height",
    name: "PA — Trapezoid (bases & height)",
    defaultDescription:
      "Draw a trapezoid with bases labeled 18 cm (bottom) and 10 cm (top), and height labeled 7 cm.",
    promptBuilder: (desc) => `
${JSON_SCHEMA_BLOCK}

Diagram request:
${desc}

Extra constraints:
- Use one trapezoid polygon.
- Show a height segment with right-angle marker.
`.trim(),
    starterJSON: JSON.stringify(
      {
        canvas: { width: 900, height: 450, bg: "#ffffff" },
        defaults: defaultsBlock(),
        polygons: [{ points: [[250, 330], [350, 160], [590, 160], [710, 330]] }],
        segments: [
          { a: [420, 160], b: [420, 330] },
          { a: [420, 315], b: [435, 315] },
          { a: [435, 315], b: [435, 330] },
        ],
        labels: [
          { text: "10 cm", x: 470, y: 145, bold: true },
          { text: "18 cm", x: 480, y: 355, bold: true },
          { text: "7 cm", x: 445, y: 245, bold: true },
        ],
      },
      null,
      2
    ),
  },

  {
    id: "pa-circle-radius",
    name: "PA — Circle (radius)",
    defaultDescription:
      "Draw a circle with center O and radius labeled 8 cm. Include a radius segment.",
    promptBuilder: (desc) => `
${JSON_SCHEMA_BLOCK}

Diagram request:
${desc}

Extra constraints:
- Use circle primitive.
- Include center point label and radius label.
`.trim(),
    starterJSON: JSON.stringify(
      {
        canvas: { width: 900, height: 450, bg: "#ffffff" },
        defaults: defaultsBlock(),
        circles: [{ cx: 450, cy: 225, r: 140 }],
        segments: [{ a: [450, 225], b: [590, 225] }],
        points: [
          { at: [450, 225], r: 4, fill: "#000000" },
          { at: [590, 225], r: 4, fill: "#000000" },
        ],
        labels: [
          { text: "O", x: 430, y: 245, bold: true },
          { text: "8 cm", x: 520, y: 205, bold: true },
        ],
      },
      null,
      2
    ),
  },

  {
    id: "pa-composite-l-shape",
    name: "PA — Composite L-shape (area/perimeter)",
    defaultDescription:
      "Draw an L-shaped composite figure. Label outer side lengths with integers.",
    promptBuilder: (desc) => `
${JSON_SCHEMA_BLOCK}

Diagram request:
${desc}

Extra constraints:
- Use one polygon.
- Keep it axis-aligned.
- Place length labels near each outer edge.
`.trim(),
    starterJSON: JSON.stringify(
      {
        canvas: { width: 900, height: 450, bg: "#ffffff" },
        defaults: defaultsBlock(),
        polygons: [
          {
            points: [
              [260, 120],
              [640, 120],
              [640, 200],
              [450, 200],
              [450, 340],
              [260, 340],
            ],
          },
        ],
        labels: [
          { text: "14", x: 450, y: 105, bold: true },
          { text: "4", x: 655, y: 160, bold: true },
          { text: "7", x: 545, y: 215, bold: true },
          { text: "9", x: 465, y: 270, bold: true },
          { text: "6", x: 355, y: 355, bold: true },
          { text: "13", x: 245, y: 235, bold: true },
        ],
      },
      null,
      2
    ),
  },

  // ======================================================
  // PRE-ALGEBRA — SIMILAR FIGURES / SCALE FACTOR
  // ======================================================
  {
    id: "pa-similar-rectangles",
    name: "PA — Similar Rectangles (scale factor)",
    defaultDescription:
      "Draw two similar rectangles. Left: 6 cm by 4 cm. Right: 15 cm by 10 cm. Show corresponding sides.",
    promptBuilder: (desc) => `
${JSON_SCHEMA_BLOCK}

Diagram request:
${desc}

Extra constraints:
- Use rects for both.
- Smaller on left, larger on right.
- Put corresponding labels near corresponding sides.
`.trim(),
    starterJSON: JSON.stringify(
      {
        canvas: { width: 900, height: 450, bg: "#ffffff" },
        defaults: defaultsBlock(),
        rects: [
          { x: 140, y: 160, w: 240, h: 160 },
          { x: 540, y: 120, w: 300, h: 200 },
        ],
        labels: [
          { text: "6 cm", x: 260, y: 145, bold: true },
          { text: "4 cm", x: 125, y: 240, bold: true },
          { text: "15 cm", x: 690, y: 105, bold: true },
          { text: "10 cm", x: 525, y: 220, bold: true },
        ],
      },
      null,
      2
    ),
  },

  {
    id: "pa-similar-triangles-dynamic",
    name: "PA — Similar Triangles (dynamic letters)",
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

  // ======================================================
  // PRE-ALGEBRA — 3D: VOLUME & SURFACE AREA
  // ======================================================
  {
    id: "pa-rectangular-prism",
    name: "PA — Rectangular Prism (Volume/SA)",
    defaultDescription:
      "Draw a rectangular prism. Label length = 12, width = 5, height = 7. No shading.",
    promptBuilder: (desc) => `
${JSON_SCHEMA_BLOCK}

Diagram request:
${desc}

Extra constraints:
- Use polygons + segments for a clean box in perspective.
- Place L, W, H labels near appropriate edges.
`.trim(),
    starterJSON: JSON.stringify(
      {
        canvas: { width: 900, height: 450, bg: "#ffffff" },
        defaults: defaultsBlock(),
        polygons: [
          { points: [[280, 160], [560, 160], [560, 330], [280, 330]] }, // front
          { points: [[280, 160], [360, 100], [640, 100], [560, 160]] }, // top
          { points: [[560, 160], [640, 100], [640, 270], [560, 330]] }, // side
        ],
        labels: [
          { text: "12", x: 420, y: 350, bold: true },
          { text: "7", x: 260, y: 245, bold: true },
          { text: "5", x: 615, y: 125, bold: true },
        ],
      },
      null,
      2
    ),
  },

  {
    id: "pa-triangular-prism",
    name: "PA — Triangular Prism (Volume/SA)",
    defaultDescription:
      "Draw a triangular prism in perspective. Label the triangular base vertices A, B, C.",
    promptBuilder: (desc) => `
${JSON_SCHEMA_BLOCK}

Diagram request:
${desc}

Extra constraints:
- Use two similar triangles offset + connecting segments.
- Keep it centered and clean.
`.trim(),
    starterJSON: JSON.stringify(
      {
        canvas: { width: 900, height: 450, bg: "#ffffff" },
        defaults: defaultsBlock(),
        polygons: [
          { points: [[300, 320], [260, 160], [420, 220]] }, // front tri
          { points: [[470, 300], [430, 140], [590, 200]] }, // back tri
        ],
        segments: [
          { a: [300, 320], b: [470, 300] },
          { a: [260, 160], b: [430, 140] },
          { a: [420, 220], b: [590, 200] },
        ],
        labels: [
          { text: "A", x: 290, y: 340, bold: true },
          { text: "B", x: 250, y: 145, bold: true },
          { text: "C", x: 430, y: 205, bold: true },
        ],
      },
      null,
      2
    ),
  },

  {
    id: "pa-cylinder",
    name: "PA — Cylinder (Volume/SA)",
    defaultDescription:
      "Draw a cylinder. Label radius r = 6 and height h = 10. No shading.",
    promptBuilder: (desc) => `
${JSON_SCHEMA_BLOCK}

Diagram request:
${desc}

Extra constraints:
- Use ellipses + segments.
- Label radius and height clearly.
`.trim(),
    starterJSON: JSON.stringify(
      {
        canvas: { width: 900, height: 450, bg: "#ffffff" },
        defaults: defaultsBlock(),
        ellipses: [
          { cx: 450, cy: 130, rx: 160, ry: 45, fill: "none" },
          { cx: 450, cy: 320, rx: 160, ry: 45, fill: "none" },
        ],
        segments: [
          { a: [290, 130], b: [290, 320] },
          { a: [610, 130], b: [610, 320] },
          { a: [450, 130], b: [560, 130] }, // radius marker
        ],
        points: [{ at: [450, 130], r: 4, fill: "#000000" }],
        labels: [
          { text: "h = 10", x: 635, y: 230, bold: true },
          { text: "r = 6", x: 510, y: 110, bold: true },
        ],
      },
      null,
      2
    ),
  },

  // ======================================================
  // UTILITY
  // ======================================================
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
