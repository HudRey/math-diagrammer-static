import "./style.css";
import { renderDiagramSVG, validateSpec, type DiagramSpec } from "./renderDiagram";
import { PRODUCERS } from "./modes/all";
import { templates, type Template } from "./templates";

type StylePrefs = {
  stroke: string; // shape outline
  fill: string; // shape fill
  labelColor: string; // annotations color
  labelFontSize: number; // annotations font size
};

// Strict selector helper (prevents silent null bugs)
const $ = <T extends HTMLElement>(sel: string) => {
  const el = document.querySelector(sel);
  if (!el) throw new Error(`Missing element: ${sel}`);
  return el as T;
};

const app = $("#app");
app.innerHTML = `
  <div class="appShell">
    <header class="topbar">
      <div class="topbarLeft">
        <div class="brand">Math Diagrammer</div>
        <div class="brandSub">Generate -> drag -> download</div>
      </div>

      <nav class="topbarNav">
        <a class="topbarLink" href="#" id="linkTemplates">Templates</a>
        <a class="topbarLink" href="#" id="linkDocs">Docs</a>
        <a class="topbarLink" href="#" id="linkAbout">About</a>
        <a class="topbarCta" href="https://ko-fi.com/ahudson" target="_blank" rel="noopener noreferrer" id="linkDonate">Support this project</a>
      </nav>
    </header>

    <div class="layout">
      <div class="panel">
        <div class="title">Math Diagram Renderer</div>
        <div class="sub">Describe your diagram -> generate -> drag -> download.</div>

        <label>Diagram description
          <textarea id="desc" placeholder="Example: Draw a rectangle for a perimeter problem. Label top = 12 cm, left = 7 cm, right = 7 cm, bottom = x cm."></textarea>
        </label>

        <details id="templatesPanel">
          <summary>Templates</summary>
          <div class="sectionBody">
            <label>Search templates
              <input id="templateSearch" type="text" placeholder="Search by name, id, or description" />
            </label>
            <label>Template list
              <select id="templateList" size="8"></select>
            </label>
            <div class="row2">
              <button id="useTemplate">Use prompt</button>
              <button id="renderTemplate">Render starter</button>
            </div>
            <div class="row2">
              <button id="clearTemplate">Clear template</button>
              <div></div>
            </div>
            <div id="templateMeta" class="hint"></div>
          </div>
        </details>

        <label>Mode
          <select id="mode">
            <option value="diagram2d" selected>2D Diagram</option>
            <option value="graph">Graph (Cartesian Plane)</option>
           <option value="scene3d">3D (Coming soon)</option>
          </select>
        </label>

        <div class="row2">
          <button id="generate">Generate</button>
          <button id="example">Load example</button>
        </div>

        <div id="status" class="status"></div>
        <div id="err" class="err"></div>

        <details>
          <summary>Style</summary>
          <div class="sectionBody">
            <div class="row2">
              <div>
                <label>Canvas width</label>
                <input id="canvasWidth" type="number" min="200" max="4000" step="10" value="900" />
              </div>
              <div>
                <label>Canvas height</label>
                <input id="canvasHeight" type="number" min="200" max="4000" step="10" value="450" />
              </div>
            </div>

            <div class="row2">
              <button id="applyCanvas">Apply canvas</button>
              <button id="resetView">Reset view</button>
            </div>

            <div class="row2">
              <button id="resetDiagram">Reset diagram</button>
              <div></div>
            </div>

            <label style="display:flex; align-items:center; gap:8px; margin-top:8px;">
              <input id="enableDrag" type="checkbox" checked />
                Enable drag on diagram
            </label>

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
          <button id="downloadSvg">Download SVG</button>
          <button id="downloadPng">Download PNG</button>
        </div>

        <details class="debug">
          <summary>Debug</summary>
          <div class="debugBody">
            <div class="debugLabel">Rendered (normalized) DiagramSpec</div>
            <pre id="debugJson" class="debugJson"></pre>
            <div class="debugLabel">Raw server response</div>
            <pre id="debugRaw" class="debugJson"></pre>
          </div>
        </details>
      </div>

      <div class="stage">
        <div id="svgHost" class="svgHost"></div>
      </div>
    </div>
  </div>
`;


// Debug sanity checks (these execute as real JS, not HTML)
console.log("app injected:", !!document.querySelector(".layout"));
console.log("debugJson exists:", !!document.getElementById("debugJson"));
console.log("debugRaw exists:", !!document.getElementById("debugRaw"));

const descEl = $("#desc") as HTMLTextAreaElement;
const statusEl = $("#status") as HTMLDivElement;
const errEl = $("#err") as HTMLDivElement;
const svgHost = $("#svgHost") as HTMLDivElement;

const debugJsonEl = document.getElementById("debugJson") as HTMLPreElement | null;
const debugRawEl = document.getElementById("debugRaw") as HTMLPreElement | null;

const btnGenerate = $("#generate") as HTMLButtonElement;
const btnExample = $("#example") as HTMLButtonElement;
const btnApplyStyle = $("#applyStyle") as HTMLButtonElement;
const btnDownloadSvg = $("#downloadSvg") as HTMLButtonElement;
const btnDownloadPng = $("#downloadPng") as HTMLButtonElement;
const templateSearchEl = $("#templateSearch") as HTMLInputElement;
const templateListEl = $("#templateList") as HTMLSelectElement;
const templateMetaEl = $("#templateMeta") as HTMLDivElement;
const btnUseTemplate = $("#useTemplate") as HTMLButtonElement;
const btnRenderTemplate = $("#renderTemplate") as HTMLButtonElement;
const btnClearTemplate = $("#clearTemplate") as HTMLButtonElement;

// NEW buttons
const btnApplyCanvas = $("#applyCanvas") as HTMLButtonElement;
const btnResetView = $("#resetView") as HTMLButtonElement;
const btnResetDiagram = $("#resetDiagram") as HTMLButtonElement;

// Canvas inputs
const canvasWidthEl = $("#canvasWidth") as HTMLInputElement;
const canvasHeightEl = $("#canvasHeight") as HTMLInputElement;

