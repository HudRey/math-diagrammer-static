type Diagram = {
  canvas: { width: number; height: number; bg: string };
  defaults: {
    stroke: string;
    strokeWidth: number;
    fill: string;
    fontFamily: string;
    fontSize: number;
    labelColor: string;
  };
  rects: Array<{
    x: number; y: number; w: number; h: number;
    stroke: string; strokeWidth: number; fill: string; rx: number; ry: number;
  }>;
  circles: Array<{
    cx: number; cy: number; r: number;
    stroke: string; strokeWidth: number; fill: string;
  }>;
  ellipses: Array<{
    cx: number; cy: number; rx: number; ry: number;
    stroke: string; strokeWidth: number; fill: string;
  }>;
  polygons: Array<{
    points: number[][];
    stroke: string; strokeWidth: number; fill: string;
  }>;
  segments: Array<{
    a: number[]; b: number[];
    stroke: string; strokeWidth: number;
  }>;
  points: Array<{
    at: number[]; r: number; fill: string; stroke: string; strokeWidth: number;
  }>;
  labels: Array<{
    text: string; x: number; y: number;
    color: string; fontSize: number; bold: boolean;
  }>;
};

type StylePrefs = {
  stroke: string;         // outline
  fill: string;           // shape fill
  labelColor: string;     // annotations color
  labelFontSize: number;  // annotations font size
};

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

const app = $("#app");
app.innerHTML = `
  <div class="layout">
    <div class="panel">
      <div class="title">Math Diagram Renderer</div>
      <div class="sub">Describe your diagram → generate → drag labels → download.</div>

      <label>Diagram description</label>
      <textarea id="desc" placeholder="Example: Draw a rectangle for a perimeter problem. Label top 12 cm, left 7 cm, right 7 cm, bottom x cm."></textarea>

      <details open>
        <summary>Style</summary>
        <div class="sectionBody">
          <div class="row2">
            <div>
              <label>Outline</label>
              <input id="stroke" type="color" value="#000000" />
            </div>
            <div>
              <label>Fill</label>
              <input id="fill" type="color" value="#ffffff" />
            </div>
          </div>

          <div class="row2">
            <div>
              <label>Annotation color</label>
              <input id="labelColor" type="color" value="#000000" />
            </div>
            <div>
              <label>Annotation font size</label>
              <input id="labelFontSize" type="number" min="10" max="64" step="1" value="22" />
            </div>
          </div>

          <button id="applyStyle">Apply style to current diagram</button>
        </div>
      </details>

      <div class="row2">
        <button id="generate">Generate</button>
        <button id="example">Load example</button>
      </div>

      <div id="status" class="status"></div>
      <div id="err" class="err"></div>

      <div class="row2">
        <button id="downloadSvg">Download SVG</button>
        <button id="downloadPng">Download PNG</button>
      </div>

      <div class="hint">
        Drag tip: click and drag any label directly on the diagram preview.
      </div>
    </div>

    <div class="previewWrap">
      <div class="preview">
        <div class="previewTop">
          <div class="previewTitle">Preview</div>
        </div>
        <div id="svgHost" class="svgHost"></div>
      </div>
    </div>
  </div>
`;

const descEl = $("#desc") as HTMLTextAreaElement;
const strokeEl = $("#stroke") as HTMLInputElement;
const fillEl = $("#fill") as HTMLInputElement;
const labelColorEl = $("#labelColor") as HTMLInputElement;
const labelFontSizeEl = $("#labelFontSize") as HTMLInputElement;

const statusEl = $("#status") as HTMLDivElement;
const errEl = $("#err") as HTMLDivElement;
const svgHost = $("#svgHost") as HTMLDivElement;

const btnGenerate = $("#generate") as HTMLButtonElement;
const btnExample = $("#example") as HTMLButtonElement;
const btnApplyStyle = $("#applyStyle") as HTMLButtonElement;
const btnDownloadSvg = $("#downloadSvg") as HTMLButtonElement;
const btnDownloadPng = $("#downloadPng") as HTMLButtonElement;

let currentDiagram: Diagram | null = null;

// ---------- Helpers ----------
function setStatus(msg: string) {
  statusEl.textContent = msg;
}
function setError(msg: string) {
  errEl.textContent = msg;
}
function clearMessages() {
  setStatus("");
  setError("");
}

function getStylePrefs(): StylePrefs {
  return {
    stroke: strokeEl.value,
    fill: fillEl.value,
    labelColor: labelColorEl.value,
    labelFontSize: clampInt(parseInt(labelFontSizeEl.value || "22", 10), 10, 64),
  };
}

