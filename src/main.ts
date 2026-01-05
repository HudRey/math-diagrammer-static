import "./style.css";
import { renderDiagramSVG, validateSpec, type DiagramSpec } from "./renderDiagram";
import { templates } from "./templates";

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <div class="layout">
    <div class="panel">
      <h3>Math Diagram Renderer (Zero Cost)</h3>
      <div class="sub">
        Workflow: choose a template → copy the ChatGPT prompt → paste returned JSON → render → download SVG/PNG.
      </div>

      <details open>
        <summary>1) Generate a ChatGPT prompt</summary>
        <div class="sectionBody">
          <label>Template</label>
          <select id="template"></select>

          <label>Diagram description (plain English)</label>
          <textarea id="desc" style="height: 120px;"></textarea>

          <div class="row">
            <button id="makePrompt">Build Prompt</button>
            <button id="copyPrompt">Copy Prompt</button>
          </div>

          <label>Prompt to paste into ChatGPT</label>
          <textarea id="promptOut" style="height: 170px;" readonly></textarea>
          <div class="smallNote">Tip: Ask ChatGPT to return <code>ONLY JSON</code>.</div>
        </div>
      </details>

      <details open>
        <summary>2) Paste JSON and render</summary>
        <div class="sectionBody">
          <div class="row">
            <button id="loadExample">Load Example JSON</button>
            <button id="renderBtn">Render</button>
          </div>

          <label>Diagram JSON</label>
          <textarea id="json"></textarea>

          <div id="err" class="err"></div>

          <div class="row">
            <button id="dlSvg">Download SVG</button>
            <button id="dlPng">Download PNG</button>
          </div>
        </div>
      </details>
    </div>

    <div class="previewWrap">
      <div class="preview" id="preview"></div>
    </div>
  </div>
`;

const templateEl = document.getElementById("template") as HTMLSelectElement;
const descEl = document.getElementById("desc") as HTMLTextAreaElement;
const promptOutEl = document.getElementById("promptOut") as HTMLTextAreaElement;
const jsonEl = document.getElementById("json") as HTMLTextAreaElement;
const previewEl = document.getElementById("preview") as HTMLDivElement;
const errEl = document.getElementById("err") as HTMLDivElement;

const btnMakePrompt = document.getElementById("makePrompt") as HTMLButtonElement;
const btnCopyPrompt = document.getElementById("copyPrompt") as HTMLButtonElement;
const btnLoadExample = document.getElementById("loadExample") as HTMLButtonElement;
const btnRender = document.getElementById("renderBtn") as HTMLButtonElement;
const btnSvg = document.getElementById("dlSvg") as HTMLButtonElement;
const btnPng = document.getElementById("dlPng") as HTMLButtonElement;

let lastSVG = "";

// ---------- localStorage helpers ----------
const LS = {
  template: "mdr.template",
  desc: "mdr.desc",
  prompt: "mdr.prompt",
  json: "mdr.json",
};

function saveState() {
  localStorage.setItem(LS.template, templateEl.value);
  localStorage.setItem(LS.desc, descEl.value);
  localStorage.setItem(LS.prompt, promptOutEl.value);
  localStorage.setItem(LS.json, jsonEl.value);
}

function loadState() {
  const t = localStorage.getItem(LS.template);
  const d = localStorage.getItem(LS.desc);
  const p = localStorage.getItem(LS.prompt);
  const j = localStorage.getItem(LS.json);

  if (t) templateEl.value = t;
  if (d) descEl.value = d;
  if (p) promptOutEl.value = p;
  if (j) jsonEl.value = j;
}

function getTemplate() {
  const t = templates.find((x) => x.id === templateEl.value);
  return t ?? templates[0];
}

// ---------- UI init ----------
for (const t of templates) {
  const opt = document.createElement("option");
  opt.value = t.id;
  opt.textContent = t.name;
  templateEl.appendChild(opt);
}

// Default initial values from first template
templateEl.value = templates[0].id;
descEl.value = templates[0].defaultDescription;
promptOutEl.value = templates[0].promptBuilder(descEl.value);
jsonEl.value = templates[0].starterJSON;

// Restore prior session if exists (overrides defaults)
loadState();

// Ensure prompt matches restored template + desc
{
  const t = getTemplate();
  if (!descEl.value.trim()) descEl.value = t.defaultDescription;
  promptOutEl.value = t.promptBuilder(descEl.value.trim());
  if (!jsonEl.value.trim()) jsonEl.value = t.starterJSON;
  saveState();
}

templateEl.onchange = () => {
  const t = getTemplate();
  descEl.value = t.defaultDescription;
  promptOutEl.value = t.promptBuilder(descEl.value.trim());
  jsonEl.value = t.starterJSON;
  saveState();
  render();
};

// Auto-update prompt as the description changes
descEl.oninput = () => {
  const t = getTemplate();
  promptOutEl.value = t.promptBuilder(descEl.value.trim());
  saveState();
};

jsonEl.oninput = () => saveState();

btnMakePrompt.onclick = () => {
  const t = getTemplate();
  promptOutEl.value = t.promptBuilder(descEl.value.trim());
  saveState();
};

btnCopyPrompt.onclick = async () => {
  try {
    await navigator.clipboard.writeText(promptOutEl.value);
    btnCopyPrompt.textContent = "Copied!";
    setTimeout(() => (btnCopyPrompt.textContent = "Copy Prompt"), 900);
  } catch {
    promptOutEl.focus();
    promptOutEl.select();
    document.execCommand("copy");
  }
};

btnLoadExample.onclick = () => {
  const t = getTemplate();
  jsonEl.value = t.starterJSON;
  saveState();
  render();
};

function render() {
  errEl.textContent = "";
  try {
    const raw = jsonEl.value.trim();
    if (!raw) {
      previewEl.innerHTML = "";
      lastSVG = "";
      return;
    }

    const obj = JSON.parse(raw);
    const spec = validateSpec(obj) as DiagramSpec;

    lastSVG = renderDiagramSVG(spec);
    previewEl.innerHTML = lastSVG;
  } catch (e: any) {
    previewEl.innerHTML = "";
    lastSVG = "";
    errEl.textContent = e?.message ?? String(e);
  }
}

btnRender.onclick = render;

btnSvg.onclick = () => {
  if (!lastSVG) return;
  const blob = new Blob([lastSVG], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "diagram.svg";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

btnPng.onclick = async () => {
  if (!lastSVG) return;

  const svgBlob = new Blob([lastSVG], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  const img = new Image();
  await new Promise<void>((res, rej) => {
    img.onload = () => res();
    img.onerror = () => rej(new Error("SVG→PNG conversion blocked by browser. Download SVG instead."));
    img.src = url;
  });

  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;

  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);

  URL.revokeObjectURL(url);

  canvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "diagram.png";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }, "image/png");
};

// First render on load
render();