let currentDiagram: DiagramSpec | null = null;
// NEW: snapshot of last generated (or last example) diagram for "Reset diagram"
let baseDiagram: DiagramSpec | null = null;
let activeTemplateId: string | null = null;
const selectedEntities = new Set<string>();
const selectedLabels = new Set<number>();
const dragToggle = document.getElementById("enableDrag") as HTMLInputElement | null;
dragToggle?.addEventListener("change", () => {
  if (!currentDiagram) return;
  mountDiagram(currentDiagram); // re-mount to add/remove drag handlers
});

// ---------- UI helpers ----------
function setStatus(msg: string) {
  statusEl.textContent = msg;
}
function setError(msg: string) {
  errEl.textContent = msg;
}
function clearMessages() {
  statusEl.textContent = "";
  errEl.textContent = "";
}

function setTemplateMeta(t: Template | null) {
  if (!templateMetaEl) return;
  if (!t) {
    templateMetaEl.textContent = "No template selected.";
    return;
  }
  templateMetaEl.textContent = `${t.id}  -  ${t.defaultDescription}`;
}

function setActiveTemplate(id: string | null) {
  activeTemplateId = id;
  const t = id ? templates.find((tpl) => tpl.id === id) ?? null : null;
  setTemplateMeta(t);
}

function ensureDiagram2dMode() {
  if (currentMode === "diagram2d") return;
  modeEl.value = "diagram2d";
  applyMode("diagram2d");
}

function getStylePrefs(): StylePrefs {
  const stroke = ($("#stroke") as HTMLInputElement).value;
  const fill = ($("#fill") as HTMLInputElement).value;
  const labelColor = ($("#labelColor") as HTMLInputElement).value;
  const labelFontSize = Number(($("#labelFontSize") as HTMLInputElement).value || "22");

  return {
    stroke,
    fill,
    labelColor,
    labelFontSize: Number.isFinite(labelFontSize) ? labelFontSize : 22,
  };
}

function applyStyle(diagram: DiagramSpec, prefs: StylePrefs): DiagramSpec {
  const d: DiagramSpec = structuredClone(diagram);

  d.defaults = d.defaults ?? {
    stroke: "#000000",
    strokeWidth: 3,
    fill: "#ffffff",
    fontFamily: "Arial",
    fontSize: 22,
    labelColor: "#000000",
  };

  d.defaults.stroke = prefs.stroke;
  d.defaults.fill = prefs.fill;
  d.defaults.labelColor = prefs.labelColor;
  d.defaults.fontSize = prefs.labelFontSize;

  d.rects = (d.rects ?? []).map((r) => ({ ...r, stroke: prefs.stroke, fill: prefs.fill }));
  d.circles = (d.circles ?? []).map((c) => ({ ...c, stroke: prefs.stroke, fill: prefs.fill }));
  d.ellipses = (d.ellipses ?? []).map((e) => ({ ...e, stroke: prefs.stroke, fill: prefs.fill }));
  d.polygons = (d.polygons ?? []).map((p) => ({ ...p, stroke: prefs.stroke, fill: prefs.fill }));
  d.segments = (d.segments ?? []).map((seg) => ({ ...seg, stroke: prefs.stroke }));

  d.labels = (d.labels ?? []).map((l) => ({
    ...l,
    color: prefs.labelColor,
    fontSize: prefs.labelFontSize,
  }));

  return d;
}

// ---------- Rendering ----------
function syncCanvasInputs(diagram: DiagramSpec) {
  canvasWidthEl.value = String(diagram.canvas.width ?? 900);
  canvasHeightEl.value = String(diagram.canvas.height ?? 450);
}

function mountDiagram(diagram: DiagramSpec, { setBase = false }: { setBase?: boolean } = {}) {
  console.log("mountDiagram called");

  const safe = validateSpec(diagram);
  currentDiagram = safe;

  if (setBase) {
    // keep a pristine snapshot for reset (no token spend later)
    baseDiagram = structuredClone(safe);
  }

  syncCanvasInputs(safe);

  if (debugJsonEl) debugJsonEl.textContent = JSON.stringify(safe, null, 2);

  const svgString = renderDiagramSVG(safe);
  svgHost.innerHTML = svgString;
  selectedEntities.clear();
  selectedLabels.clear();

  // Drag behavior:
  // - Default OFF in graph mode (dragging line segments is confusing)
  // - Default ON in diagram2d mode
  // - If checkbox exists, respect it
  const dragToggle = document.getElementById("enableDrag") as HTMLInputElement | null;

  const defaultDrag = currentMode !== "graph"; // graph: false, diagram2d: true
  const dragEnabled = dragToggle ? dragToggle.checked : defaultDrag;

  if (dragEnabled) {
    hookDragHandlers();
  }
}


function downloadText(filename: string, data: string, mime: string) {
  const blob = new Blob([data], { type: mime });
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
    const w = currentDiagram?.canvas?.width ?? 900;
    const h = currentDiagram?.canvas?.height ?? 450;

    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      URL.revokeObjectURL(url);
      setError("Canvas context unavailable.");
      return;
    }

    ctx.drawImage(img, 0, 0);

    canvas.toBlob((blob) => {
      if (!blob) {
        setError("Failed to create PNG blob.");
        URL.revokeObjectURL(url);
        return;
      }
      const a = document.createElement("a");
      const pngUrl = URL.createObjectURL(blob);
      a.href = pngUrl;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(pngUrl);
      URL.revokeObjectURL(url);
    }, "image/png");
  };

  img.onerror = () => {
    URL.revokeObjectURL(url);
    setError("Failed to render image.");
  };

  img.src = url;
}

// ---------- View controls (NEW) ----------
function resetViewRecenter() {
  const svg = document.getElementById("diagramSvg") as SVGSVGElement | null;
  if (!svg) return;

  const world = svg.querySelector("#world") as SVGGElement | null;
  if (!world) return;

  const bbox = world.getBBox();
  if (bbox.width <= 0 || bbox.height <= 0) {
    world.setAttribute("transform", "translate(0 0) scale(1)");
    return;
  }

  const W = svg.viewBox.baseVal.width || svg.clientWidth || (currentDiagram?.canvas.width ?? 900);
  const H = svg.viewBox.baseVal.height || svg.clientHeight || (currentDiagram?.canvas.height ?? 450);

  // translate only (keep scale = 1)
  const cx = bbox.x + bbox.width / 2;
  const cy = bbox.y + bbox.height / 2;

  const tx = W / 2 - cx;
  const ty = H / 2 - cy;

  world.setAttribute("transform", `translate(${tx} ${ty}) scale(1)`);
}