function clampInt(n: number, lo: number, hi: number) {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

// Apply style prefs to an existing diagram (client-side overrides)
function applyStyle(diagram: Diagram, prefs: StylePrefs): Diagram {
  const d: Diagram = structuredClone(diagram);

  d.defaults.stroke = prefs.stroke;
  d.defaults.fill = prefs.fill;
  d.defaults.labelColor = prefs.labelColor;
  d.defaults.fontSize = prefs.labelFontSize;

  // Apply stroke/fill to shapes
  d.rects = d.rects.map(r => ({ ...r, stroke: prefs.stroke, fill: prefs.fill }));
  d.circles = d.circles.map(c => ({ ...c, stroke: prefs.stroke, fill: prefs.fill }));
  d.ellipses = d.ellipses.map(e => ({ ...e, stroke: prefs.stroke, fill: prefs.fill }));
  d.polygons = d.polygons.map(p => ({ ...p, stroke: prefs.stroke, fill: prefs.fill }));
  d.segments = d.segments.map(s => ({ ...s, stroke: prefs.stroke }));

  // Points: keep point fill/stroke sensible (outline color used for stroke)
  d.points = d.points.map(pt => ({
    ...pt,
    stroke: prefs.stroke,
    fill: prefs.stroke, // points usually look better filled
  }));

  // Labels: color + font size
  d.labels = d.labels.map(l => ({
    ...l,
    color: prefs.labelColor,
    fontSize: prefs.labelFontSize,
  }));

  return d;
}

// ---------- Rendering ----------
function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderSVG(diagram: Diagram): string {
  const { width, height, bg } = diagram.canvas;

  const parts: string[] = [];
  parts.push(
    `<svg id="diagramSvg" xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
  );
  parts.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="${esc(bg)}" />`);

  // rects
  for (const r of diagram.rects) {
    parts.push(
      `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="${r.rx}" ry="${r.ry}" ` +
      `fill="${esc(r.fill)}" stroke="${esc(r.stroke)}" stroke-width="${r.strokeWidth}" />`
    );
  }

  // circles
  for (const c of diagram.circles) {
    parts.push(
      `<circle cx="${c.cx}" cy="${c.cy}" r="${c.r}" fill="${esc(c.fill)}" stroke="${esc(c.stroke)}" stroke-width="${c.strokeWidth}" />`
    );
  }

  // ellipses
  for (const e of diagram.ellipses) {
    parts.push(
      `<ellipse cx="${e.cx}" cy="${e.cy}" rx="${e.rx}" ry="${e.ry}" fill="${esc(e.fill)}" stroke="${esc(e.stroke)}" stroke-width="${e.strokeWidth}" />`
    );
  }

  // polygons
  for (const p of diagram.polygons) {
    const pts = p.points.map(([x, y]) => `${x},${y}`).join(" ");
    parts.push(
      `<polygon points="${pts}" fill="${esc(p.fill)}" stroke="${esc(p.stroke)}" stroke-width="${p.strokeWidth}" />`
    );
  }

  // segments
  for (const s of diagram.segments) {
    parts.push(
      `<line x1="${s.a[0]}" y1="${s.a[1]}" x2="${s.b[0]}" y2="${s.b[1]}" ` +
      `stroke="${esc(s.stroke)}" stroke-width="${s.strokeWidth}" stroke-linecap="round" />`
    );
  }

  // points
  for (const pt of diagram.points) {
    parts.push(
      `<circle cx="${pt.at[0]}" cy="${pt.at[1]}" r="${pt.r}" fill="${esc(pt.fill)}" stroke="${esc(pt.stroke)}" stroke-width="${pt.strokeWidth}" />`
    );
  }

  // labels (draggable)
  for (let i = 0; i < diagram.labels.length; i++) {
    const l = diagram.labels[i];
    const weight = l.bold ? 700 : 400;
    parts.push(
      `<text data-label-idx="${i}" x="${l.x}" y="${l.y}" fill="${esc(l.color)}" font-size="${l.fontSize}" ` +
      `font-family="${esc(diagram.defaults.fontFamily)}" font-weight="${weight}" style="cursor: move; user-select: none;">${esc(l.text)}</text>`
    );
  }

  parts.push(`</svg>`);
  return parts.join("");
}

function mountDiagram(diagram: Diagram) {
  currentDiagram = diagram;
  svgHost.innerHTML = renderSVG(diagram);
  hookDragHandlers();
}

function hookDragHandlers() {
  const svg = document.getElementById("diagramSvg") as SVGSVGElement | null;
  if (!svg || !currentDiagram) return;

  let draggingIdx: number | null = null;
  let offsetX = 0;
  let offsetY = 0;

  const svgPoint = (clientX: number, clientY: number) => {
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: clientX, y: clientY };
    const inv = ctm.inverse();
    const loc = pt.matrixTransform(inv);
    return { x: loc.x, y: loc.y };
  };

  svg.addEventListener("pointerdown", (e) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    const idxStr = target.getAttribute("data-label-idx");
    if (!idxStr) return;

    const idx = parseInt(idxStr, 10);
    if (!Number.isFinite(idx) || !currentDiagram) return;

    draggingIdx = idx;

    const p = svgPoint(e.clientX, e.clientY);
    const label = currentDiagram.labels[idx];
    offsetX = label.x - p.x;
    offsetY = label.y - p.y;

    (target as any).setPointerCapture?.(e.pointerId);
  });

  svg.addEventListener("pointermove", (e) => {
    if (draggingIdx === null || !currentDiagram) return;

    const p = svgPoint(e.clientX, e.clientY);
    const newX = p.x + offsetX;
    const newY = p.y + offsetY;

    // Update model
    currentDiagram.labels[draggingIdx].x = Math.round(newX);
    currentDiagram.labels[draggingIdx].y = Math.round(newY);

    // Update DOM directly (fast)
    const textEl = svg.querySelector(`text[data-label-idx="${draggingIdx}"]`) as SVGTextElement | null;
    if (textEl) {
      textEl.setAttribute("x", String(currentDiagram.labels[draggingIdx].x));
      textEl.setAttribute("y", String(currentDiagram.labels[draggingIdx].y));
    }
  });

  const endDrag = () => {
    draggingIdx = null;
  };
  svg.addEventListener("pointerup", endDrag);
  svg.addEventListener("pointercancel", endDrag);
}

