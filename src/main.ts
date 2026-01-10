import "./style.css";
import { renderDiagramSVG, validateSpec, type DiagramSpec } from "./renderDiagram";

type StylePrefs = {
  stroke: string; // shape outline
  fill: string; // shape fill
  labelColor: string; // annotations color
  labelFontSize: number; // annotations font size
};

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

const app = $("#app");
app.innerHTML = `
  <div class="layout">
    <div class="panel">
      <div class="title">Math Diagram Renderer</div>
      <div class="sub">Describe your diagram → generate → drag labels → download.</div>

      <label>Diagram description
        <textarea id="desc" placeholder="Example: Draw a rectangle for a perimeter problem. Label top = 12 cm, left = 7 cm, right = 7 cm, bottom = x cm."></textarea>
      </label>

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
    </div>

    <div class="stage">
      <div id="svgHost" class="svgHost"></div>
    </div>
  </div>
`;

const descEl = $("#desc") as HTMLTextAreaElement;
const statusEl = $("#status") as HTMLDivElement;
const errEl = $("#err") as HTMLDivElement;
const svgHost = $("#svgHost") as HTMLDivElement;

const btnGenerate = $("#generate") as HTMLButtonElement;
const btnExample = $("#example") as HTMLButtonElement;
const btnApplyStyle = $("#applyStyle") as HTMLButtonElement;
const btnDownloadSvg = $("#downloadSvg") as HTMLButtonElement;
const btnDownloadPng = $("#downloadPng") as HTMLButtonElement;

let currentDiagram: DiagramSpec | null = null;

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

  // Defaults
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

  // Shapes (optional arrays)
  d.rects = (d.rects ?? []).map((r) => ({
    ...r,
    stroke: prefs.stroke,
    fill: prefs.fill,
  }));

  d.circles = (d.circles ?? []).map((c) => ({
    ...c,
    stroke: prefs.stroke,
    fill: prefs.fill,
  }));

  d.ellipses = (d.ellipses ?? []).map((e) => ({
    ...e,
    stroke: prefs.stroke,
    fill: prefs.fill,
  }));

  d.polygons = (d.polygons ?? []).map((p) => ({
    ...p,
    stroke: prefs.stroke,
    fill: prefs.fill,
  }));

  d.segments = (d.segments ?? []).map((seg) => ({
    ...seg,
    stroke: prefs.stroke,
  }));

  // Labels
  d.labels = (d.labels ?? []).map((l) => ({
    ...l,
    color: prefs.labelColor,
    fontSize: prefs.labelFontSize,
  }));

  return d;
}

// ---------- Rendering ----------
function mountDiagram(diagram: DiagramSpec) {
  // Normalize/validate once at the boundary so state is always safe
  const safe = validateSpec(diagram);
  currentDiagram = safe;

  // Renderer now includes id="diagramSvg"
  const svgString = renderDiagramSVG(safe);
  svgHost.innerHTML = svgString;

  hookDragHandlers();
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

    canvas.toBlob(
      (blob) => {
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
      },
      "image/png"
    );
  };

  img.onerror = () => {
    URL.revokeObjectURL(url);
    setError("Failed to render image.");
  };

  img.src = url;
}

// ---------- Dragging labels ----------
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
    const p = pt.matrixTransform(inv);
    return { x: p.x, y: p.y };
  };

  const onPointerDown = (ev: PointerEvent) => {
    const target = ev.target as Element | null;
    if (!target) return;

    const idxStr = target.getAttribute("data-label-index");
    if (!idxStr) return;

    const idx = Number(idxStr);
    if (!Number.isFinite(idx)) return;

    const labels = currentDiagram?.labels ?? [];
    if (!labels[idx]) return;

    draggingIdx = idx;
    svg.setPointerCapture(ev.pointerId);

    const p = svgPoint(ev.clientX, ev.clientY);
    offsetX = p.x - labels[idx].x;
    offsetY = p.y - labels[idx].y;
  };

  const onPointerMove = (ev: PointerEvent) => {
    if (draggingIdx === null || !currentDiagram) return;

    const labels = currentDiagram.labels ?? [];
    const label = labels[draggingIdx];
    if (!label) return;

    const p = svgPoint(ev.clientX, ev.clientY);
    const newX = p.x - offsetX;
    const newY = p.y - offsetY;

    label.x = Math.round(newX * 100) / 100;
    label.y = Math.round(newY * 100) / 100;

    const textEl = svg.querySelector(`[data-label-index="${draggingIdx}"]`) as SVGTextElement | null;
    if (textEl) {
      textEl.setAttribute("x", String(label.x));
      textEl.setAttribute("y", String(label.y));
    }
  };

  const onPointerUp = (ev: PointerEvent) => {
    if (draggingIdx === null) return;
    draggingIdx = null;
    try {
      svg.releasePointerCapture(ev.pointerId);
    } catch {
      // ignore
    }
  };

  // Clear previous handlers by cloning node (cheap and effective)
  const fresh = svg.cloneNode(true) as SVGSVGElement;
  svg.replaceWith(fresh);

  fresh.addEventListener("pointerdown", onPointerDown);
  fresh.addEventListener("pointermove", onPointerMove);
  fresh.addEventListener("pointerup", onPointerUp);
  fresh.addEventListener("pointercancel", onPointerUp);
  fresh.addEventListener("pointerleave", onPointerUp);
}

// ---------- API ----------
async function generateDiagram(description: string): Promise<DiagramSpec> {
  const res = await fetch("/api/diagram", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ description }),
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg = json?.error ? String(json.error) : `HTTP ${res.status}`;
    throw new Error(msg);
  }

  const diagram = json?.diagram;
  if (!diagram) throw new Error("Missing `diagram` in response.");

  // Normalize in the frontend boundary (keeps state safe)
  return validateSpec(diagram);
}

// ---------- UI wiring ----------
btnExample.addEventListener("click", () => {
  clearMessages();
  descEl.value =
    "Draw a rectangle for a perimeter problem. Label top = 12 cm, left = 7 cm, right = 7 cm, bottom = x cm.";
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
    const diagram = await generateDiagram(description);
    mountDiagram(diagram);
    setStatus("Generated. Drag labels to adjust.");
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