btnResetView.addEventListener("click", () => {
  clearMessages();
  if (!currentDiagram) {
    setError("No diagram yet. Generate first.");
    return;
  }
  resetViewRecenter();
  setStatus("View recentered.");
});

btnApplyCanvas.addEventListener("click", () => {
  clearMessages();
  if (!currentDiagram) {
    setError("No diagram yet. Generate first.");
    return;
  }

  const w = Number(canvasWidthEl.value);
  const h = Number(canvasHeightEl.value);

  if (!Number.isFinite(w) || !Number.isFinite(h)) {
    setError("Canvas width/height must be valid numbers.");
    return;
  }

  const W = Math.max(200, Math.min(4000, Math.round(w)));
  const H = Math.max(200, Math.min(4000, Math.round(h)));

  const updated = structuredClone(currentDiagram);
  updated.canvas.width = W;
  updated.canvas.height = H;

  // re-render locally (no token spend)
  mountDiagram(updated);
  resetViewRecenter();
  setStatus(`Canvas resized to ${W}x${H}.`);
});

btnResetDiagram.addEventListener("click", () => {
  clearMessages();
  if (!baseDiagram) {
    setError("Nothing to reset to yet. Generate a diagram first.");
    return;
  }
  mountDiagram(structuredClone(baseDiagram));
  resetViewRecenter();
  setStatus("Diagram reset (no tokens spent).");
});

// ---------- Dragging labels + grouped entities ----------
function hookDragHandlers() {
  const svgOld = document.getElementById("diagramSvg") as SVGSVGElement | null;
  if (!svgOld || !currentDiagram) return;

  // Clear previous handlers by cloning node (cheap and effective)
  const svg = svgOld.cloneNode(true) as SVGSVGElement;
  svgOld.replaceWith(svg);

  // Prevent browser panning/selection during pointer drags
  svg.style.touchAction = "none";

  const W = currentDiagram.canvas.width ?? 900;
  const H = currentDiagram.canvas.height ?? 450;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number) => Math.round(v * 100) / 100;
const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

  // NEW: clamp the translation so ALL points remain in-bounds (prevents "squish")
  const clampDeltaForPoints = (pts: [number, number][], dx: number, dy: number) => {
    let minDx = -Infinity;
    let maxDx = Infinity;
    let minDy = -Infinity;
    let maxDy = Infinity;

    for (const [x, y] of pts) {
      minDx = Math.max(minDx, -x);
      maxDx = Math.min(maxDx, W - x);
      minDy = Math.max(minDy, -y);
      maxDy = Math.min(maxDy, H - y);
    }

    return {
      dx: clamp(dx, minDx, maxDx),
      dy: clamp(dy, minDy, maxDy),
    };
  };

// Grab world group (your renderer should wrap shapes in <g id="world">...</g>)
const world = (svg.querySelector("#world") as SVGGElement | null) ?? svg;

