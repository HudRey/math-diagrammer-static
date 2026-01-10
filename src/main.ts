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

// ---------- Dragging labels + grouped entities ----------
function hookDragHandlers() {
  const svgOld = document.getElementById("diagramSvg") as SVGSVGElement | null;
  if (!svgOld || !currentDiagram) return;

  // Clear previous handlers by cloning node (cheap and effective)
  const svg = svgOld.cloneNode(true) as SVGSVGElement;
  svgOld.replaceWith(svg);

  // Capture a non-null snapshot for TS. This is the same object as currentDiagram at this moment.
  const diagram = currentDiagram;
  if (!diagram) return;

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

  // Match endpoints to points (tolerance)
  const ENDPOINT_EPS = 0.5;
  const samePt = (a: [number, number], b: [number, number]) =>
    Math.abs(a[0] - b[0]) <= ENDPOINT_EPS && Math.abs(a[1] - b[1]) <= ENDPOINT_EPS;

  // Vertex label association thresholds
  const VERTEX_LABEL_EPS = 26; // pixels; label within this range of a vertex counts as that vertex label

  // Find which polygon vertex a label is closest to, if within threshold
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

  type DragMode =
    | { kind: "label"; idx: number; offsetX: number; offsetY: number }
    | {
        kind: "entity";
        entity: string;
        idx: number;
        startX: number;
        startY: number;
        dx: number;
        dy: number;
        // element we transform during drag (svg group or fallback target)
        g: SVGGElement | SVGElement;
        // segment-linked point indices (move live + bake)
        linkedPointIdx: number[];
        linkedPointEls: SVGElement[];
        // polygon-linked label indices (move live + bake)
        linkedLabelIdx: number[];
        linkedLabelEls: SVGTextElement[];
      };

  let drag: DragMode | null = null;

  const round = (v: number) => Math.round(v * 100) / 100;

  const applyDeltaToSpec = (
    entity: string,
    idx: number,
    dx: number,
    dy: number,
    linkedPointIdx: number[],
    linkedLabelIdx: number[]
  ) => {
    // Use captured diagram (non-null)
    if (entity === "rect") {
      const r = diagram.rects?.[idx];
      if (!r) return;
      r.x = round(r.x + dx);
      r.y = round(r.y + dy);
      return;
    }

    if (entity === "circle") {
      const c = diagram.circles?.[idx];
      if (!c) return;
      c.cx = round(c.cx + dx);
      c.cy = round(c.cy + dy);
      return;
    }

    if (entity === "ellipse") {
      const e = diagram.ellipses?.[idx];
      if (!e) return;
      e.cx = round(e.cx + dx);
      e.cy = round(e.cy + dy);
      return;
    }

    if (entity === "polygon") {
      const p = diagram.polygons?.[idx];
      if (!p) return;
      p.points = (p.points ?? []).map(([x, y]) => [round(x + dx), round(y + dy)]);

      // also move the linked vertex labels in the JSON
      for (const li of linkedLabelIdx) {
        const lab = diagram.labels?.[li];
        if (!lab) continue;
        lab.x = round(lab.x + dx);
        lab.y = round(lab.y + dy);
      }
      return;
    }

    if (entity === "segment") {
      const s = diagram.segments?.[idx];
      if (!s) return;
      s.a = [round(s.a[0] + dx), round(s.a[1] + dy)];
      s.b = [round(s.b[0] + dx), round(s.b[1] + dy)];

      // bake endpoint points too
      for (const pi of linkedPointIdx) {
        const p = diagram.points?.[pi];
        if (!p) continue;
        p.at = [round(p.at[0] + dx), round(p.at[1] + dy)];
      }
      return;
    }

    if (entity === "point") {
      const p = diagram.points?.[idx];
      if (!p) return;
      p.at = [round(p.at[0] + dx), round(p.at[1] + dy)];
      return;
    }
  };

  const onPointerDown = (ev: PointerEvent) => {
    const target = ev.target as Element | null;
    if (!target) return;

    // --- LABEL drag (individual label) ---
    const idxStr = target.getAttribute("data-label-index");
    if (idxStr) {
      const idx = Number(idxStr);
      if (!Number.isFinite(idx)) return;

      const labels = diagram.labels ?? [];
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
    // 1) Prefer <g data-entity data-index> (if you add it in renderDiagram.ts)
    // 2) Fallback: infer from raw SVG elements
    const g = target.closest("[data-entity][data-index]") as SVGGElement | null;
    let entity = g?.getAttribute("data-entity") ?? "";
    let idx = Number(g?.getAttribute("data-index"));

    let dragTarget: SVGGElement | SVGElement | null = g;

    // Fallback: infer entity/index from raw SVG elements (segments are <line>, polygons are <polygon>, points are <circle>)
    if (!dragTarget) {
      const hit = target.closest("line, polygon, rect, ellipse, circle");
      if (!hit) return;

      if (hit instanceof SVGLineElement) {
        entity = "segment";
        const lines = Array.from(svg.querySelectorAll("line"));
        idx = lines.indexOf(hit);
        dragTarget = hit;
      } else if (hit instanceof SVGPolygonElement) {
        entity = "polygon";
        const polys = Array.from(svg.querySelectorAll("polygon"));
        idx = polys.indexOf(hit);
        dragTarget = hit;
      } else if (hit instanceof SVGRectElement) {
        entity = "rect";
        const rects = Array.from(svg.querySelectorAll("rect")).filter((r) => r.getAttribute("width") !== "100%");
        idx = rects.indexOf(hit);
        dragTarget = hit;
      } else if (hit instanceof SVGEllipseElement) {
        entity = "ellipse";
        const els = Array.from(svg.querySelectorAll("ellipse"));
        idx = els.indexOf(hit);
        dragTarget = hit;
      } else if (hit instanceof SVGCircleElement) {
        const cx = Number(hit.getAttribute("cx"));
        const cy = Number(hit.getAttribute("cy"));

        // First try: match against spec.points by coordinate (robust)
        const pts = diagram.points ?? [];
        const pi = pts.findIndex((p) => samePt([cx, cy], p.at));

        if (pi >= 0) {
          entity = "point";
          idx = pi;
          dragTarget = hit;
        } else {
          // Otherwise treat as a circle "shape" from spec.circles
          entity = "circle";
          const cs = diagram.circles ?? [];
          const ci = cs.findIndex((c) => samePt([cx, cy], [c.cx, c.cy]));

          if (ci >= 0) {
            idx = ci;
            dragTarget = hit;
          } else {
            // Last resort: match by DOM order among circle shapes (excluding point markers)
            const allCircles = Array.from(svg.querySelectorAll("circle"));
            const shapeCircles = allCircles.filter((c) => {
              const x = Number(c.getAttribute("cx"));
              const y = Number(c.getAttribute("cy"));
              return (diagram.points ?? []).findIndex((p) => samePt([x, y], p.at)) < 0;
            });

            idx = shapeCircles.indexOf(hit);
            dragTarget = hit;
          }
        }
      }
    }

    if (!entity || !Number.isFinite(idx) || idx < 0 || !dragTarget) return;

    // Compute linked items:
    // - segment: link endpoint points that coincide with endpoints
    // - polygon: link vertex labels (A/B/C...) that are near vertices
    let linkedPointIdx: number[] = [];
    let linkedPointEls: SVGElement[] = [];
    let linkedLabelIdx: number[] = [];
    let linkedLabelEls: SVGTextElement[] = [];

    if (entity === "segment") {
      const seg = diagram.segments?.[idx];
      if (seg) {
        const pts = diagram.points ?? [];
        for (let i = 0; i < pts.length; i++) {
          const at = pts[i]?.at;
          if (!at) continue;
          if (samePt(at, seg.a) || samePt(at, seg.b)) linkedPointIdx.push(i);
        }

        // Find the SVG circles that correspond to those points (by matching cx/cy)
        const circles = Array.from(svg.querySelectorAll("circle"));
        for (const pi of linkedPointIdx) {
          const at = diagram.points?.[pi]?.at;
          if (!at) continue;
          const [px, py] = at;
          const el = circles.find((c) =>
            samePt([Number(c.getAttribute("cx")), Number(c.getAttribute("cy"))], [px, py])
          );
          if (el) linkedPointEls.push(el);
        }
      }
    }

    if (entity === "polygon") {
      const poly = diagram.polygons?.[idx];
      if (poly && (poly.points?.length ?? 0) >= 3) {
        const verts = poly.points;

        // Link labels that are single-letter capitals and near a vertex
        const labels = diagram.labels ?? [];
        for (let li = 0; li < labels.length; li++) {
          const lab = labels[li];
          if (!lab) continue;
          if (!/^[A-Z]$/.test(lab.text)) continue;

          const vI = nearestVertexIndex({ x: lab.x, y: lab.y }, verts);
          if (vI >= 0) linkedLabelIdx.push(li);
        }

        // Grab corresponding <text> nodes by data-label-index
        for (const li of linkedLabelIdx) {
          const t = svg.querySelector(`text[data-label-index="${li}"]`) as SVGTextElement | null;
          if (t) linkedLabelEls.push(t);
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
      g: dragTarget,
      linkedPointIdx,
      linkedPointEls,
      linkedLabelIdx,
      linkedLabelEls,
    };
  };

  const onPointerMove = (ev: PointerEvent) => {
    if (!drag) return;

    const p = svgPoint(ev.clientX, ev.clientY);

    // --- LABEL move (live update text attrs, no rerender) ---
    if (drag.kind === "label") {
      const labels = diagram.labels ?? [];
      const label = labels[drag.idx];
      if (!label) return;

      const newX = p.x - drag.offsetX;
      const newY = p.y - drag.offsetY;

      label.x = round(newX);
      label.y = round(newY);

      const textEl = svg.querySelector(`text[data-label-index="${drag.idx}"]`) as SVGTextElement | null;
      if (textEl) {
        textEl.setAttribute("x", String(label.x));
        textEl.setAttribute("y", String(label.y));
      }
      return;
    }

    // --- ENTITY move (live move actual attributes + linked things) ---
    const dx = p.x - drag.startX;
    const dy = p.y - drag.startY;
    drag.dx = dx;
    drag.dy = dy;

    if (drag.entity === "segment") {
      const line = drag.g as SVGLineElement;
      const seg = diagram.segments?.[drag.idx];
      if (!seg) return;

      line.setAttribute("x1", String(seg.a[0] + dx));
      line.setAttribute("y1", String(seg.a[1] + dy));
      line.setAttribute("x2", String(seg.b[0] + dx));
      line.setAttribute("y2", String(seg.b[1] + dy));

      // Move endpoint point markers in sync (during drag)
      for (const el of drag.linkedPointEls) {
        const cx = Number(el.getAttribute("cx"));
        const cy = Number(el.getAttribute("cy"));
        el.setAttribute("cx", String(cx + dx));
        el.setAttribute("cy", String(cy + dy));
      }
      return;
    }

    if (drag.entity === "polygon") {
      const polyEl = drag.g as SVGPolygonElement;
      const poly = diagram.polygons?.[drag.idx];
      if (!poly) return;

      const pts = (poly.points ?? []).map(([x, y]) => `${x + dx},${y + dy}`).join(" ");
      polyEl.setAttribute("points", pts);

      // Move vertex labels in sync (during drag)
      for (const t of drag.linkedLabelEls) {
        const lx = Number(t.getAttribute("x"));
        const ly = Number(t.getAttribute("y"));
        t.setAttribute("x", String(lx + dx));
        t.setAttribute("y", String(ly + dy));
      }
      return;
    }

    if (drag.entity === "rect") {
      const el = drag.g as SVGRectElement;
      const r = diagram.rects?.[drag.idx];
      if (!r) return;
      el.setAttribute("x", String(r.x + dx));
      el.setAttribute("y", String(r.y + dy));
      return;
    }

    if (drag.entity === "circle") {
      const el = drag.g as SVGCircleElement;
      const c = diagram.circles?.[drag.idx];
      if (!c) return;
      el.setAttribute("cx", String(c.cx + dx));
      el.setAttribute("cy", String(c.cy + dy));
      return;
    }

    if (drag.entity === "ellipse") {
      const el = drag.g as SVGEllipseElement;
      const e = diagram.ellipses?.[drag.idx];
      if (!e) return;
      el.setAttribute("cx", String(e.cx + dx));
      el.setAttribute("cy", String(e.cy + dy));
      return;
    }

    if (drag.entity === "point") {
      const el = drag.g as SVGCircleElement;
      const pt = diagram.points?.[drag.idx];
      if (!pt) return;
      el.setAttribute("cx", String(pt.at[0] + dx));
      el.setAttribute("cy", String(pt.at[1] + dy));
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

    // Bake entity delta into spec, then rerender so DOM goes back to clean canonical state
    if (drag.kind === "entity") {
      const { entity, idx, dx, dy, linkedPointIdx, linkedLabelIdx } = drag;
      applyDeltaToSpec(entity, idx, dx, dy, linkedPointIdx, linkedLabelIdx);

      // currentDiagram still points to this same object; but be safe anyway
      if (currentDiagram) mountDiagram(currentDiagram);
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
