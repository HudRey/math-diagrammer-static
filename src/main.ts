import "./style.css";
import { renderDiagramSVG, validateSpec, type DiagramSpec } from "./renderDiagram";

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

      <details class="debug" open>
        <summary>Debug</summary>
        <div class="debugBody">
          <div class="debugLabel">Rendered (normalized) DiagramSpec</div>
          <pre id="debugJson" class="debugJson"></pre>
          <div class="debugLabel">Raw server response</div>
          <pre id="debugRaw" class="debugJson"></pre>
        </div>
      </details>

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
function mountDiagram(diagram: DiagramSpec) {
  console.log("mountDiagram called");

  const safe = validateSpec(diagram);
  currentDiagram = safe;

  if (debugJsonEl) debugJsonEl.textContent = JSON.stringify(safe, null, 2);

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

// ---------- Dragging labels ----------
function hookDragHandlers() {
  const svgOld = document.getElementById("diagramSvg") as SVGSVGElement | null;
  if (!svgOld || !currentDiagram) return;

  // Clear previous handlers by cloning node (cheap and effective)
  const svg = svgOld.cloneNode(true) as SVGSVGElement;
  svgOld.replaceWith(svg);

  // ---- coordinate helper ----
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

  type DragMode =
    | { kind: "label"; idx: number; offsetX: number; offsetY: number }
    | { kind: "entity"; entity: string; idx: number; startX: number; startY: number; dx: number; dy: number; g: SVGGElement };

  let drag: DragMode | null = null;

  const applyDeltaToSpec = (entity: string, idx: number, dx: number, dy: number) => {
    if (!currentDiagram) return;

    const round = (v: number) => Math.round(v * 100) / 100;

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
      return;
    }

    if (entity === "segment") {
      const s = currentDiagram.segments?.[idx];
      if (!s) return;
      s.a = [round(s.a[0] + dx), round(s.a[1] + dy)];
      s.b = [round(s.b[0] + dx), round(s.b[1] + dy)];
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
    const target = ev.target as Element | null;
    if (!target || !currentDiagram) return;

    // --- LABEL drag ---
    const idxStr = target.getAttribute("data-label-index");
    if (idxStr) {
      const idx = Number(idxStr);
      if (!Number.isFinite(idx)) return;
      const labels = currentDiagram.labels ?? [];
      if (!labels[idx]) return;

      svg.setPointerCapture(ev.pointerId);
      const p = svgPoint(ev.clientX, ev.clientY);

      drag = {
        kind: "label",
        idx,
        offsetX: p.x - labels[idx].x,
        offsetY: p.y - labels[idx].y,
      };
      return;
    }

    // --- SHAPE drag (look for nearest <g data-entity ...>) ---
    const g = target.closest("[data-entity][data-index]") as SVGGElement | null;
    if (!g) return;

    const entity = g.getAttribute("data-entity") ?? "";
    const idx = Number(g.getAttribute("data-index"));
    if (!entity || !Number.isFinite(idx)) return;

    svg.setPointerCapture(ev.pointerId);
    const p0 = svgPoint(ev.clientX, ev.clientY);

    drag = { kind: "entity", entity, idx, startX: p0.x, startY: p0.y, dx: 0, dy: 0, g };
  };

  const onPointerMove = (ev: PointerEvent) => {
    if (!drag || !currentDiagram) return;

    const p = svgPoint(ev.clientX, ev.clientY);

    // --- LABEL move (live update text attrs, no rerender) ---
    if (drag.kind === "label") {
      const labels = currentDiagram.labels ?? [];
      const label = labels[drag.idx];
      if (!label) return;

      const newX = p.x - drag.offsetX;
      const newY = p.y - drag.offsetY;

      label.x = Math.round(newX * 100) / 100;
      label.y = Math.round(newY * 100) / 100;

      const textEl = svg.querySelector(`[data-label-index="${drag.idx}"]`) as SVGTextElement | null;
      if (textEl) {
        textEl.setAttribute("x", String(label.x));
        textEl.setAttribute("y", String(label.y));
      }
      return;
    }

    // --- SHAPE move (apply temporary translate on the <g>) ---
    const dx = p.x - drag.startX;
    const dy = p.y - drag.startY;
    drag.dx = dx;
    drag.dy = dy;

    drag.g.setAttribute("transform", `translate(${dx}, ${dy})`);
  };

  const onPointerUp = (ev: PointerEvent) => {
    if (!drag) return;

    try {
      svg.releasePointerCapture(ev.pointerId);
    } catch {
      // ignore
    }

    // Bake shape delta into spec, then rerender so transform resets cleanly
    if (drag.kind === "entity" && currentDiagram) {
      const { entity, idx, dx, dy } = drag;
      // Clear temp transform immediately so there isn't a flash on rerender
      drag.g.removeAttribute("transform");
      applyDeltaToSpec(entity, idx, dx, dy);
      mountDiagram(currentDiagram); // re-validate + rerender
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
    console.error("Generate failed:", e);
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