// ---- coordinate helper (IMPORTANT: use WORLD CTM) ----
const svgPoint = (clientX: number, clientY: number) => {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;

  const ctm = world.getScreenCTM(); // <-- key change
  if (!ctm) return { x: clientX, y: clientY };

  const p = pt.matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
};


  // Endpoint <-> point matching tolerance
  const ENDPOINT_EPS = 0.75;
  const samePt = (a: [number, number], b: [number, number]) =>
    Math.abs(a[0] - b[0]) <= ENDPOINT_EPS && Math.abs(a[1] - b[1]) <= ENDPOINT_EPS;

  // Vertex label association threshold
  const VERTEX_LABEL_EPS = 26; // px distance from vertex counts as that vertex label
  const nearestVertexIndex = (label: { x: number; y: number }, verts: [number, number][]) => {
    let bestI = -1;
    let bestD2 = Infinity;
    for (let i = 0; i < verts.length; i++) {
      const [vx, vy] = verts[i];
      const dx = label.x - vx;
      const dy = label.y - vy;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        bestI = i;
      }
    }
    if (bestI < 0) return -1;
    return Math.sqrt(bestD2) <= VERTEX_LABEL_EPS ? bestI : -1;
  };

  type EntityKind = "segment" | "polygon" | "rect" | "circle" | "ellipse" | "point";

  type BBox = { minX: number; minY: number; maxX: number; maxY: number };
  const entityKey = (kind: EntityKind, idx: number) => `${kind}:${idx}`;
  const getEntityGroup = (kind: EntityKind, idx: number) =>
    svg.querySelector(`g[data-entity="${kind}"][data-index="${idx}"]`) as SVGGElement | null;
  const getEntityElement = (kind: EntityKind, idx: number) =>
    (getEntityGroup(kind, idx)?.firstElementChild as SVGElement | null);
  const getLabelElement = (idx: number) =>
    svg.querySelector(`text[data-label-index="${idx}"]`) as SVGTextElement | null;

  const clearSelection = () => {
    for (const key of selectedEntities) {
      const [k, i] = key.split(":");
      const kind = k as EntityKind;
      const idx = Number(i);
      getEntityGroup(kind, idx)?.classList.remove("selected");
    }
    for (const idx of selectedLabels) {
      getLabelElement(idx)?.classList.remove("selected");
    }
    selectedEntities.clear();
    selectedLabels.clear();
  };

  const selectEntity = (kind: EntityKind, idx: number) => {
    const key = entityKey(kind, idx);
    if (!selectedEntities.has(key)) {
      selectedEntities.add(key);
      getEntityGroup(kind, idx)?.classList.add("selected");
    }
  };

  const deselectEntity = (kind: EntityKind, idx: number) => {
    const key = entityKey(kind, idx);
    if (selectedEntities.delete(key)) {
      getEntityGroup(kind, idx)?.classList.remove("selected");
    }
  };

  const toggleEntity = (kind: EntityKind, idx: number) => {
    const key = entityKey(kind, idx);
    if (selectedEntities.has(key)) deselectEntity(kind, idx);
    else selectEntity(kind, idx);
  };

  const selectLabel = (idx: number) => {
    if (!selectedLabels.has(idx)) {
      selectedLabels.add(idx);
      getLabelElement(idx)?.classList.add("selected");
    }
  };

  const deselectLabel = (idx: number) => {
    if (selectedLabels.delete(idx)) {
      getLabelElement(idx)?.classList.remove("selected");
    }
  };

  const toggleLabel = (idx: number) => {
    if (selectedLabels.has(idx)) deselectLabel(idx);
    else selectLabel(idx);
  };

  const clampDeltaForBBox = (b: BBox, dx: number, dy: number) => {
    const minDx = -b.minX;
    const maxDx = W - b.maxX;
    const minDy = -b.minY;
    const maxDy = H - b.maxY;
    return {
      dx: clamp(dx, minDx, maxDx),
      dy: clamp(dy, minDy, maxDy),
    };
  };

  type DragLabel = {
    kind: "label";
    idx: number;
    offsetX: number;
    offsetY: number;
  };

  type DragEntity = {
    kind: "entity";
    entity: EntityKind;
    idx: number;
    startX: number;
    startY: number;
    dx: number;
    dy: number;

    // DOM element being dragged
    el: SVGElement;

    
    // Base geometry used to avoid "flying"
    baseSegment?: { ax: number; ay: number; bx: number; by: number };
    basePolygon?: { points: [number, number][] };

    // Linked points (for segment endpoints)
    linkedPointIdx: number[];
    linkedPointBases: Array<{ i: number; x: number; y: number; el: SVGCircleElement }>;

    // Linked labels (for polygon vertex labels)
    linkedLabelIdx: number[];
    linkedLabelBases: Array<{ i: number; x: number; y: number; el: SVGTextElement }>;
  };

  type DragGroupItem =
    | { kind: "label"; idx: number; x: number; y: number; el: SVGTextElement }
    | { kind: "rect"; idx: number; x: number; y: number; w: number; h: number; el: SVGRectElement }
    | { kind: "circle"; idx: number; cx: number; cy: number; r: number; el: SVGCircleElement }
    | { kind: "ellipse"; idx: number; cx: number; cy: number; rx: number; ry: number; el: SVGEllipseElement }
    | { kind: "polygon"; idx: number; points: [number, number][]; el: SVGPolygonElement; linkedLabelIdx: number[] }
    | { kind: "segment"; idx: number; a: [number, number]; b: [number, number]; el: SVGLineElement; linkedPointIdx: number[] }
    | { kind: "point"; idx: number; at: [number, number]; r: number; el: SVGCircleElement };

  type DragGroup = {
    kind: "group";
    startX: number;
    startY: number;
    dx: number;
    dy: number;
    items: DragGroupItem[];
    linkedPoints: Array<{ i: number; x: number; y: number; el: SVGCircleElement }>;
    linkedLabels: Array<{ i: number; x: number; y: number; el: SVGTextElement }>;
    bbox: BBox;
  };

  type DragMode = DragLabel | DragEntity | DragGroup;
  let drag: DragMode | null = null;

  const applyDeltaToSpec = (
    entity: EntityKind,
    idx: number,
    dx: number,
    dy: number,
    linkedPointIdx: number[],
    linkedLabelIdx: number[]
  ) => {
    if (!currentDiagram) return;

    if (entity === "rect") {
      const r = currentDiagram.rects?.[idx];
      if (!r) return;
      r.x = round(r.x + dx);
      r.y = round(r.y + dy);
      return;
    }

    if (entity === "circle") {
      const c = currentDiagram.circles?.[idx];
      if (!c) return;
      c.cx = round(c.cx + dx);
      c.cy = round(c.cy + dy);
      return;
    }

    if (entity === "ellipse") {
      const e = currentDiagram.ellipses?.[idx];
      if (!e) return;
      e.cx = round(e.cx + dx);
      e.cy = round(e.cy + dy);
      return;
    }

    if (entity === "polygon") {
      const p = currentDiagram.polygons?.[idx];
      if (!p) return;
      p.points = (p.points ?? []).map(([x, y]) => [round(x + dx), round(y + dy)]);

      // bake linked vertex labels
      for (const li of linkedLabelIdx) {
        const lab = currentDiagram.labels?.[li];
        if (!lab) continue;
        lab.x = round(lab.x + dx);
        lab.y = round(lab.y + dy);
      }
      return;
    }

    if (entity === "segment") {
      const s = currentDiagram.segments?.[idx];
      if (!s) return;
      s.a = [round(s.a[0] + dx), round(s.a[1] + dy)];
      s.b = [round(s.b[0] + dx), round(s.b[1] + dy)];

      // bake linked endpoint points
      for (const pi of linkedPointIdx) {
        const p = currentDiagram.points?.[pi];
        if (!p) continue;
        p.at = [round(p.at[0] + dx), round(p.at[1] + dy)];
      }
      return;
    }

    if (entity === "point") {
      const p = currentDiagram.points?.[idx];
      if (!p) return;
      p.at = [round(p.at[0] + dx), round(p.at[1] + dy)];
      return;
    }
  };

  const onPointerDown = (ev: PointerEvent) => {
    ev.preventDefault();

    const target = ev.target as Element | null;
    if (!target || !currentDiagram) return;

    const labelIdxStr = target.getAttribute("data-label-index");
    const labelIdx = labelIdxStr ? Number(labelIdxStr) : -1;
    const labelHit = Number.isFinite(labelIdx) && labelIdx >= 0;

    const group = target.closest("g[data-entity]") as SVGGElement | null;
    const kind = (group?.getAttribute("data-entity") as EntityKind | null) ?? null;
    const idx = group ? Number(group.getAttribute("data-index")) : -1;
    const entityHit = !!kind && Number.isFinite(idx) && idx >= 0;

    if (!labelHit && !entityHit) {
      if (!ev.shiftKey) clearSelection();
      return;
    }

    if (ev.shiftKey) {
      if (labelHit) toggleLabel(labelIdx);
      if (entityHit) toggleEntity(kind!, idx);
      return;
    }

    if (labelHit) {
      if (!selectedLabels.has(labelIdx) || selectedEntities.size > 0) {
        clearSelection();
        selectLabel(labelIdx);
      }
    } else if (entityHit) {
      const key = entityKey(kind!, idx);
      if (!selectedEntities.has(key) || selectedLabels.size > 0) {
        clearSelection();
        selectEntity(kind!, idx);
      }
    }

    // Build drag group from selection
    const p0 = svgPoint(ev.clientX, ev.clientY);
    const items: DragGroupItem[] = [];
    const linkedPointsMap = new Map<number, { i: number; x: number; y: number; el: SVGCircleElement }>();
    const linkedLabelsMap = new Map<number, { i: number; x: number; y: number; el: SVGTextElement }>();
    let groupBBox: BBox | null = null;

    const extendBBox = (b: BBox) => {
      if (!groupBBox) {
        groupBBox = { ...b };
        return;
      }
      groupBBox.minX = Math.min(groupBBox.minX, b.minX);
      groupBBox.minY = Math.min(groupBBox.minY, b.minY);
      groupBBox.maxX = Math.max(groupBBox.maxX, b.maxX);
      groupBBox.maxY = Math.max(groupBBox.maxY, b.maxY);
    };

    for (const key of selectedEntities) {
      const [k, i] = key.split(":");
      const entity = k as EntityKind;
      const eIdx = Number(i);
      const el = getEntityElement(entity, eIdx);
      if (!el) continue;

      if (entity === "rect") {
        const r = currentDiagram.rects?.[eIdx];
        if (!r) continue;
        items.push({
          kind: "rect",
          idx: eIdx,
          x: r.x,
          y: r.y,
          w: r.w,
          h: r.h,
          el: el as SVGRectElement,
        });
        extendBBox({ minX: r.x, minY: r.y, maxX: r.x + r.w, maxY: r.y + r.h });
      }

      if (entity === "circle") {
        const c = currentDiagram.circles?.[eIdx];
        if (!c) continue;
        items.push({
          kind: "circle",
          idx: eIdx,
          cx: c.cx,
          cy: c.cy,
          r: c.r,
          el: el as SVGCircleElement,
        });
        extendBBox({ minX: c.cx - c.r, minY: c.cy - c.r, maxX: c.cx + c.r, maxY: c.cy + c.r });
      }

      if (entity === "ellipse") {
        const e = currentDiagram.ellipses?.[eIdx];
        if (!e) continue;
        items.push({
          kind: "ellipse",
          idx: eIdx,
          cx: e.cx,
          cy: e.cy,
          rx: e.rx,
          ry: e.ry,
          el: el as SVGEllipseElement,
        });
        extendBBox({ minX: e.cx - e.rx, minY: e.cy - e.ry, maxX: e.cx + e.rx, maxY: e.cy + e.ry });
      }

      if (entity === "point") {
        const p = currentDiagram.points?.[eIdx];
        if (!p) continue;
        const r = num(p.r, 4);
        items.push({ kind: "point", idx: eIdx, at: [p.at[0], p.at[1]], r, el: el as SVGCircleElement });
        extendBBox({ minX: p.at[0] - r, minY: p.at[1] - r, maxX: p.at[0] + r, maxY: p.at[1] + r });
      }

      if (entity === "segment") {
        const s = currentDiagram.segments?.[eIdx];
        if (!s) continue;
        items.push({
          kind: "segment",
          idx: eIdx,
          a: [s.a[0], s.a[1]],
          b: [s.b[0], s.b[1]],
          el: el as SVGLineElement,
          linkedPointIdx: [],
        });
        const minX = Math.min(s.a[0], s.b[0]);
        const maxX = Math.max(s.a[0], s.b[0]);
        const minY = Math.min(s.a[1], s.b[1]);
        const maxY = Math.max(s.a[1], s.b[1]);
        extendBBox({ minX, minY, maxX, maxY });

        const pts = currentDiagram.points ?? [];
        for (let iPt = 0; iPt < pts.length; iPt++) {
          const at = pts[iPt]?.at;
          if (!at) continue;
          if (samePt(at, s.a) || samePt(at, s.b)) {
            const cEl = getEntityElement("point", iPt) as SVGCircleElement | null;
            if (cEl && !linkedPointsMap.has(iPt)) {
              linkedPointsMap.set(iPt, { i: iPt, x: at[0], y: at[1], el: cEl });
            }
          }
        }
      }

      if (entity === "polygon") {
        const p = currentDiagram.polygons?.[eIdx];
        if (!p) continue;
        const pts = (p.points ?? []).map(([x, y]) => [x, y]) as [number, number][];
        items.push({
          kind: "polygon",
          idx: eIdx,
          points: pts,
          el: el as SVGPolygonElement,
          linkedLabelIdx: [],
        });
        const xs = pts.map((q) => q[0]);
        const ys = pts.map((q) => q[1]);
        extendBBox({ minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) });

        const labels = currentDiagram.labels ?? [];
        for (let li = 0; li < labels.length; li++) {
          const lab = labels[li];
          if (!lab) continue;
          if (!/^[A-Z]$/.test(lab.text)) continue;

          const vI = nearestVertexIndex({ x: lab.x, y: lab.y }, pts);
          if (vI >= 0 && !selectedLabels.has(li)) {
            const tEl = getLabelElement(li);
            if (tEl && !linkedLabelsMap.has(li)) {
              linkedLabelsMap.set(li, { i: li, x: lab.x, y: lab.y, el: tEl });
            }
          }
        }
      }
    }

    for (const li of selectedLabels) {
      const lab = currentDiagram.labels?.[li];
      const tEl = getLabelElement(li);
      if (!lab || !tEl) continue;
      items.push({ kind: "label", idx: li, x: lab.x, y: lab.y, el: tEl });
      extendBBox({ minX: lab.x - 6, minY: lab.y - 6, maxX: lab.x + 6, maxY: lab.y + 6 });
    }

    if (!groupBBox) return;
    svg.setPointerCapture(ev.pointerId);
    drag = {
      kind: "group",
      startX: p0.x,
      startY: p0.y,
      dx: 0,
      dy: 0,
      items,
      linkedPoints: Array.from(linkedPointsMap.values()),
      linkedLabels: Array.from(linkedLabelsMap.values()),
      bbox: groupBBox,
    };
  };

  const onPointerMove = (ev: PointerEvent) => {
    if (!drag || !currentDiagram) return;
    ev.preventDefault();

    const p = svgPoint(ev.clientX, ev.clientY);

    // --- LABEL move ---
    if (drag.kind === "label") {
      const label = currentDiagram.labels?.[drag.idx];
      if (!label) return;

      const nx = clamp(p.x - drag.offsetX, 0, W);
      const ny = clamp(p.y - drag.offsetY, 0, H);

      label.x = round(nx);
      label.y = round(ny);

      const textEl = svg.querySelector(`text[data-label-index="${drag.idx}"]`) as SVGTextElement | null;
      if (textEl) {
        textEl.setAttribute("x", String(label.x));
        textEl.setAttribute("y", String(label.y));
      }
      return;
    }

    // --- GROUP move ---
    if (drag.kind === "group") {
      let dx = p.x - drag.startX;
      let dy = p.y - drag.startY;
      const bounded = clampDeltaForBBox(drag.bbox, dx, dy);
      dx = bounded.dx;
      dy = bounded.dy;
      drag.dx = dx;
      drag.dy = dy;

      for (const it of drag.items) {
        if (it.kind === "label") {
          it.el.setAttribute("x", String(clamp(it.x + dx, 0, W)));
          it.el.setAttribute("y", String(clamp(it.y + dy, 0, H)));
          continue;
        }
        if (it.kind === "rect") {
          it.el.setAttribute("x", String(clamp(it.x + dx, 0, W - it.w)));
          it.el.setAttribute("y", String(clamp(it.y + dy, 0, H - it.h)));
          continue;
        }
        if (it.kind === "circle") {
          it.el.setAttribute("cx", String(clamp(it.cx + dx, it.r, W - it.r)));
          it.el.setAttribute("cy", String(clamp(it.cy + dy, it.r, H - it.r)));
          continue;
        }
        if (it.kind === "ellipse") {
          it.el.setAttribute("cx", String(clamp(it.cx + dx, it.rx, W - it.rx)));
          it.el.setAttribute("cy", String(clamp(it.cy + dy, it.ry, H - it.ry)));
          continue;
        }
        if (it.kind === "point") {
          it.el.setAttribute("cx", String(clamp(it.at[0] + dx, 0, W)));
          it.el.setAttribute("cy", String(clamp(it.at[1] + dy, 0, H)));
          continue;
        }
        if (it.kind === "segment") {
          it.el.setAttribute("x1", String(it.a[0] + dx));
          it.el.setAttribute("y1", String(it.a[1] + dy));
          it.el.setAttribute("x2", String(it.b[0] + dx));
          it.el.setAttribute("y2", String(it.b[1] + dy));
          continue;
        }
        if (it.kind === "polygon") {
          const moved = it.points.map(([x, y]) => [x + dx, y + dy] as [number, number]);
          it.el.setAttribute("points", moved.map(([x, y]) => `${x},${y}`).join(" "));
          continue;
        }
      }

      for (const lp of drag.linkedPoints) {
        lp.el.setAttribute("cx", String(clamp(lp.x + dx, 0, W)));
        lp.el.setAttribute("cy", String(clamp(lp.y + dy, 0, H)));
      }
      for (const ll of drag.linkedLabels) {
        ll.el.setAttribute("x", String(clamp(ll.x + dx, 0, W)));
        ll.el.setAttribute("y", String(clamp(ll.y + dy, 0, H)));
      }
      return;
    }

    // --- ENTITY move ---
    let dx = p.x - drag.startX;
    let dy = p.y - drag.startY;

    if (drag.entity === "segment") {
      const line = drag.el as SVGLineElement;
      if (!drag.baseSegment) return;

      // Clamp translation so BOTH endpoints stay in bounds (rigid move)
      const bounded = clampDeltaForPoints(
        [
          [drag.baseSegment.ax, drag.baseSegment.ay],
          [drag.baseSegment.bx, drag.baseSegment.by],
        ],
        dx,
        dy
      );
      dx = bounded.dx;
      dy = bounded.dy;

      drag.dx = dx;
      drag.dy = dy;

      line.setAttribute("x1", String(drag.baseSegment.ax + dx));
      line.setAttribute("y1", String(drag.baseSegment.ay + dy));
      line.setAttribute("x2", String(drag.baseSegment.bx + dx));
      line.setAttribute("y2", String(drag.baseSegment.by + dy));

      // move linked endpoint dots from BASE coords with bounded dx/dy
      for (const bp of drag.linkedPointBases) {
        bp.el.setAttribute("cx", String(bp.x + dx));
        bp.el.setAttribute("cy", String(bp.y + dy));
      }
      return;
    }

    if (drag.entity === "polygon") {
      const polyEl = drag.el as SVGPolygonElement;
      if (!drag.basePolygon) return;

      // Clamp translation so ALL vertices stay in bounds (rigid move)
      const bounded = clampDeltaForPoints(drag.basePolygon.points, dx, dy);
      dx = bounded.dx;
      dy = bounded.dy;

      drag.dx = dx;
      drag.dy = dy;

      const moved = drag.basePolygon.points.map(([x, y]) => [x + dx, y + dy] as [number, number]);
      polyEl.setAttribute("points", moved.map(([x, y]) => `${x},${y}`).join(" "));

      for (const bl of drag.linkedLabelBases) {
        bl.el.setAttribute("x", String(bl.x + dx));
        bl.el.setAttribute("y", String(bl.y + dy));
      }
      return;
    }

    // Everything else keeps prior behavior
    drag.dx = dx;
    drag.dy = dy;

    if (drag.entity === "rect") {
      const r = currentDiagram.rects?.[drag.idx];
      const el = drag.el as SVGRectElement;
      if (!r) return;
      el.setAttribute("x", String(clamp(r.x + dx, 0, W)));
      el.setAttribute("y", String(clamp(r.y + dy, 0, H)));
      return;
    }

    if (drag.entity === "circle") {
      const c = currentDiagram.circles?.[drag.idx];
      const el = drag.el as SVGCircleElement;
      if (!c) return;
      el.setAttribute("cx", String(clamp(c.cx + dx, 0, W)));
      el.setAttribute("cy", String(clamp(c.cy + dy, 0, H)));
      return;
    }

    if (drag.entity === "ellipse") {
      const e = currentDiagram.ellipses?.[drag.idx];
      const el = drag.el as SVGEllipseElement;
      if (!e) return;
      el.setAttribute("cx", String(clamp(e.cx + dx, 0, W)));
      el.setAttribute("cy", String(clamp(e.cy + dy, 0, H)));
      return;
    }

    if (drag.entity === "point") {
      const pt = currentDiagram.points?.[drag.idx];
      const el = drag.el as SVGCircleElement;
      if (!pt) return;
      el.setAttribute("cx", String(clamp(pt.at[0] + dx, 0, W)));
      el.setAttribute("cy", String(clamp(pt.at[1] + dy, 0, H)));
      return;
    }
  };

  const onPointerUp = (ev: PointerEvent) => {
    const dragSnapshot = drag;
    if (!dragSnapshot) return;

    try {
      svg.releasePointerCapture(ev.pointerId);
    } catch {
      // ignore
    }

    if (dragSnapshot.kind === "entity" && currentDiagram) {
      applyDeltaToSpec(
        dragSnapshot.entity,
        dragSnapshot.idx,
        dragSnapshot.dx,
        dragSnapshot.dy,
        dragSnapshot.linkedPointIdx,
        dragSnapshot.linkedLabelIdx
      );
    }

    if (dragSnapshot.kind === "group" && currentDiagram) {
      const movedPoints = new Set<number>();
      const movedLabels = new Set<number>();

      for (const it of dragSnapshot.items) {
        if (it.kind === "label") {
          const lab = currentDiagram.labels?.[it.idx];
          if (!lab) continue;
          lab.x = round(lab.x + dragSnapshot.dx);
          lab.y = round(lab.y + dragSnapshot.dy);
          movedLabels.add(it.idx);
          continue;
        }

        if (it.kind === "rect") {
          const r = currentDiagram.rects?.[it.idx];
          if (!r) continue;
          r.x = round(r.x + dragSnapshot.dx);
          r.y = round(r.y + dragSnapshot.dy);
          continue;
        }

        if (it.kind === "circle") {
          const c = currentDiagram.circles?.[it.idx];
          if (!c) continue;
          c.cx = round(c.cx + dragSnapshot.dx);
          c.cy = round(c.cy + dragSnapshot.dy);
          continue;
        }

        if (it.kind === "ellipse") {
          const e = currentDiagram.ellipses?.[it.idx];
          if (!e) continue;
          e.cx = round(e.cx + dragSnapshot.dx);
          e.cy = round(e.cy + dragSnapshot.dy);
          continue;
        }

        if (it.kind === "point") {
          const p = currentDiagram.points?.[it.idx];
          if (!p) continue;
          p.at = [round(p.at[0] + dragSnapshot.dx), round(p.at[1] + dragSnapshot.dy)];
          movedPoints.add(it.idx);
          continue;
        }

        if (it.kind === "segment") {
          const s = currentDiagram.segments?.[it.idx];
          if (!s) continue;
          s.a = [round(s.a[0] + dragSnapshot.dx), round(s.a[1] + dragSnapshot.dy)];
          s.b = [round(s.b[0] + dragSnapshot.dx), round(s.b[1] + dragSnapshot.dy)];
          continue;
        }

        if (it.kind === "polygon") {
          const p = currentDiagram.polygons?.[it.idx];
          if (!p) continue;
          p.points = (p.points ?? []).map(([x, y]) => [round(x + dragSnapshot.dx), round(y + dragSnapshot.dy)]);
          continue;
        }
      }

      for (const lp of dragSnapshot.linkedPoints) {
        if (movedPoints.has(lp.i)) continue;
        const p = currentDiagram.points?.[lp.i];
        if (!p) continue;
        p.at = [round(p.at[0] + dragSnapshot.dx), round(p.at[1] + dragSnapshot.dy)];
      }

      for (const ll of dragSnapshot.linkedLabels) {
        if (movedLabels.has(ll.i)) continue;
        const l = currentDiagram.labels?.[ll.i];
        if (!l) continue;
        l.x = round(l.x + dragSnapshot.dx);
        l.y = round(l.y + dragSnapshot.dy);
      }
    }

    drag = null;
  };

  svg.addEventListener("pointerdown", onPointerDown);
  svg.addEventListener("pointermove", onPointerMove);
  svg.addEventListener("pointerup", onPointerUp);
  svg.addEventListener("pointercancel", onPointerUp);
  svg.addEventListener("pointerleave", onPointerUp);
}

