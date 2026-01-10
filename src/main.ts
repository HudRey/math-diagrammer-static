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
    <aside class="panel">
      <div class="title">Math Diagram Renderer</div>
      <div class="sub">Describe your diagram → generate → drag → download.</div>

      <label>Diagram description
        <textarea id="desc" placeholder="Example: Draw a rectangle..."></textarea>
      </label>

      <div class="row">
        <button id="generateBtn">Generate</button>
        <button id="downloadBtn">Download SVG</button>
      </div>

      <!-- JSON goes at the bottom, collapsed by default -->
      <details id="jsonDetails" class="jsonDetails">
        <summary>JSON (click to expand)</summary>
        <pre id="jsonOut" class="jsonOut"></pre>
      </details>
    </aside>

    <main class="stage">
      <div id="diagramWrap" class="diagramWrap"></div>
    </main>
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

// ---------- Dragging labels + grouped entities ----------
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

  // Endpoint ↔ point matching tolerance
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

  type DragMode = DragLabel | DragEntity;
  let drag: DragMode | null = null;

  const applyDeltaToSpec = (entity: EntityKind, idx: number, dx: number, dy: number, linkedPointIdx: number[], linkedLabelIdx: number[]) => {
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

    // --- ENTITY drag ---
    const el = target.closest("line, polygon, rect, ellipse, circle") as SVGElement | null;
    if (!el) return;

    let entity: EntityKind | null = null;
    let idx = -1;

    const tag = el.tagName.toLowerCase();

    if (tag === "line") {
      entity = "segment";
      idx = Array.from(svg.querySelectorAll("line")).indexOf(el as SVGLineElement);
    } else if (tag === "polygon") {
      entity = "polygon";
      idx = Array.from(svg.querySelectorAll("polygon")).indexOf(el as SVGPolygonElement);
    } else if (tag === "rect") {
      entity = "rect";
      const rectEls = Array.from(svg.querySelectorAll("rect")).filter((r) => r.getAttribute("width") !== "100%");
      idx = rectEls.indexOf(el as SVGRectElement);
    } else if (tag === "ellipse") {
      entity = "ellipse";
      idx = Array.from(svg.querySelectorAll("ellipse")).indexOf(el as SVGEllipseElement);
    } else if (tag === "circle") {
      // Could be a point marker circle OR a "circle shape"
      const cx = Number(el.getAttribute("cx"));
      const cy = Number(el.getAttribute("cy"));
      const pts = currentDiagram.points ?? [];
      const pi = pts.findIndex((p) => samePt([cx, cy], p.at));
      if (pi >= 0) {
        entity = "point";
        idx = pi;
      } else {
        entity = "circle";
        // Find matching circle object by center (best effort)
        const cs = currentDiagram.circles ?? [];
        const ci = cs.findIndex((c) => samePt([cx, cy], [c.cx, c.cy]));
        idx = ci;
      }
    }

    if (!entity || idx < 0) return;

    const linkedPointIdx: number[] = [];
    const linkedPointBases: Array<{ i: number; x: number; y: number; el: SVGCircleElement }> = [];
    const linkedLabelIdx: number[] = [];
    const linkedLabelBases: Array<{ i: number; x: number; y: number; el: SVGTextElement }> = [];

    let baseSegment: DragEntity["baseSegment"];
    let basePolygon: DragEntity["basePolygon"];

    // Segment: link endpoint dots
    if (entity === "segment") {
      const seg = currentDiagram.segments?.[idx];
      if (seg) {
        baseSegment = { ax: seg.a[0], ay: seg.a[1], bx: seg.b[0], by: seg.b[1] };

        const pts = currentDiagram.points ?? [];
        for (let i = 0; i < pts.length; i++) {
          const at = pts[i]?.at;
          if (!at) continue;
          if (samePt(at, seg.a) || samePt(at, seg.b)) linkedPointIdx.push(i);
        }

        // Map to SVG circle elements currently rendered
        const circleEls = Array.from(svg.querySelectorAll("circle"));
        for (const pi of linkedPointIdx) {
          const at = currentDiagram.points?.[pi]?.at;
          if (!at) continue;
          const [px, py] = at;

          const cEl = circleEls.find((c) => samePt([Number(c.getAttribute("cx")), Number(c.getAttribute("cy"))], [px, py]));
          if (cEl) {
            linkedPointBases.push({
              i: pi,
              x: Number(cEl.getAttribute("cx")),
              y: Number(cEl.getAttribute("cy")),
              el: cEl,
            });
          }
        }
      }
    }

    // Polygon: link vertex labels (A,B,C...) near vertices
    if (entity === "polygon") {
      const poly = currentDiagram.polygons?.[idx];
      if (poly && (poly.points?.length ?? 0) >= 3) {
        basePolygon = { points: (poly.points ?? []).map(([x, y]) => [x, y]) as [number, number][] };

        const labels = currentDiagram.labels ?? [];
        for (let li = 0; li < labels.length; li++) {
          const lab = labels[li];
          if (!lab) continue;
          if (!/^[A-Z]$/.test(lab.text)) continue;

          const vI = nearestVertexIndex({ x: lab.x, y: lab.y }, poly.points);
          if (vI >= 0) linkedLabelIdx.push(li);
        }

        for (const li of linkedLabelIdx) {
          const tEl = svg.querySelector(`text[data-label-index="${li}"]`) as SVGTextElement | null;
          if (tEl) {
            linkedLabelBases.push({
              i: li,
              x: Number(tEl.getAttribute("x")),
              y: Number(tEl.getAttribute("y")),
              el: tEl,
            });
          }
        }
      }
    }

    svg.setPointerCapture(ev.pointerId);
    const p0 = svgPoint(ev.clientX, ev.clientY);

    drag = {
      kind: "entity",
      entity,
      idx,
      startX: p0.x,
      startY: p0.y,
      dx: 0,
      dy: 0,
      el,
      baseSegment,
      basePolygon,
      linkedPointIdx,
      linkedPointBases,
      linkedLabelIdx,
      linkedLabelBases,
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

    // --- ENTITY move ---
    const dx = p.x - drag.startX;
    const dy = p.y - drag.startY;
    drag.dx = dx;
    drag.dy = dy;

    if (drag.entity === "segment") {
      const line = drag.el as SVGLineElement;
      if (!drag.baseSegment) return;

      const ax = clamp(drag.baseSegment.ax + dx, 0, W);
      const ay = clamp(drag.baseSegment.ay + dy, 0, H);
      const bx = clamp(drag.baseSegment.bx + dx, 0, W);
      const by = clamp(drag.baseSegment.by + dy, 0, H);

      line.setAttribute("x1", String(ax));
      line.setAttribute("y1", String(ay));
      line.setAttribute("x2", String(bx));
      line.setAttribute("y2", String(by));

      // move linked endpoint dots from BASE coords
      for (const bp of drag.linkedPointBases) {
        const cx = clamp(bp.x + dx, 0, W);
        const cy = clamp(bp.y + dy, 0, H);
        bp.el.setAttribute("cx", String(cx));
        bp.el.setAttribute("cy", String(cy));
      }
      return;
    }

    if (drag.entity === "polygon") {
      const polyEl = drag.el as SVGPolygonElement;
      if (!drag.basePolygon) return;

      const moved = drag.basePolygon.points.map(([x, y]) => [clamp(x + dx, 0, W), clamp(y + dy, 0, H)] as [number, number]);
      polyEl.setAttribute("points", moved.map(([x, y]) => `${x},${y}`).join(" "));

      for (const bl of drag.linkedLabelBases) {
        const lx = clamp(bl.x + dx, 0, W);
        const ly = clamp(bl.y + dy, 0, H);
        bl.el.setAttribute("x", String(lx));
        bl.el.setAttribute("y", String(ly));
      }
      return;
    }

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
    if (!drag) return;

    try {
      svg.releasePointerCapture(ev.pointerId);
    } catch {
      // ignore
    }

    if (drag.kind === "entity" && currentDiagram) {
      applyDeltaToSpec(drag.entity, drag.idx, drag.dx, drag.dy, drag.linkedPointIdx, drag.linkedLabelIdx);
      mountDiagram(currentDiagram);
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
