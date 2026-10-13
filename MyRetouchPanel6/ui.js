/*
 * My Retouch Panel 6 — UI-слой: темы, вкладки, Visual Aid, флаяуты,
 * New Skin drawer, LCD-экран, тултипы. Открытый код.
 */

/* ---------- LCD-экран ---------- */

function screenSay(text, title) {
  const l2 = document.getElementById("lcd2");
  if (l2 && text) l2.textContent = text;
  if (title) {
    const l1 = document.getElementById("lcd1");
    if (l1) l1.textContent = title;
  }
}
globalThis.screenSay = screenSay;

function dismissNotice() {
  const scr = document.getElementById("raScreen");
  if (scr) scr.style.display = "none";
  const rst = document.getElementById("noticeReset");
  if (rst) rst.style.display = "block";
}
globalThis.dismissNotice = dismissNotice;

function resetNotices() {
  const scr = document.getElementById("raScreen");
  if (scr) scr.style.display = "";
  const rst = document.getElementById("noticeReset");
  if (rst) rst.style.display = "";
  screenSay("Ready. Happy Retouching!");
}
globalThis.resetNotices = resetNotices;

function screenBtnGo() {
  openUrl("https://instagram.com/layshaphoto");
}
globalThis.screenBtnGo = screenBtnGo;

// кнопка Auto Skin Mask вызывает глобальную функцию напрямую
globalThis.autoSkinMask = () => runScript("autoSkinMask");

/* ---------- Тема (light / dark / black) ---------- */

const THEMES = ["", "theme-dark", "theme-black"];
let themeIdx = 0;

function applyTheme() {
  document.body.classList.remove("theme-dark", "theme-black");
  if (THEMES[themeIdx]) document.body.classList.add(THEMES[themeIdx]);
  try {
    localStorage.setItem("mrp6.theme", String(themeIdx));
  } catch (e) {}
}

let _themeTogT = 0;
function toggleUI() {
  const now = Date.now();
  if (now - _themeTogT < 500) return; // антидребезг двойного клика UXP
  _themeTogT = now;
  themeIdx = (themeIdx + 1) % THEMES.length;
  applyTheme();
  screenSay("Theme: " + (THEMES[themeIdx] || "light"));
}
globalThis.toggleUI = toggleUI;

try {
  themeIdx = Math.min(THEMES.length - 1, parseInt(localStorage.getItem("mrp6.theme") || "0", 10) || 0);
} catch (e) {}

/* ---------- Вкладки Skin / Face ---------- */

function selectTab(name) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.getAttribute("data-tab") === name));
  document.querySelectorAll(".tabpane").forEach((p) => {
    p.style.display = p.getAttribute("data-pane") === name ? "block" : "none";
  });
  const zone = document.querySelector(".zone");
  if (zone) zone.classList.toggle("zone-face", name === "face");
}
globalThis.selectTab = selectTab;

/* ---------- Visual Aid (радио + запуск) ---------- */

let vaChoice = "1";

function vaSelect(v) {
  vaChoice = v;
  document.querySelectorAll(".va-opt").forEach((o) => o.classList.toggle("selected", o.getAttribute("data-va") === v));
}
globalThis.vaSelect = vaSelect;

function vaRun() {
  const map = { "1": "VisualAidD", "2": "VisualAidDStrong", c: "VisualAidAlt", s: "SolarCurve" };
  runScript(map[vaChoice] || "VisualAidD");
  screenSay("Visual Aid " + vaChoice.toUpperCase());
}
globalThis.vaRun = vaRun;

/* ---------- New Skin drawer (слайдеры частотки) ---------- */

globalThis.NS = { radius: 8, texture: 50 };

function nsBuild() {
  const d = document.getElementById("nsDrawer");
  if (!d || d.dataset.built) return;
  d.dataset.built = "1";
  d.innerHTML = `
    <div class="nsd-line">NEW SKIN — частотное разложение</div>
    <div class="nsd-rule"></div>
    <div class="nsd-row">
      <div class="nsd-box">Radius <span id="nsRadVal">8</span>px</div>
      <div style="position:relative; height:12px; margin:4px 0;">
        <div class="nsd-bar"></div>
        <input id="nsRad" type="range" min="1" max="50" value="8"
               style="width:100%; position:absolute; top:0; opacity:0.6;" />
      </div>
    </div>
    <div class="nsd-row">
      <div class="nsd-box">Median</div>
      <label class="nsd-tog"><input id="nsMed" type="checkbox" /> использовать Median вместо Blur</label>
    </div>
    <div class="nsd-rule"></div>
    <div class="nsd-row" style="text-align:center;">
      <span style="cursor:pointer; text-decoration:underline;" id="nsGo">Создать слои FS</span>
    </div>`;
  const rad = d.querySelector("#nsRad");
  rad.addEventListener("input", () => {
    globalThis.NS.radius = parseInt(rad.value, 10) || 8;
    d.querySelector("#nsRadVal").textContent = rad.value;
  });
  d.querySelector("#nsMed").addEventListener("change", (e) => {
    globalThis.NS.median = e.target.checked;
  });
  d.querySelector("#nsGo").addEventListener("click", () => {
    nsToggle();
    runScript(globalThis.NS.median ? "FS_Median" : "FS_Gausian");
  });
}