// ---------- API ----------
async function generateDiagram(description: string): Promise<DiagramSpec> {
  const res = await fetch("/api/diagram", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ description }),
  });

  const json = await res.json().catch(() => ({}));

  // Always show raw response (even if validation fails later)
  if (debugRawEl) debugRawEl.textContent = JSON.stringify(json, null, 2);

  if (!res.ok) {
    const msg = json?.error ? String(json.error) : `HTTP ${res.status}`;
    throw new Error(msg);
  }

  const diagram = json?.diagram;
  if (!diagram) throw new Error("Missing `diagram` in response.");

  return validateSpec(diagram);
}

// ---------- UI wiring ----------
btnExample.addEventListener("click", () => {
  clearMessages();
  descEl.value = MODE_CONFIG[currentMode].example;
  setStatus(`Example loaded for ${currentMode}. Click Generate.`);
});

function renderTemplateList(filter: string) {
  const q = filter.trim().toLowerCase();
  const items = templates.filter((t) => {
    if (!q) return true;
    return (
      t.name.toLowerCase().includes(q) ||
      t.id.toLowerCase().includes(q) ||
      t.defaultDescription.toLowerCase().includes(q)
    );
  });

  templateListEl.innerHTML = "";
  if (items.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No templates found";
    opt.disabled = true;
    templateListEl.appendChild(opt);
    setActiveTemplate(null);
    return;
  }

  for (const t of items) {
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = t.name;
    templateListEl.appendChild(opt);
  }

  if (activeTemplateId) {
    const exists = items.some((t) => t.id === activeTemplateId);
    if (!exists) setActiveTemplate(null);
  }

  if (!activeTemplateId) {
    templateListEl.selectedIndex = 0;
    setActiveTemplate(templateListEl.value);
  } else {
    templateListEl.value = activeTemplateId;
  }
}

