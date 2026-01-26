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
    { "a": [number,number], "b": [number,number], "stroke": string, "strokeWidth": number, "dash": string }
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

  return { pairs: [`${a1}<->${a2}`, `${b1}<->${b2}`, `${c1}<->${c2}`] };
}

export const templates: Template[] = [
  // ======================================================
  // PRE-ALGEBRA  -  PERIMETER/AREA: MISSING SIDE
  // ======================================================
  {
    id: "pa-rectangle-missing-side-x",
    name: "PA  -  Rectangle Missing Side (x)",
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
    name: "PA  -  Rectangle Missing Side (?)",
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
  // PRE-ALGEBRA  -  UNIT CONVERSION LABELS
  // ======================================================
  {
    id: "pa-unit-conversion-cm-m",
    name: "PA  -  Rectangle Unit Conversion (cm <-> m)",
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
    name: "PA  -  Rectangle Unit Conversion (in <-> ft)",
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
  // PRE-ALGEBRA  -  AREA/PERIMETER FOUNDATIONS
  // ======================================================
  {
    id: "pa-rectangle-with-lengths",
    name: "PA  -  Rectangle (lengths)",
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
    name: "PA  -  Rectangle (algebraic sides)",
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
    name: "PA  -  Triangle (base & height)",
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
    name: "PA  -  Parallelogram (base & height)",
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
    name: "PA  -  Trapezoid (bases & height)",
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
    name: "PA  -  Circle (radius)",
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
    name: "PA  -  Composite L-shape (area/perimeter)",
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
  // PRE-ALGEBRA  -  SIMILAR FIGURES / SCALE FACTOR
  // ======================================================
  {
    id: "pa-similar-rectangles",
    name: "PA  -  Similar Rectangles (scale factor)",
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
    name: "PA  -  Similar Triangles (dynamic letters)",
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
  // PRE-ALGEBRA  -  3D: VOLUME & SURFACE AREA
  // ======================================================
  {
    id: "pa-rectangular-prism",
    name: "PA  -  Rectangular Prism (Volume/SA)",
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
    name: "PA  -  Triangular Prism (Volume/SA)",
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
    name: "PA  -  Cylinder (Volume/SA)",
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
    name: "Utility  -  Line Segments + Points",
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

  // ======================================================
  // SIMILARITY (scale factor, unknown sides, perimeters, areas)
  // ======================================================
  {
    id: "sim-tri-side-proportion",
    name: "Similarity  -  Side-Length Proportion",
    defaultDescription:
      "Give me two similar triangles, triangle ABC and triangle XYZ, where AB = 6 cm, BC = 9 cm, and XY = 10 cm corresponds to AB. Find YZ if YZ corresponds to BC.",
    promptBuilder: (desc) => `
${JSON_SCHEMA_BLOCK}

Diagram request:
${desc}

Extra constraints:
- Two similar triangles, left (ABC) and right (XYZ).
- Label AB = 6 cm, BC = 9 cm, XY = 10 cm, and YZ = ?.
`.trim(),
    starterJSON: JSON.stringify(
      {
        canvas: { width: 900, height: 450, bg: "#ffffff" },
        defaults: defaultsBlock(),
        polygons: [
          { points: [[180, 320], [320, 140], [380, 320]] },
          { points: [[560, 340], [680, 120], [780, 340]] },
        ],
        labels: [
          { text: "A", x: 170, y: 340, bold: true },
          { text: "B", x: 330, y: 125, bold: true },
          { text: "C", x: 390, y: 340, bold: true },
          { text: "X", x: 550, y: 360, bold: true },
          { text: "Y", x: 690, y: 105, bold: true },
          { text: "Z", x: 790, y: 360, bold: true },

          { text: "6 cm", x: 250, y: 330, bold: true },
          { text: "9 cm", x: 350, y: 240, bold: true },
          { text: "10 cm", x: 650, y: 350, bold: true },
          { text: "?", x: 745, y: 250, bold: true },
        ],
      },
      null,
      2
    ),
  },

  {
    id: "sim-perimeter-scale",
    name: "Similarity  -  Perimeter Scale",
    defaultDescription:
      "Two polygons are similar. The smaller has perimeter 28 and the scale factor from small -> large is 1.5. Find the large perimeter.",
    promptBuilder: (desc) => `
${JSON_SCHEMA_BLOCK}

Diagram request:
${desc}

Extra constraints:
- Two similar polygons (rectangles are fine).
- Show scale factor and perimeters.
`.trim(),
    starterJSON: JSON.stringify(
      {
        canvas: { width: 900, height: 450, bg: "#ffffff" },
        defaults: defaultsBlock(),
        rects: [
          { x: 160, y: 170, w: 200, h: 120 },
          { x: 520, y: 120, w: 300, h: 180 },
        ],
        labels: [
          { text: "P = 28", x: 260, y: 150, bold: true },
          { text: "k = 1.5", x: 440, y: 225, bold: true },
          { text: "P = ?", x: 670, y: 100, bold: true },
        ],
      },
      null,
      2
    ),
  },

  {
    id: "sim-area-scale",
    name: "Similarity  -  Area Scale",
    defaultDescription:
      "Two similar triangles have a side scale factor of 3 from small -> large. The smaller area is 12 cm^2. Find the larger area.",
    promptBuilder: (desc) => `
${JSON_SCHEMA_BLOCK}

Diagram request:
${desc}

Extra constraints:
- Two similar triangles, small left, large right.
- Label area of small and unknown area of large.
`.trim(),
    starterJSON: JSON.stringify(
      {
        canvas: { width: 900, height: 450, bg: "#ffffff" },
        defaults: defaultsBlock(),
        polygons: [
          { points: [[180, 320], [240, 180], [320, 320]] },
          { points: [[560, 360], [680, 120], [820, 360]] },
        ],
        labels: [
          { text: "A = 12 cm^2", x: 240, y: 350, bold: true },
          { text: "A = ?", x: 700, y: 385, bold: true },
          { text: "k = 3", x: 450, y: 230, bold: true },
        ],
      },
      null,
      2
    ),
  },

  {
    id: "sim-tri-parallel-lines",
    name: "Similarity  -  Triangle Inside Triangle (Parallel)",
    defaultDescription:
      "In triangle ABC, point D is on AB and point E is on AC, with DE || BC. If AD = 4, DB = 6, and AE = 5, find EC.",
    promptBuilder: (desc) => `
${JSON_SCHEMA_BLOCK}

Diagram request:
${desc}

Extra constraints:
- Draw triangle ABC.
- Draw segment DE parallel to BC.
- Label AD = 4, DB = 6, AE = 5, EC = ?.
`.trim(),
    starterJSON: JSON.stringify(
      {
        canvas: { width: 900, height: 450, bg: "#ffffff" },
        defaults: defaultsBlock(),
        polygons: [{ points: [[220, 340], [680, 340], [450, 120]] }],
        segments: [{ a: [320, 260], b: [580, 260] }],
        labels: [
          { text: "A", x: 200, y: 360, bold: true },
          { text: "B", x: 700, y: 360, bold: true },
          { text: "C", x: 450, y: 100, bold: true },
          { text: "D", x: 300, y: 260, bold: true },
          { text: "E", x: 600, y: 260, bold: true },
          { text: "4", x: 255, y: 300, bold: true },
          { text: "6", x: 460, y: 355, bold: true },
          { text: "5", x: 380, y: 200, bold: true },
          { text: "?", x: 525, y: 200, bold: true },
        ],
      },
      null,
      2
    ),
  },

  // ======================================================
  // CONGRUENCE (SSS, SAS, ASA/AAS, HL)
  // ======================================================
  {
    id: "cong-sss-triangles",
    name: "Congruence  -  SSS Triangles",
    defaultDescription:
      "Create two congruent triangles with sides 5 cm, 7 cm, and 9 cm. Label them triangle ABC and triangle DEF. Ask for the value of an unknown side like DF.",
    promptBuilder: (desc) => `
${JSON_SCHEMA_BLOCK}

Diagram request:
${desc}

Extra constraints:
- Two congruent triangles.
- Label sides 5, 7, 9 on one triangle; label DF as unknown on the other.
`.trim(),
    starterJSON: JSON.stringify(
      {
        canvas: { width: 900, height: 450, bg: "#ffffff" },
        defaults: defaultsBlock(),
        polygons: [
          { points: [[180, 330], [300, 160], [420, 330]] },
          { points: [[520, 330], [640, 160], [760, 330]] },
        ],
        labels: [
          { text: "A", x: 170, y: 350, bold: true },
          { text: "B", x: 310, y: 145, bold: true },
          { text: "C", x: 430, y: 350, bold: true },
          { text: "D", x: 510, y: 350, bold: true },
          { text: "E", x: 650, y: 145, bold: true },
          { text: "F", x: 770, y: 350, bold: true },

          { text: "5 cm", x: 240, y: 330, bold: true },
          { text: "7 cm", x: 310, y: 240, bold: true },
          { text: "9 cm", x: 390, y: 240, bold: true },
          { text: "DF = ?", x: 640, y: 360, bold: true },
        ],
      },
      null,
      2
    ),
  },

  {
    id: "cong-sas-included-angle",
    name: "Congruence  -  SAS (Included Angle)",
    defaultDescription:
      "Give triangle ABC and triangle DEF congruent by SAS: AB = DE = 8, AC = DF = 6, and angle A = angle D = 45 deg. Find angle F if angle C is marked congruent to it.",
    promptBuilder: (desc) => `
${JSON_SCHEMA_BLOCK}

Diagram request:
${desc}

Extra constraints:
- Two triangles, label AB = DE = 8 and AC = DF = 6.
- Mark angle A and angle D as 45 deg.
- Indicate angle C ~= angle F.
`.trim(),
    starterJSON: JSON.stringify(
      {
        canvas: { width: 900, height: 450, bg: "#ffffff" },
        defaults: defaultsBlock(),
        polygons: [
          { points: [[180, 330], [300, 170], [420, 330]] },
          { points: [[520, 330], [640, 170], [760, 330]] },
        ],
        labels: [
          { text: "A", x: 170, y: 350, bold: true },
          { text: "B", x: 310, y: 155, bold: true },
          { text: "C", x: 430, y: 350, bold: true },
          { text: "D", x: 510, y: 350, bold: true },
          { text: "E", x: 650, y: 155, bold: true },
          { text: "F", x: 770, y: 350, bold: true },

          { text: "8", x: 240, y: 330, bold: true },
          { text: "6", x: 330, y: 240, bold: true },
          { text: "8", x: 580, y: 330, bold: true },
          { text: "6", x: 690, y: 240, bold: true },
          { text: "45 deg", x: 200, y: 310, bold: true },
          { text: "45 deg", x: 540, y: 310, bold: true },
          { text: "angle C ~= angle F", x: 470, y: 120, bold: true },
        ],
      },
      null,
      2
    ),
  },

  {
    id: "cong-hl-right-triangles",
    name: "Congruence  -  HL Right Triangles",
    defaultDescription:
      "Make two right triangles congruent by HL: hypotenuse 13 and a leg 5. Find the other leg.",
    promptBuilder: (desc) => `
${JSON_SCHEMA_BLOCK}

Diagram request:
${desc}

Extra constraints:
- Two right triangles.
- Hypotenuse 13, one leg 5, other leg unknown.
`.trim(),
    starterJSON: JSON.stringify(
      {
        canvas: { width: 900, height: 450, bg: "#ffffff" },
        defaults: defaultsBlock(),
        polygons: [
          { points: [[200, 330], [200, 180], [360, 330]] },
          { points: [[540, 330], [540, 180], [700, 330]] },
        ],
        segments: [
          { a: [200, 310], b: [220, 310] },
          { a: [220, 310], b: [220, 330] },
          { a: [540, 310], b: [560, 310] },
          { a: [560, 310], b: [560, 330] },
        ],
        labels: [
          { text: "13", x: 280, y: 260, bold: true },
          { text: "5", x: 185, y: 250, bold: true },
          { text: "x", x: 290, y: 345, bold: true },
          { text: "13", x: 620, y: 260, bold: true },
          { text: "5", x: 525, y: 250, bold: true },
          { text: "x", x: 630, y: 345, bold: true },
        ],
      },
      null,
      2
    ),
  },

  // ======================================================
  // ANGLE-CHASING
  // ======================================================
  {
    id: "angle-parallel-transversal",
    name: "Angles  -  Parallel Lines + Transversal",
    defaultDescription:
      "Two parallel lines are cut by a transversal. One angle is (3x + 10) deg, its alternate interior angle is (5x - 30) deg. Solve for x and find the angle.",
    promptBuilder: (desc) => `
${JSON_SCHEMA_BLOCK}

Diagram request:
${desc}

Extra constraints:
- Two parallel lines and a transversal.
- Label the two alternate interior angles.
`.trim(),
    starterJSON: JSON.stringify(
      {
        canvas: { width: 900, height: 450, bg: "#ffffff" },
        defaults: defaultsBlock(),
        segments: [
          { a: [180, 160], b: [740, 160] },
          { a: [180, 320], b: [740, 320] },
          { a: [320, 90], b: [600, 380] },
        ],
        labels: [
          { text: "(3x + 10) deg", x: 360, y: 190, bold: true },
          { text: "(5x - 30) deg", x: 520, y: 290, bold: true },
        ],
      },
      null,
      2
    ),
  },

  {
    id: "angle-triangle-exterior",
    name: "Angles  -  Triangle Exterior Angle",
    defaultDescription:
      "In triangle ABC, angle A = 38 deg, angle B = 71 deg. Find the exterior angle at C.",
    promptBuilder: (desc) => `
${JSON_SCHEMA_BLOCK}

Diagram request:
${desc}

Extra constraints:
- Triangle ABC.
- Extend side at C to show exterior angle.
`.trim(),
    starterJSON: JSON.stringify(
      {
        canvas: { width: 900, height: 450, bg: "#ffffff" },
        defaults: defaultsBlock(),
        polygons: [{ points: [[220, 320], [640, 320], [460, 140]] }],
        segments: [{ a: [640, 320], b: [760, 320] }],
        labels: [
          { text: "A", x: 200, y: 340, bold: true },
          { text: "B", x: 660, y: 340, bold: true },
          { text: "C", x: 460, y: 120, bold: true },
          { text: "38 deg", x: 270, y: 300, bold: true },
          { text: "71 deg", x: 590, y: 300, bold: true },
          { text: "ext ?", x: 720, y: 300, bold: true },
        ],
      },
      null,
      2
    ),
  },

  {
    id: "angle-regular-polygon",
    name: "Angles  -  Regular Polygon (Interior 150 deg)",
    defaultDescription:
      "A regular polygon has interior angles of 150 deg. How many sides does it have?",
    promptBuilder: (desc) => `
${JSON_SCHEMA_BLOCK}

Diagram request:
${desc}

Extra constraints:
- Draw a regular polygon (12 sides).
- Label one interior angle as 150 deg.
`.trim(),
    starterJSON: JSON.stringify(
      {
        canvas: { width: 900, height: 450, bg: "#ffffff" },
        defaults: defaultsBlock(),
        polygons: [
          {
            points: [
              [450, 80],
              [520, 95],
              [580, 135],
              [620, 195],
              [635, 265],
              [620, 335],
              [580, 375],
              [520, 405],
              [450, 420],
              [380, 405],
              [320, 365],
              [280, 305],
              [265, 235],
              [280, 165],
              [320, 125],
              [380, 95],
            ],
          },
        ],
        labels: [{ text: "150 deg", x: 600, y: 180, bold: true }],
      },
      null,
      2
    ),
  },

  {
    id: "angle-quad-algebra",
    name: "Angles  -  Quadrilateral Algebra",
    defaultDescription:
      "In a quadrilateral, angles are (x+20) deg, (2x) deg, (x+30) deg, and (3x-10) deg. Solve for x.",
    promptBuilder: (desc) => `
${JSON_SCHEMA_BLOCK}

Diagram request:
${desc}

Extra constraints:
- Draw a quadrilateral.
- Label each interior angle with the expression.
`.trim(),
    starterJSON: JSON.stringify(
      {
        canvas: { width: 900, height: 450, bg: "#ffffff" },
        defaults: defaultsBlock(),
        polygons: [{ points: [[240, 320], [360, 140], [640, 180], [700, 340]] }],
        labels: [
          { text: "x + 20 deg", x: 250, y: 330, bold: true },
          { text: "2x deg", x: 360, y: 150, bold: true },
          { text: "x + 30 deg", x: 640, y: 190, bold: true },
          { text: "3x - 10 deg", x: 700, y: 340, bold: true },
        ],
      },
      null,
      2
    ),
  },

  // ======================================================
  // CIRCLES (central/inscribed angles, tangents, chords)
  // ======================================================
  {
    id: "circle-inscribed-angle",
    name: "Circles  -  Inscribed Angle",
    defaultDescription:
      "In a circle, an inscribed angle intercepts an arc of 110 deg. Find the inscribed angle.",
    promptBuilder: (desc) => `
${JSON_SCHEMA_BLOCK}

Diagram request:
${desc}

Extra constraints:
- Draw a circle with an inscribed angle.
- Label intercepted arc as 110 deg and the inscribed angle as ?.
`.trim(),
    starterJSON: JSON.stringify(
      {
        canvas: { width: 900, height: 450, bg: "#ffffff" },
        defaults: defaultsBlock(),
        circles: [{ cx: 450, cy: 225, r: 160 }],
        segments: [
          { a: [330, 150], b: [450, 225] },
          { a: [570, 150], b: [450, 225] },
        ],
        labels: [
          { text: "110 deg arc", x: 450, y: 90, bold: true },
          { text: "?", x: 450, y: 250, bold: true },
        ],
      },
      null,
      2
    ),
  },

  {
    id: "circle-central-vs-inscribed",
    name: "Circles  -  Central vs Inscribed",
    defaultDescription:
      "A central angle measures 84 deg and intercepts arc AB. Find the measure of an inscribed angle that intercepts arc AB.",
    promptBuilder: (desc) => `
${JSON_SCHEMA_BLOCK}

Diagram request:
${desc}

Extra constraints:
- Circle with center O.
- Show central angle 84 deg and an inscribed angle on the same arc.
`.trim(),
    starterJSON: JSON.stringify(
      {
        canvas: { width: 900, height: 450, bg: "#ffffff" },
        defaults: defaultsBlock(),
        circles: [{ cx: 450, cy: 225, r: 160 }],
        segments: [
          { a: [450, 225], b: [600, 160] },
          { a: [450, 225], b: [300, 160] },
          { a: [300, 160], b: [620, 300] },
          { a: [600, 160], b: [620, 300] },
        ],
        points: [{ at: [450, 225], r: 4, fill: "#000000" }],
        labels: [
          { text: "O", x: 430, y: 245, bold: true },
          { text: "84 deg", x: 450, y: 175, bold: true },
          { text: "?", x: 620, y: 320, bold: true },
        ],
      },
      null,
      2
    ),
  },

  {
    id: "circle-tangent-radius",
    name: "Circles  -  Tangent & Radius Perpendicular",
    defaultDescription:
      "A tangent touches a circle at point T. Radius OT is drawn. What is angle OT with the tangent line? (Then include a follow-up angle-chase.)",
    promptBuilder: (desc) => `
${JSON_SCHEMA_BLOCK}

Diagram request:
${desc}

Extra constraints:
- Show tangent line and radius to point of tangency.
- Mark right angle at tangency.
`.trim(),
    starterJSON: JSON.stringify(
      {
        canvas: { width: 900, height: 450, bg: "#ffffff" },
        defaults: defaultsBlock(),
        circles: [{ cx: 450, cy: 225, r: 140 }],
        segments: [
          { a: [590, 225], b: [800, 225] },
          { a: [450, 225], b: [590, 225] },
          { a: [575, 210], b: [595, 210] },
          { a: [595, 210], b: [595, 230] },
        ],
        points: [{ at: [590, 225], r: 4, fill: "#000000" }],
        labels: [
          { text: "O", x: 430, y: 245, bold: true },
          { text: "T", x: 605, y: 245, bold: true },
          { text: "90 deg", x: 610, y: 210, bold: true },
        ],
      },
      null,
      2
    ),
  },

  {
    id: "circle-chords-intersect",
    name: "Circles  -  Intersecting Chords",
    defaultDescription:
      "Two chords intersect inside a circle. One chord is split into segments 3 and 12. The other chord is split into segments x and 6. Solve for x.",
    promptBuilder: (desc) => `
${JSON_SCHEMA_BLOCK}

Diagram request:
${desc}

Extra constraints:
- Draw a circle with two intersecting chords.
- Label segments 3 and 12 on one chord; x and 6 on the other.
`.trim(),
    starterJSON: JSON.stringify(
      {
        canvas: { width: 900, height: 450, bg: "#ffffff" },
        defaults: defaultsBlock(),
        circles: [{ cx: 450, cy: 225, r: 160 }],
        segments: [
          { a: [310, 150], b: [590, 300] },
          { a: [590, 150], b: [310, 300] },
        ],
        labels: [
          { text: "3", x: 350, y: 185, bold: true },
          { text: "12", x: 520, y: 265, bold: true },
          { text: "x", x: 560, y: 185, bold: true },
          { text: "6", x: 340, y: 265, bold: true },
        ],
      },
      null,
      2
    ),
  },

  // ======================================================
  // COORDINATE GEOMETRY
  // ======================================================
  {
    id: "coord-distance",
    name: "Coordinate  -  Distance Formula",
    defaultDescription: "Points A(-2, 5) and B(4, -3). Find AB.",
    promptBuilder: (desc) => `
${JSON_SCHEMA_BLOCK}

Diagram request:
${desc}

Extra constraints:
- Plot A and B and draw segment AB.
- Show axes only if requested.
`.trim(),
    starterJSON: JSON.stringify(
      {
        canvas: { width: 900, height: 450, bg: "#ffffff" },
        defaults: defaultsBlock(),
        segments: [{ a: [300, 140], b: [600, 320] }],
        points: [
          { at: [300, 140], r: 5, fill: "#000000" },
          { at: [600, 320], r: 5, fill: "#000000" },
        ],
        labels: [
          { text: "A(-2, 5)", x: 260, y: 125, bold: false },
          { text: "B(4, -3)", x: 640, y: 335, bold: false },
        ],
      },
      null,
      2
    ),
  },

  {
    id: "coord-midpoint",
    name: "Coordinate  -  Midpoint",
    defaultDescription: "Find the midpoint of segment with endpoints (7, -1) and (-3, 9).",
    promptBuilder: (desc) => `
${JSON_SCHEMA_BLOCK}

Diagram request:
${desc}

Extra constraints:
- Plot endpoints and midpoint M.
- Draw segment between endpoints.
`.trim(),
    starterJSON: JSON.stringify(
      {
        canvas: { width: 900, height: 450, bg: "#ffffff" },
        defaults: defaultsBlock(),
        segments: [{ a: [620, 280], b: [280, 140] }],
        points: [
          { at: [620, 280], r: 5, fill: "#000000" },
          { at: [280, 140], r: 5, fill: "#000000" },
          { at: [450, 210], r: 5, fill: "#000000" },
        ],
        labels: [
          { text: "(7, -1)", x: 660, y: 295, bold: false },
          { text: "(-3, 9)", x: 240, y: 125, bold: false },
          { text: "M", x: 465, y: 195, bold: true },
        ],
      },
      null,
      2
    ),
  },

  {
    id: "coord-slope-perp",
    name: "Coordinate  -  Slope & Perpendicular",
    defaultDescription:
      "Line l has slope 2/3. Find the slope of a line perpendicular to l. Show it on a coordinate plane.",
    promptBuilder: (desc) => `
${JSON_SCHEMA_BLOCK}

Diagram request:
${desc}

Extra constraints:
- Draw axes.
- Draw a line with slope 2/3 and a perpendicular line.
`.trim(),
    starterJSON: JSON.stringify(
      {
        canvas: { width: 900, height: 450, bg: "#ffffff" },
        defaults: defaultsBlock(),
        segments: [
          { a: [100, 225], b: [800, 225] },
          { a: [450, 60], b: [450, 390] },
          { a: [250, 300], b: [700, 100] },
          { a: [350, 110], b: [610, 370] },
        ],
        labels: [
          { text: "x", x: 820, y: 225, bold: false },
          { text: "y", x: 450, y: 45, bold: false },
          { text: "m = 2/3", x: 270, y: 315, bold: true },
          { text: "m = -3/2", x: 620, y: 370, bold: true },
        ],
      },
      null,
      2
    ),
  },

  {
    id: "coord-triangle-area",
    name: "Coordinate  -  Triangle on Plane",
    defaultDescription:
      "Plot triangle ABC with A(0,0), B(6,0), C(2,4). Find area and perimeter.",
    promptBuilder: (desc) => `
${JSON_SCHEMA_BLOCK}

Diagram request:
${desc}

Extra constraints:
- Draw axes.
- Plot and label A, B, C and connect triangle.
`.trim(),
    starterJSON: JSON.stringify(
      {
        canvas: { width: 900, height: 450, bg: "#ffffff" },
        defaults: defaultsBlock(),
        segments: [
          { a: [100, 225], b: [800, 225] },
          { a: [450, 60], b: [450, 390] },
          { a: [450, 225], b: [630, 225] },
          { a: [630, 225], b: [510, 135] },
          { a: [510, 135], b: [450, 225] },
        ],
        points: [
          { at: [450, 225], r: 5, fill: "#000000" },
          { at: [630, 225], r: 5, fill: "#000000" },
          { at: [510, 135], r: 5, fill: "#000000" },
        ],
        labels: [
          { text: "A(0,0)", x: 430, y: 240, bold: false },
          { text: "B(6,0)", x: 650, y: 240, bold: false },
          { text: "C(2,4)", x: 510, y: 115, bold: false },
        ],
      },
      null,
      2
    ),
  },

  // ======================================================
  // TRANSFORMATIONS
  // ======================================================
  {
    id: "trans-reflection",
    name: "Transformations  -  Reflection",
    defaultDescription:
      "Reflect point P(3, -5) over the x-axis and then over the y-axis. Give the final coordinates.",
    promptBuilder: (desc) => `
${JSON_SCHEMA_BLOCK}

Diagram request:
${desc}

Extra constraints:
- Draw axes.
- Show original and reflected points.
`.trim(),
    starterJSON: JSON.stringify(
      {
        canvas: { width: 900, height: 450, bg: "#ffffff" },
        defaults: defaultsBlock(),
        segments: [
          { a: [100, 225], b: [800, 225] },
          { a: [450, 60], b: [450, 390] },
        ],
        points: [
          { at: [540, 325], r: 5, fill: "#000000" },
          { at: [540, 125], r: 5, fill: "#000000" },
          { at: [360, 125], r: 5, fill: "#000000" },
        ],
        labels: [
          { text: "P(3, -5)", x: 580, y: 340, bold: false },
          { text: "P'(3, 5)", x: 580, y: 110, bold: false },
          { text: "P''(-3, 5)", x: 310, y: 110, bold: false },
        ],
      },
      null,
      2
    ),
  },

  {
    id: "trans-rotation",
    name: "Transformations  -  Rotation",
    defaultDescription:
      "Rotate point (4, 1) 90 deg counterclockwise about the origin. Find the image.",
    promptBuilder: (desc) => `
${JSON_SCHEMA_BLOCK}

Diagram request:
${desc}

Extra constraints:
- Draw axes.
- Show original point and rotated image.
`.trim(),
    starterJSON: JSON.stringify(
      {
        canvas: { width: 900, height: 450, bg: "#ffffff" },
        defaults: defaultsBlock(),
        segments: [
          { a: [100, 225], b: [800, 225] },
          { a: [450, 60], b: [450, 390] },
        ],
        points: [
          { at: [610, 180], r: 5, fill: "#000000" },
          { at: [470, 60], r: 5, fill: "#000000" },
        ],
        labels: [
          { text: "(4,1)", x: 635, y: 170, bold: false },
          { text: "(-1,4)", x: 480, y: 45, bold: false },
        ],
      },
      null,
      2
    ),
  },

  {
    id: "trans-dilation",
    name: "Transformations  -  Dilation",
    defaultDescription:
      "Dilate triangle ABC about the origin by scale factor 1.5. If A(2,1), B(4,1), C(2,5), find A', B', C'.",
    promptBuilder: (desc) => `
${JSON_SCHEMA_BLOCK}

Diagram request:
${desc}

Extra constraints:
- Draw axes.
- Show original triangle and dilated image.
`.trim(),
    starterJSON: JSON.stringify(
      {
        canvas: { width: 900, height: 450, bg: "#ffffff" },
        defaults: defaultsBlock(),
        segments: [
          { a: [100, 225], b: [800, 225] },
          { a: [450, 60], b: [450, 390] },
        ],
        polygons: [
          { points: [[510, 200], [570, 200], [510, 80]] },
          { points: [[540, 195], [630, 195], [540, 15]] },
        ],
        labels: [
          { text: "A(2,1)", x: 495, y: 215, bold: false },
          { text: "B(4,1)", x: 585, y: 215, bold: false },
          { text: "C(2,5)", x: 495, y: 60, bold: false },
          { text: "A'", x: 525, y: 210, bold: true },
          { text: "B'", x: 645, y: 210, bold: true },
          { text: "C'", x: 525, y: 25, bold: true },
        ],
      },
      null,
      2
    ),
  },

  // ======================================================
  // AREA / PERIMETER / COMPOSITE
  // ======================================================
  {
    id: "ap-rectangle-perimeter",
    name: "Area/Perimeter  -  Rectangle Missing Width",
    defaultDescription:
      "A rectangle has perimeter 34 cm and length 12 cm. Find the width.",
    promptBuilder: (desc) => `
${JSON_SCHEMA_BLOCK}

Diagram request:
${desc}

Extra constraints:
- Draw one rectangle.
- Label length 12 cm and width as ?.
`.trim(),
    starterJSON: JSON.stringify(
      {
        canvas: { width: 900, height: 450, bg: "#ffffff" },
        defaults: defaultsBlock(),
        rects: [{ x: 250, y: 140, w: 420, h: 180 }],
        labels: [
          { text: "12 cm", x: 460, y: 125, bold: true },
          { text: "12 cm", x: 460, y: 335, bold: true },
          { text: "?", x: 235, y: 230, bold: true },
          { text: "?", x: 685, y: 230, bold: true },
          { text: "P = 34 cm", x: 460, y: 90, bold: false },
        ],
      },
      null,
      2
    ),
  },

  {
    id: "ap-composite-l-shape",
    name: "Area/Perimeter  -  Composite L-Shape",
    defaultDescription:
      "An L-shaped figure is made from a 12x10 rectangle with a 5x4 corner removed. Find area.",
    promptBuilder: (desc) => `
${JSON_SCHEMA_BLOCK}

Diagram request:
${desc}

Extra constraints:
- Draw an L-shape with labeled side lengths.
`.trim(),
    starterJSON: JSON.stringify(
      {
        canvas: { width: 900, height: 450, bg: "#ffffff" },
        defaults: defaultsBlock(),
        polygons: [
          { points: [[260, 120], [620, 120], [620, 260], [470, 260], [470, 340], [260, 340]] },
        ],
        labels: [
          { text: "12", x: 440, y: 105, bold: true },
          { text: "10", x: 635, y: 200, bold: true },
          { text: "5", x: 545, y: 275, bold: true },
          { text: "4", x: 485, y: 310, bold: true },
        ],
      },
      null,
      2
    ),
  },

  {
    id: "ap-triangle-area-algebra",
    name: "Area/Perimeter  -  Triangle Area with Algebra",
    defaultDescription:
      "A triangle has base (x+2) cm and height (2x-1) cm. Its area is 24 cm^2. Solve for x.",
    promptBuilder: (desc) => `
${JSON_SCHEMA_BLOCK}

Diagram request:
${desc}

Extra constraints:
- Draw a triangle with a dashed altitude.
- Label base and height with expressions.
`.trim(),
    starterJSON: JSON.stringify(
      {
        canvas: { width: 900, height: 450, bg: "#ffffff" },
        defaults: defaultsBlock(),
        polygons: [{ points: [[260, 330], [640, 330], [480, 140]] }],
        segments: [
          { a: [480, 140], b: [480, 330], dash: "6 6" },
          { a: [470, 310], b: [490, 310] },
          { a: [490, 310], b: [490, 330] },
        ],
        labels: [
          { text: "x + 2", x: 450, y: 350, bold: true },
          { text: "2x - 1", x: 515, y: 235, bold: true },
          { text: "A = 24 cm^2", x: 680, y: 130, bold: false },
        ],
      },
      null,
      2
    ),
  },
];