let _nsTogT = 0;
function nsToggle() {
  const now = Date.now();
  if (now - _nsTogT < 500) return; // антидребезг двойного клика UXP
  _nsTogT = now;
  const d = document.getElementById("nsDrawer");
  if (!d) return;
  nsBuild();
  d.style.display = d.style.display === "block" ? "none" : "block";
}
globalThis.nsToggle = nsToggle;

/* ---------- Флаяуты инструментов (data-fly) ---------- */

const FLYOUTS = {
  brush: [
    ["Brush", "paintbrushTool"],
    ["Mixer Brush", "mixerBrushTool"],
    ["Pencil", "pencilTool"],
  ],
  heal: [
    ["Spot Healing", "spotHealingBrushTool"],
    ["Healing Brush", "healingBrushTool"],
    ["Patch", "patchTool"],
  ],
  lasso: [
    ["Lasso", "lassoTool"],
    ["Polygonal Lasso", "polygonLassoTool"],
    ["Magnetic Lasso", "magneticLassoTool"],
  ],
  objsel: [
    ["Object Selection", "objectSelectionTool"],
    ["Quick Select", "quickSelectTool"],
    ["Magic Wand", "magicWandTool"],
  ],
  marquee: [
    ["Rectangular", "marqueeRectTool"],
    ["Elliptical", "marqueeEllipTool"],
    ["Single Row", "marqueeSingleRowTool"],
    ["Single Column", "marqueeSingleColumnTool"],
  ],
};

let flyEl = null;

function flyClose() {
  if (flyEl) {
    flyEl.remove();
    flyEl = null;
  }
}

function flyOpen(anchor, kind) {
  flyClose();
  const items = FLYOUTS[kind];
  if (!items) return;
  flyEl = document.createElement("div");
  flyEl.className = "fly-menu";
  Object.assign(flyEl.style, {
    position: "absolute", zIndex: 100, background: "#dfe3d4", borderRadius: "4px",
    padding: "3px", boxShadow: "0 2px 8px rgba(0,0,0,.4)",
  });
  items.forEach(([label, tool]) => {
    const it = document.createElement("div");
    it.className = "fly-item";
    it.textContent = label;
    it.addEventListener("click", () => {
      flyClose();
      if (globalThis.runScript) {
        // прямой выбор инструмента
        globalThis.runScript("__tool:" + tool);
      }
      screenSay(label);
    });
    flyEl.appendChild(it);
  });
  document.getElementById("panel").appendChild(flyEl);
  const r = anchor.getBoundingClientRect();
  const pr = document.getElementById("panel").getBoundingClientRect();
  flyEl.style.left = Math.max(0, r.left - pr.left - 10) + "px";
  flyEl.style.top = r.bottom - pr.top + 2 + "px";
}

document.addEventListener("click", (e) => {
  const fly = e.target.closest("[data-fly]");
  if (fly) {
    e.stopPropagation();
    flyOpen(fly, fly.getAttribute("data-fly"));
    return;
  }
  if (!e.target.closest(".fly-menu")) flyClose();
});

/* ---------- Тултипы (data-tip) ---------- */

let tipEl = null;

document.addEventListener("mouseover", (e) => {
  const t = e.target.closest("[data-tip]");
  if (!t) return;
  if (!tipEl) {
    tipEl = document.createElement("div");
    Object.assign(tipEl.style, {
      position: "fixed", zIndex: 999, pointerEvents: "none",
      background: "#111", color: "#eee", fontSize: "10px", padding: "3px 7px",
      borderRadius: "3px", maxWidth: "180px",
    });
    document.body.appendChild(tipEl);
  }
  tipEl.textContent = t.getAttribute("data-tip");
  tipEl.style.display = "block";
});

document.addEventListener("mousemove", (e) => {
  if (tipEl && tipEl.style.display === "block") {
    tipEl.style.left = Math.min(e.clientX + 10, 60) + "px";
    tipEl.style.top = e.clientY + 14 + "px";
  }
});

document.addEventListener("mouseout", (e) => {
  if (tipEl && e.target.closest && e.target.closest("[data-tip]")) tipEl.style.display = "none";
});

/* ---------- Старт ---------- */

document.addEventListener("DOMContentLoaded", () => {
  // UXP не выполняет inline onclick — переводим их на addEventListener
  document.querySelectorAll("[onclick]").forEach((el) => {
    const code = el.getAttribute("onclick");
    el.removeAttribute("onclick");
    el.addEventListener("click", (ev) => {
      ev.stopPropagation();
      try {
        new Function(code)();
      } catch (e) {
        console.error("[onclick]", code, e);
      }
    });
  });
  applyTheme();
  selectTab("skin");
  vaSelect("1");
  const rst = document.getElementById("noticeReset");
  if (rst) rst.style.display = "none";
});