templateSearchEl.addEventListener("input", () => {
  renderTemplateList(templateSearchEl.value);
});

templateListEl.addEventListener("change", () => {
  const id = templateListEl.value || null;
  setActiveTemplate(id);
});

btnUseTemplate.addEventListener("click", () => {
  clearMessages();
  const id = templateListEl.value || activeTemplateId;
  const tmpl = templates.find((t) => t.id === id);
  if (!tmpl) {
    setError("Select a template first.");
    return;
  }
  ensureDiagram2dMode();
  setActiveTemplate(tmpl.id);
  descEl.value = tmpl.defaultDescription;
  setStatus(`Template loaded: ${tmpl.name}`);
});

btnRenderTemplate.addEventListener("click", () => {
  clearMessages();
  const id = templateListEl.value || activeTemplateId;
  const tmpl = templates.find((t) => t.id === id);
  if (!tmpl) {
    setError("Select a template first.");
    return;
  }

  try {
    const parsed = JSON.parse(tmpl.starterJSON);
    ensureDiagram2dMode();
    mountDiagram(parsed, { setBase: true });
    resetViewRecenter();
    setActiveTemplate(tmpl.id);
    setStatus(`Rendered starter: ${tmpl.name} (no tokens spent).`);
  } catch (e: any) {
    setError(`Failed to parse starter JSON: ${e?.message ?? String(e)}`);
  }
});

