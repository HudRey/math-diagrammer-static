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
- labels should be readable and near their intended features (vertices, sides, radii, heights, etc.)
- do not include side lengths unless the prompt asks
`.trim();

// --- helpers for “similar triangles” template (dynamic letters + correspondence) ---
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

  return { pairs: [`${a1}↔${a2}`, `${b1}↔${b2}`, `${c1}↔${c2}`] };
}

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

export const templates = [
  // ---- Similar triangles (dynamic letters) ----
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
        defaults: defaultsBlock(),
        polygons: [
          {
            points: [
              [160, 360],
              [120, 140],
              [300, 270],
            ],
          },
          {
            points: [
              [560, 390],
              [500, 90],
              [820, 270],
            ],
          },
        ],
        labels: [
          { text: "A", x: 160, y: 385, bold: true },
          { text: "B", x: 310, y: 270, bold: true },
          { text: "C", x: 110, y: 135, bold: true },

          { text: "D", x: 560, y: 415, bold: true },
          { text: "E", x: 835, y: 270, bold: true },
          { text: "F", x: 490, y: 85, bold: true },
        ],
      },
      null,
      2
    ),
  },

  // ---- Similar rectangles (scale factor) ----
  {
    id: "similar-rectangles",
    name: "Similar Rectangles (scale factor)",
    defaultDescription:
      "Draw two similar rectangles. The second should be a scaled-up version. Label them R1 and R2 (no side lengths).",
    promptBuilder: (desc: string) => `
${JSON_SCHEMA_BLOCK}

Diagram request:
${desc}

Extra constraints:
- Use rects for the rectangles.
- Put the smaller rectangle on the left, larger on the right.
- Labels should not overlap the rectangles.
`.trim(),
    starterJSON: JSON.stringify(
      {
        canvas: { width: 900, height: 450, bg: "#ffffff" },
        defaults: defaultsBlock(),
        rects: [
          { x: 140, y: 140, w: 220, h: 140 },
          { x: 520, y: 110, w: 300, h: 190 },
        ],
        labels: [
          { text: "R1", x: 250, y: 120, bold: true },
          { text: "R2", x: 670, y: 90, bold: true },
        ],
      },
      null,
      2
    ),
  },

  // ---- Rectangle / Square (area & perimeter) ----
  {
    id: "rectangle-area-perimeter",
    name: "Rectangle / Square (area & perimeter)",
    defaultDescription:
      "Draw a rectangle ABCD (or a square) suitable for area/perimeter problems. Label vertices only.",
    promptBuilder: (desc: string) => `
${JSON_SCHEMA_BLOCK}

Diagram request:
${desc}

Extra constraints:
- Use a rect (not a polygon) for clean edges.
- Label vertices at corners if named.
`.trim(),
    starterJSON: JSON.stringify(
      {
        canvas: { width: 900, height: 450, bg: "#ffffff" },
        defaults: defaultsBlock(),
        rects: [{ x: 260, y: 120, w: 380, h: 220 }],
        labels: [
          { text: "A", x: 260, y: 110, bold: true },
          { text: "B", x: 640, y: 110, bold: true },
          { text: "C", x: 640, y: 350, bold: true },
          { text: "D", x: 260, y: 350, bold: true },
        ],
      },
      null,
      2
    ),
  },

  // ---- Right triangle (area, Pythagorean, trig) ----
  {
    id: "right-triangle",
    name: "Right Triangle",
    defaultDescription:
      "Draw a right triangle with a clear right angle marker at one vertex. Label vertices A, B, C.",
    promptBuilder: (desc: string) => `
${JSON_SCHEMA_BLOCK}

Diagram request:
${desc}