// ---------- API ----------
async function generateFromDescription(description: string): Promise<Diagram> {
  const resp = await fetch("/api/diagram", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ description }),
  });

  const data = await resp.json().catch(() => null);

  if (!resp.ok) {
    const msg = data?.error ? String(data.error) : `Request failed (${resp.status})`;
    throw new Error(msg);
  }

  if (!data?.diagram) throw new Error("No diagram returned from API.");
  return data.diagram as Diagram;
}

// ---------- Downloads ----------
function downloadText(filename: string, text: string, mime = "text/plain") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadPNGFromSVG(svgString: string, filename: string) {
  const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    // Use SVG's explicit size
    const svgEl = document.getElementById("diagramSvg") as SVGSVGElement | null;
    const w = svgEl ? Number(svgEl.getAttribute("width")) : 900;
    const h = svgEl ? Number(svgEl.getAttribute("height")) : 450;

    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(img, 0, 0);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const pngUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = pngUrl;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(pngUrl);
    }, "image/png");

    URL.revokeObjectURL(url);
  };

  img.onerror = () => {
    URL.revokeObjectURL(url);
    throw new Error("PNG export failed to render image.");
  };

  img.src = url;
}

// ---------- UI wiring ----------
btnExample.addEventListener("click", () => {
  clearMessages();
  descEl.value = "Draw a rectangle for a perimeter problem. Label top = 12 cm, left = 7 cm, right = 7 cm, bottom = x cm.";
  setStatus("Example loaded. Click Generate.");
});

btnApplyStyle.addEventListener("click", () => {
  clearMessages();
  if (!currentDiagram) {
    setError("No diagram yet. Click Generate first.");
    return;
  }
  const styled = applyStyle(currentDiagram, getStylePrefs());
  mountDiagram(styled);
  setStatus("Style applied.");
});

btnGenerate.addEventListener("click", async () => {
  clearMessages();
  const description = descEl.value.trim();
  if (!description) {
    setError("Type a diagram description first.");
    return;
  }

  btnGenerate.disabled = true;
  setStatus("Generating…");

  try {
    const raw = await generateFromDescription(description);
    const styled = applyStyle(raw, getStylePrefs());
    mountDiagram(styled);
    setStatus("Generated. Drag labels if needed, then download.");
  } catch (e: any) {
    setError(e?.message ?? String(e));
    setStatus("");
  } finally {
    btnGenerate.disabled = false;
  }
});

btnDownloadSvg.addEventListener("click", () => {
  clearMessages();
  if (!currentDiagram) {
    setError("No diagram to download yet.");
    return;
  }
  const svgString = renderSVG(currentDiagram);
  downloadText("diagram.svg", svgString, "image/svg+xml");
  setStatus("SVG downloaded.");
});

btnDownloadPng.addEventListener("click", () => {
  clearMessages();
  if (!currentDiagram) {
    setError("No diagram to download yet.");
    return;
  }
  const svgString = renderSVG(currentDiagram);
  downloadPNGFromSVG(svgString, "diagram.png");
  setStatus("PNG downloaded.");
});