btnClearTemplate.addEventListener("click", () => {
  clearMessages();
  setActiveTemplate(null);
  templateListEl.selectedIndex = -1;
  setStatus("Template cleared.");
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
    setError("Type a description first.");
    return;
  }

  // read canvas size from inputs (falls back safely)
  const canvasWidth = Number(canvasWidthEl?.value || "900");
  const canvasHeight = Number(canvasHeightEl?.value || "450");

  btnGenerate.disabled = true;

  try {
    setStatus(currentMode === "diagram2d" ? "Generating..." : "Building...");

    // IMPORTANT: pick your producer (however you implemented this)
    // If you have PRODUCERS array:
    const producer = PRODUCERS.find((p) => p.mode === currentMode);
    if (!producer) throw new Error(`Unknown mode: ${currentMode}`);

    let effectiveDescription = description;
    if (currentMode === "diagram2d" && activeTemplateId) {
      const tmpl = templates.find((t) => t.id === activeTemplateId);
      if (tmpl) effectiveDescription = tmpl.promptBuilder(description);
    }

    const diagram = await producer.produce({
      description: effectiveDescription,
      canvasWidth,
      canvasHeight,
      fetchDiagram: generateDiagram, // only used by diagram2dProducer
    });

    mountDiagram(diagram, { setBase: true });
    resetViewRecenter();

    setStatus(
      currentMode === "diagram2d"
        ? "Generated. Drag labels to adjust."
        : "Generated locally (no tokens). Drag labels to adjust."
    );
  } catch (e: any) {
    console.error(e);
    setError(e?.message ?? String(e));
    setStatus("");
  } finally {
    btnGenerate.disabled = false;
  }
});