Extra constraints:
- Use one polygon for the triangle.
- Add a small right-angle marker using segments near the right angle vertex.
`.trim(),
    starterJSON: JSON.stringify(
      {
        canvas: { width: 900, height: 450, bg: "#ffffff" },
        defaults: defaultsBlock(),
        polygons: [
          {
            points: [
              [260, 340],
              [260, 140],
              [620, 340],
            ],
          },
        ],
        // right angle marker at A = (260,340)? Actually the right angle is at (260,340) if legs go vertical + horizontal.
        // We'll place marker near that corner.
        segments: [
          { a: [275, 340], b: [275, 325] },
          { a: [275, 325], b: [290, 325] },
        ],
        labels: [
          { text: "A", x: 245, y: 350, bold: true },
          { text: "B", x: 245, y: 130, bold: true },
          { text: "C", x: 635, y: 350, bold: true },
        ],
      },
      null,
      2
    ),
  },

  // ---- Parallelogram ----
  {
    id: "parallelogram",
    name: "Parallelogram",
    defaultDescription:
      "Draw a parallelogram labeled ABCD suitable for area problems (base/height). Label vertices only.",
    promptBuilder: (desc: string) => `
${JSON_SCHEMA_BLOCK}

Diagram request:
${desc}

Extra constraints:
- Use one polygon.
- Keep it centered and clean.
`.trim(),
    starterJSON: JSON.stringify(
      {
        canvas: { width: 900, height: 450, bg: "#ffffff" },
        defaults: defaultsBlock(),
        polygons: [
          {
            points: [
              [260, 320],
              [380, 150],
              [690, 150],
              [570, 320],
            ],
          },
        ],
        labels: [
          { text: "A", x: 250, y: 335, bold: true },
          { text: "B", x: 370, y: 135, bold: true },
          { text: "C", x: 700, y: 135, bold: true },
          { text: "D", x: 580, y: 335, bold: true },
        ],
      },
      null,
      2
    ),
  },

  // ---- Trapezoid ----
  {
    id: "trapezoid",
    name: "Trapezoid",
    defaultDescription:
      "Draw a trapezoid labeled ABCD suitable for area problems (bases and height). Label vertices only.",
    promptBuilder: (desc: string) => `
${JSON_SCHEMA_BLOCK}

Diagram request:
${desc}

Extra constraints:
- Use one polygon.
- Make the top base shorter than the bottom base.
`.trim(),
    starterJSON: JSON.stringify(
      {
        canvas: { width: 900, height: 450, bg: "#ffffff" },
        defaults: defaultsBlock(),
        polygons: [
          {
            points: [
              [260, 330],
              [360, 150],
              [620, 150],
              [720, 330],
            ],
          },
        ],
        labels: [
          { text: "A", x: 250, y: 345, bold: true },
          { text: "B", x: 350, y: 135, bold: true },
          { text: "C", x: 630, y: 135, bold: true },
          { text: "D", x: 730, y: 345, bold: true },
        ],
      },
      null,
      2
    ),
  },

  // ---- Circle (radius/diameter/circumference/area) ----
  {
    id: "circle",
    name: "Circle (radius/diameter)",
    defaultDescription:
      "Draw a circle with center O. Include one radius segment and label O and a point A on the circle.",
    promptBuilder: (desc: string) => `
${JSON_SCHEMA_BLOCK}

Diagram request:
${desc}