type Mode = "diagram2d" | "graph" | "scene3d";

const modeEl = document.getElementById("mode") as HTMLSelectElement;

const MODE_CONFIG: Record<Mode, { placeholder: string; example: string }> = {
  diagram2d: {
    placeholder:
      "Example: Draw a rectangle for a perimeter problem. Label top = 12 cm, left = 7 cm, right = 7 cm, bottom = x cm.",
    example:
      "Draw a rectangle for a perimeter problem. Label top = 12 cm, left = 7 cm, right = 7 cm, bottom = x cm.",
  },
  graph: {
    placeholder:
      "Example: Create a coordinate plane from -10 to 10. Plot y = 2x + 1. Mark intercepts and label them.",
    example:
      "Create a coordinate plane from -10 to 10 on both axes. Plot y = 2x + 1. Mark the y-intercept and x-intercept, label them, and show the line clearly.",
  },
  scene3d: {
    placeholder:
      "Example: Draw a rectangular prism with length 8, width 5, height 3. Label edges; show hidden edges dashed.",
    example:
      "Draw a rectangular prism with length 8, width 5, height 3. Label length, width, height. Show hidden edges dashed.",
  },
};

let currentMode: Mode = (modeEl?.value as Mode) ?? "diagram2d";

function applyMode(m: Mode) {
  currentMode = m;

  // update placeholder
  descEl.placeholder = MODE_CONFIG[m].placeholder;

  // small status hint
  if (m === "diagram2d") setStatus("Mode set to: 2D Diagram");
  else if (m === "graph") setStatus("Mode set to: Graph (not wired yet)");
  else setStatus("Mode set to: 3D (not implemented yet)");

  const dragToggle = document.getElementById("enableDrag") as HTMLInputElement | null;
if (dragToggle) dragToggle.checked = m !== "graph";

}

// initialize once on load
applyMode(currentMode);
renderTemplateList("");

modeEl?.addEventListener("change", () => {
  clearMessages();
  applyMode(modeEl.value as Mode);
});


btnDownloadSvg.addEventListener("click", () => {
  clearMessages();
  if (!currentDiagram) {
    setError("No diagram to download yet.");
    return;
  }
  const svgString = renderDiagramSVG(currentDiagram);
  downloadText("diagram.svg", svgString, "image/svg+xml");
  setStatus("SVG downloaded.");
});

btnDownloadPng.addEventListener("click", () => {
  clearMessages();
  if (!currentDiagram) {
    setError("No diagram to download yet.");
    return;
  }
  const svgString = renderDiagramSVG(currentDiagram);
  downloadPNGFromSVG(svgString, "diagram.png");
  setStatus("PNG downloaded.");
});

const prevent = (id: string, msg: string) => {
  const el = document.getElementById(id);
  el?.addEventListener("click", (e) => {
    e.preventDefault();
    setStatus(msg);
  });
};

const templatesPanel = document.getElementById("templatesPanel") as HTMLDetailsElement | null;
const linkTemplates = document.getElementById("linkTemplates");
linkTemplates?.addEventListener("click", (e) => {
  e.preventDefault();
  if (templatesPanel) {
    templatesPanel.open = true;
    templatesPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  setStatus("Templates ready.");
});

prevent("linkDocs", "Docs coming soon.");
prevent("linkAbout", "About page coming soon.");