Extra constraints:
- Use a circle primitive.
- Add a radius segment from center to a point on the circle.
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
          { text: "A", x: 610, y: 225, bold: true },
        ],
      },
      null,
      2
    ),
  },

  // ---- Composite L-shape (area of composite figures) ----
  {
    id: "composite-l-shape",
    name: "Composite L-Shape",
    defaultDescription:
      "Draw an L-shaped composite figure (two rectangles joined). Label key corner points.",
    promptBuilder: (desc: string) => `
${JSON_SCHEMA_BLOCK}

Diagram request:
${desc}

Extra constraints:
- Use polygons OR rects (either is fine) but keep edges axis-aligned.
- Leave space around it for labels.
`.trim(),
    starterJSON: JSON.stringify(
      {
        canvas: { width: 900, height: 450, bg: "#ffffff" },
        defaults: defaultsBlock(),
        polygons: [
          {
            points: [
              [250, 120],
              [620, 120],
              [620, 200],
              [430, 200],
              [430, 340],
              [250, 340],
            ],
          },
        ],
        labels: [
          { text: "A", x: 240, y: 110, bold: true },
          { text: "B", x: 630, y: 110, bold: true },
          { text: "C", x: 630, y: 210, bold: true },
          { text: "D", x: 420, y: 210, bold: true },
          { text: "E", x: 420, y: 350, bold: true },
          { text: "F", x: 240, y: 350, bold: true },
        ],
      },
      null,
      2
    ),
  },

  // ---- Rectangular prism (surface area/volume) ----
  {
    id: "rectangular-prism",
    name: "Rectangular Prism (SA/Volume)",
    defaultDescription:
      "Draw a rectangular prism in simple 2D perspective (no shading). Label key vertices or faces if needed.",
    promptBuilder: (desc: string) => `
${JSON_SCHEMA_BLOCK}

Diagram request:
${desc}

Extra constraints:
- Use polygons + segments to show a clean prism.
- Keep it centered and avoid clutter.
`.trim(),
    starterJSON: JSON.stringify(
      {
        canvas: { width: 900, height: 450, bg: "#ffffff" },
        defaults: defaultsBlock(),
        // front face rectangle corners
        polygons: [
          {
            points: [
              [280, 150],
              [560, 150],
              [560, 330],
              [280, 330],
            ],
          },
          // top face
          {
            points: [
              [280, 150],
              [360, 90],
              [640, 90],
              [560, 150],
            ],
          },
          // side face
          {
            points: [
              [560, 150],
              [640, 90],
              [640, 270],
              [560, 330],
            ],
          },
        ],
        labels: [
          { text: "Rectangular Prism", x: 450, y: 50, bold: true },
        ],
      },
      null,
      2
    ),
  },

  // ---- Triangular prism (surface area/volume) ----
  {
    id: "triangular-prism",
    name: "Triangular Prism (SA/Volume)",
    defaultDescription:
      "Draw a triangular prism in simple 2D perspective. Label the triangular base vertices.",
    promptBuilder: (desc: string) => `
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
          // front triangle
          { points: [[300, 320], [260, 160], [420, 220]] },
          // back triangle (offset)
          { points: [[470, 300], [430, 140], [590, 200]] },
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

  // ---- Cylinder (surface area/volume) ----
  {
    id: "cylinder",
    name: "Cylinder (SA/Volume)",
    defaultDescription:
      "Draw a cylinder (top ellipse + side walls + bottom ellipse hint). Label centerline if needed.",
    promptBuilder: (desc: string) => `
${JSON_SCHEMA_BLOCK}

Diagram request:
${desc}

Extra constraints:
- Use ellipses + segments.
- Make the top ellipse visible, and show the bottom ellipse as a partial hint (can be a full ellipse with lighter stroke or dashed via segments if you prefer).
`.trim(),
    starterJSON: JSON.stringify(
      {
        canvas: { width: 900, height: 450, bg: "#ffffff" },
        defaults: defaultsBlock(),
        // top ellipse
        ellipses: [
          { cx: 450, cy: 140, rx: 160, ry: 45, fill: "none" },
          // bottom ellipse (same size)
          { cx: 450, cy: 320, rx: 160, ry: 45, fill: "none" },
        ],
        segments: [
          { a: [290, 140], b: [290, 320] },
          { a: [610, 140], b: [610, 320] },
        ],
        labels: [{ text: "Cylinder", x: 450, y: 50, bold: true }],
      },
      null,
      2
    ),
  },

  // ---- Simple segments template (kept from before) ----
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
] satisfies {
  id: string;
  name: string;
  defaultDescription: string;
  promptBuilder: (d: string) => string;
  starterJSON: string;
}[];
