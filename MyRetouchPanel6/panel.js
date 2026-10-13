/*
 * My Retouch Panel — собственная панель ретуши для Photoshop (UXP)
 * Все операции выполняются через Photoshop Action Descriptors (batchPlay).
 * Без лицензий, без сети, без обфускации.
 */

const { app, action, core } = require("photoshop");
const { entrypoints } = require("uxp");

/* ---------- Отладочный лог в файл (читается снаружи, без консоли) ---------- */

let _logFile = null;
async function logLine(msg) {
  try {
    const fs = require("uxp").storage.localFileSystem;
    if (!_logFile) {
      const folder = await fs.getDataFolder();
      _logFile = await folder.createFile("mrp-debug.log", { overwrite: true });
    }
    await _logFile.write(
      new Date().toISOString().slice(11, 19) + " " + msg + "\n",
      { append: true }
    );
  } catch (e) {}
}
logLine("=== panel loaded ===");

/* ---------- Базовые помощники ---------- */

// Выполнить пачку дескрипторов, не роняя панель при ошибке.
// synchronousExecution:false — при true Photoshop 27 показывает собственные
// модальные диалоги об ошибках ("could not complete your request") в обход
// dialogOptions:dontDisplay; при false ошибки приходят в промис/результаты.
async function bp(descriptors, options = {}) {
  const res = await action.batchPlay(descriptors, {
    synchronousExecution: false,
    ...options,
  });
  // per-descriptor ошибки приходят в результатах — логируем с указанием команды
  try {
    res.forEach((r, i) => {
      if (r && (r.message || r.result === false)) {
        logLine(
          "BPERR " + (descriptors[i] && descriptors[i]._obj) + " :: " + (r.message || "failed")
        );
      }
    });
  } catch (e) {}
  return res;
}

// Диалоги Photoshop (Liquify, Image Size, Save) нельзя вызывать изнутри
// executeAsModal — модалка в модалке виснет. Открываем их чуть позже, уже
// вне модального контекста.
function showDialogLater(desc, delay = 350) {
  setTimeout(() => {
    // liquify и др. "модифицирующие" события разрешены только внутри модального
    // скоупа — открываем ОТДЕЛЬНЫЙ executeAsModal (не вложенный, а новый)
    core
      .executeAsModal(async () => {
        await action.batchPlay([desc], { synchronousExecution: false });
      }, { commandName: "My Retouch" })
      .catch((e) => logLine("dialog err: " + (e && e.message)));
  }, delay);
}

// Обёртка: код уже выполняется внутри executeAsModal (runScript оборачивает всё),
// поэтому modal просто выполняет функцию, ловя ошибки в консоль.
async function modal(name, fn) {
  try {
    await fn();
  } catch (e) {
    console.error(`[${name}]`, e);
    throw e;
  }
}

const enumLyr = { _ref: "layer", _enum: "ordinal", _value: "targetEnum" };
const dontDisplay = { _options: { dialogOptions: "dontDisplay" } };

/* ---------- Низкоуровневые дескрипторы ---------- */

const dMakeLayer = () => ({ _obj: "make", _target: [{ _ref: "layer" }], ...dontDisplay });

const dRenameLayer = (name) => ({
  _obj: "set",
  _target: [enumLyr],
  to: { _obj: "layer", name },
  ...dontDisplay,
});

const dDeleteLayer = () => ({ _obj: "delete", _target: [enumLyr], ...dontDisplay });

const dDuplicateLayer = () => ({ _obj: "duplicate", _target: [enumLyr], ...dontDisplay });

const dSetBlendMode = (mode) => ({
  _obj: "set",
  _target: [enumLyr],
  to: { _obj: "layer", mode: { _enum: "blendMode", _value: mode } },
  ...dontDisplay,
});

const dSetOpacity = (pct) => ({
  _obj: "set",
  _target: [enumLyr],
  to: { _obj: "layer", opacity: { _unit: "percentUnit", _value: pct } },
  ...dontDisplay,
});

// Удалить текущую маску слоя (в PS 27+ adj-слой создаётся уже с белой маской —
// перед созданием новой маски старую нужно удалить, как это делает оригинал)
const dDeleteMask = () => ({
  _obj: "delete",
  _target: [{ _ref: "channel", _enum: "channel", _value: "mask" }],
  ...dontDisplay,
});

// Чёрная маска «скрыть всё» на текущем слое
const dMaskHideAll = () => ({
  _obj: "make",
  new: { _class: "channel" },
  at: { _ref: "channel", _enum: "channel", _value: "mask" },
  using: { _enum: "userMaskEnabled", _value: "hideAll" },
  ...dontDisplay,
});

// Белая маска «показать всё»
const dMaskRevealAll = () => ({
  _obj: "make",
  new: { _class: "channel" },
  at: { _ref: "channel", _enum: "channel", _value: "mask" },
  using: { _enum: "userMaskEnabled", _value: "revealAll" },
  ...dontDisplay,
});

const dSelectAll = () => ({
  _obj: "set",
  _target: [{ _ref: "channel", _property: "selection" }],
  to: { _enum: "ordinal", _value: "allEnum" },
  ...dontDisplay,
});

const dDeselect = () => ({
  _obj: "set",
  _target: [{ _ref: "channel", _property: "selection" }],
  to: { _enum: "ordinal", _value: "none" },
  ...dontDisplay,
});

const dFillGray50 = () => ({
  _obj: "fill",
  using: { _enum: "fillContents", _value: "gray50" },
  mode: { _enum: "blendMode", _value: "normal" },
  opacity: { _unit: "percentUnit", _value: 100 },
  ...dontDisplay,
});

// Выбор инструмента по его ID (правильный способ — _obj:"select")
const dSelectTool = (toolId) => ({
  _obj: "select",
  _target: { _ref: toolId },
  ...dontDisplay,
});

// Корректирующий слой «по умолчанию»
const dMakeAdj = (type) => ({
  _obj: "make",
  _target: [{ _ref: "adjustmentLayer" }],
  using: {
    _obj: "adjustmentLayer",
    type: { _obj: type, presetKind: { _enum: "presetKindType", _value: "presetKindDefault" } },
  },
  ...dontDisplay,
});

// Задать кривую текущему adj. слою (points: [[x,y],...], x/y 0..255)
const dSetCurve = (points) => ({
  _obj: "set",
  _target: { _ref: "adjustmentLayer", _enum: "ordinal", _value: "targetEnum" },
  to: {
    _obj: "curves",
    presetKind: { _enum: "presetKindType", _value: "presetKindCustom" },
    adjustment: [
      {
        _obj: "curvesAdjustment",
        channel: { _ref: "channel", _enum: "channel", _value: "composite" },
        curve: points.map(([h, v]) => ({ _obj: "curvePoint", horizontal: h, vertical: v })),
      },
    ],
  },
  ...dontDisplay,
});

// Hue/Sat: сдвиги по мастер-каналу
const dSetHueSat = (hue, saturation, lightness) => ({
  _obj: "set",
  _target: { _ref: "adjustmentLayer", _enum: "ordinal", _value: "targetEnum" },
  to: {
    _obj: "hueSaturation",
    presetKind: { _enum: "presetKindType", _value: "presetKindCustom" },
    adjustment: [{ _obj: "hueSatAdjustmentV2", hue, saturation, lightness }],
  },
  ...dontDisplay,
});

// Заливка-цвет (solid color layer)
const dMakeSolidFill = (r, g, b) => ({
  _obj: "make",
  _target: [{ _ref: "contentLayer" }],
  using: {
    _obj: "contentLayer",
    type: { _obj: "solidColorLayer", color: { _obj: "RGBColor", red: r, green: g, blue: b } },
  },
  ...dontDisplay,
});

const dGaussianBlur = (px) => ({
  _obj: "gaussianBlur",
  radius: { _unit: "pixelsUnit", _value: px },
  ...dontDisplay,
});

const dMedian = (px) => ({ _obj: "median", radius: { _unit: "pixelsUnit", _value: px }, ...dontDisplay });

const dHighPass = (px) => ({ _obj: "highPass", radius: { _unit: "pixelsUnit", _value: px }, ...dontDisplay });

const dAddNoise = (pct) => ({
  _obj: "addNoise",
  noise: { _unit: "percentUnit", _value: pct },
  distribution: { _enum: "distribution", _value: "gaussian" },
  monochromatic: true,
  ...dontDisplay,
});

// Apply Image: вычесть слой lowName (для частотного разложения)
// Два нюанса PS27: "to" — ссылка на RGB-КАНАЛ исходного слоя,
// а режим задаётся ключом "calculation" (НЕ "blending" — он игнорируется).
const dApplyImageSubtract = (lowLayerRef) => ({
  _obj: "applyImageEvent",
  with: {
    _obj: "calculation",
    to: {
      _ref: [
        { _ref: "channel", _enum: "channel", _value: "RGB" },
        lowLayerRef,
      ],
    },
    calculation: { _enum: "calculation", _value: "subtract" },
    scale: 2,
    offset: 128,
  },
  ...dontDisplay,
});

// Сгруппировать выделенные/текущие слои
const dGroup = () => ({
  _obj: "make",
  _target: [{ _ref: "layerSection" }],
  from: { _ref: "layer", _enum: "ordinal", _value: "targetEnum" },
  ...dontDisplay,
});

const dSelectBackLayer = () => ({
  _obj: "select",
  _target: [{ _ref: "layer", _enum: "ordinal", _value: "backEnum" }],
  makeVisible: false,
  ...dontDisplay,
});

// Добавить/убавить выделению RGB-канал (Ctrl/Cmd-клик по каналу)
const dChannelToSelection = () => ({
  _obj: "set",
  _target: [{ _ref: "channel", _property: "selection" }],
  to: { _ref: "channel", _enum: "channel", _value: "RGB" },
  ...dontDisplay,
});

const dAddChannel = () => ({
  _obj: "addTo",
  _target: [{ _ref: "channel", _property: "selection" }],
  to: { _ref: "channel", _enum: "channel", _value: "RGB" },
  ...dontDisplay,
});

const dSubtractChannel = () => ({
  _obj: "subtractFrom",
  _target: [{ _ref: "channel", _property: "selection" }],
  to: { _ref: "channel", _enum: "channel", _value: "RGB" },
  ...dontDisplay,
});

// Пересечение выделения само с собой (уплотнение luminosity)
const dIntersectRGB = () => ({
  _obj: "intersect",
  _target: [{ _ref: "channel", _property: "selection" }],
  with: { _ref: "channel", _enum: "channel", _value: "RGB" },
  ...dontDisplay,
});

/* ---------- Более крупные строительные блоки ---------- */

async function makeCurvesAdj(name, points, hideAll) {
  const r = await bp([dMakeAdj("curves"), dSetCurve(points), dRenameLayer(name), ...(hideAll ? [dDeleteMask(), dMaskHideAll()] : [])]);
  return r && r[0] && r[0].layerID;
}

async function makeHueSatAdj(name, h, s, l, hideAll) {
  await bp([
    {
      _obj: "make",
      _target: { _ref: "adjustmentLayer" },
      using: {
        _obj: "adjustmentLayer",
        type: {
          _obj: "hueSaturation",
          presetKind: { _enum: "presetKindType", _value: "presetKindDefault" },
          colorize: false,
        },
      },
      ...dontDisplay,
    },
    dSetHueSat(h, s, l),
    dRenameLayer(name),
    ...(hideAll ? [dDeleteMask(), dMaskHideAll()] : []),
  ]);
}

async function makeGrayLayer(name, blendMode) {
  // fillNeutral: заливка нейтральным для режима (50% gray для softLight/overlay)
  await bp([
    {
      _obj: "make",
      _target: { _ref: "layer" },
      using: {
        _obj: "layer",
        name,
        mode: { _enum: "blendMode", _value: blendMode },
        fillNeutral: true,
      },
      ...dontDisplay,
    },
  ]);
}

async function selectToolAndFG(toolId, r, g, b) {
  await bp([
    dSelectTool(toolId),
    {
      _obj: "set",
      _target: [{ _ref: "color", _property: "foregroundColor" }],
      to: { _obj: "RGBColor", red: r, green: g, blue: b },
      ...dontDisplay,
    },
  ]);
}

// Частотное разложение: low (blur|median), high (apply image subtract + linear light)
// Слои адресуем по ID, а не по имени: при повторном запуске на том же документе
// имена "FS Low/High Frequency" уже заняты и выбор по имени хватает чужие слои.
async function frequencySeparation(radius, useMedian) {
  const LOW = "FS Low Frequency";
  const HIGH = "FS High Frequency";
  const layerRef = (id, name) => ({ _ref: "layer", ...(id ? { _id: id } : { _name: name }) });
  await modal("Frequency Separation", async () => {
    // База частотки:
    //  — активный пиксельный слой → обычный дубль (mergeVisible на единственном
    //    заблокированном Background в PS отвечает "not currently available");
    //  — активная группа → штамп видимого (дубль группы всё ломает).
    // Дубль — только с обычного пиксельного слоя (вкл. Background).
    // Группы, смарт-объекты и корректирующие слои → штамп видимого
    // (дубль смарт-объекта ломает Apply Image, дубль группы — всю структуру).
    // Исключение: документ из одного слоя — там mergeVisible недоступен.
    let useStamp = false;
    try {
      const doc = app.activeDocument;
      const al = (doc.activeLayers || [])[0];
      const isPixel = !al || al.kind === "pixel";
      useStamp = !isPixel && doc.layers.length > 1;
      logLine("FS active=[" + (al && al.name) + "] kind=" + (al && al.kind) + " layers=" + doc.layers.length + " stamp=" + useStamp);
    } catch (e) {
      logLine("FS detect err: " + (e && e.message));
    }
    const r1 = useStamp
      ? await bp([{ _obj: "mergeVisible", duplicate: true, ...dontDisplay }, dRenameLayer(LOW)])
      : await bp([dDuplicateLayer(), dRenameLayer(LOW)]);
    const lowID = r1 && r1[0] && r1[0].layerID;
    const r2 = await bp([dDuplicateLayer(), dRenameLayer(HIGH)]);
    const highID = r2 && r2[0] && r2[0].layerID;
    await bp([
      { _obj: "select", _target: [layerRef(lowID, LOW)], makeVisible: false, ...dontDisplay },
      useMedian ? dMedian(radius) : dGaussianBlur(radius),
      // вернуться на high-слой
      { _obj: "select", _target: [layerRef(highID, HIGH)], makeVisible: false, ...dontDisplay },
      dApplyImageSubtract(layerRef(lowID, LOW)),
      dSetBlendMode("linearLight"),
    ]);
    // сгруппировать LOW+HIGH
    await bp([
      {
        _obj: "select",
        _target: [layerRef(lowID, LOW)],
        selectionModifier: { _enum: "selectionModifierType", _value: "addToSelectionContinuous" },
        makeVisible: false,
        ...dontDisplay,
      },
      dGroup(),
      dRenameLayer("Frequency Separation"),
    ]);
  });
}

// Штамп видимого с фолбэком: на документе из единственного Background
// mergeVisible недоступен — тогда просто дублируем слой
async function smartStamp(name) {
  let singleLayer = false;
  try {
    const doc = app.activeDocument;
    const al = (doc.activeLayers || [])[0];
    singleLayer = doc.layers.length === 1 && !(al && (al.isGroup === true || al.typename === "LayerSet" || al.layers));
  } catch (e) {}
  if (singleLayer) return await bp([dDuplicateLayer(), dRenameLayer(name)]);
  return await bp([{ _obj: "mergeVisible", duplicate: true, ...dontDisplay }, dRenameLayer(name)]);
}

/* ---------- Карта команд ---------- */

// Если активен не pixel-слой (кривая, группа), сначала выбираем верхний pixel-слой —
// иначе autoCutout и подобные падают с "not currently available"
async function ensurePixelLayer() {
  try {
    const doc = app.activeDocument;
    const al = (doc.activeLayers || [])[0];
    if (al && al.kind === "pixel") return;
    const stack = [...(doc.layers || [])];
    while (stack.length) {
      const l = stack.shift();
      if (l.kind === "pixel") {
        await bp([{ _obj: "select", _target: [{ _ref: "layer", _id: l.id }], makeVisible: false, ...dontDisplay }]);
        return;
      }
      if (l.layers) stack.push(...l.layers);
    }
  } catch (e) {}
}

const Scripts = {
  /* Инструменты */
  BrushTool: () => bp([dSelectTool("paintbrushTool")]),
  SpotHealingBrushTool: () => bp([dSelectTool("spotHealingBrushTool")]),
  RemoveTool: () => bp([dSelectTool("removeTool")]),
  CloneStampTool: () => bp([dSelectTool("cloneStampTool")]),
  CropTool: () => bp([dSelectTool("cropTool")]),
  LassoTool: () => bp([dSelectTool("lassoTool")]),
  ObjectSelectionTool: () => bp([dSelectTool("objectSelectionTool")]),
  SelectionBrushTool: () => bp([dSelectTool("selectionBrushTool")]),
  RectMarqueeTool: () => bp([dSelectTool("marqueeRectTool")]),
  PenTool: () => bp([dSelectTool("penTool")]),
  SelectSubject: async () => {
    await ensurePixelLayer();
    await bp([{ _obj: "autoCutout", sampleAllLayers: false, ...dontDisplay }]);
    const chk = await bp([{ _obj: "get", _target: [{ _ref: "document", _enum: "ordinal", _value: "targetEnum" }], ...dontDisplay }]);
    if (!(chk && chk[0] && chk[0].hasSelection)) uiStatus("Select Subject не сработал — выделения нет");
  },

  /* Dodge & Burn */
  DBCurves: async () =>
    modal("DB Curves", async () => {
      const dodgeID = await makeCurvesAdj("Dodge", [[0, 0], [128, 168], [255, 255]], true);
      const burnID = await makeCurvesAdj("Burn", [[0, 0], [128, 88], [255, 255]], true);
      await bp([
        {
          _obj: "select",
          _target: [{ _ref: "layer", ...(dodgeID ? { _id: dodgeID } : { _name: "Dodge" }) }],
          selectionModifier: { _enum: "selectionModifierType", _value: "addToSelectionContinuous" },
          makeVisible: false,
          ...dontDisplay,
        },
        dGroup(),
        dRenameLayer("Dodge & Burn"),
      ]);
      await selectToolAndFG("paintbrushTool", 255, 255, 255);
    }),

  Dodge: () => modal("Dodge", () => makeCurvesAdj("Dodge", [[0, 0], [128, 168], [255, 255]], true)),
  Burn: () => modal("Burn", () => makeCurvesAdj("Burn", [[0, 0], [128, 88], [255, 255]], true)),
  DBBrush: () => selectToolAndFG("paintbrushTool", 255, 255, 255),

  GlobalDB: () => modal("Global D&B", () => makeGrayLayer("D&B Global", "softLight")),
  GreyLayer: () => modal("Gray 50%", () => makeGrayLayer("Gray 50% Overlay", "overlay")),

  VisualAid: () =>
    modal("Visual Aid", async () => {
      await bp([dMakeSolidFill(0, 0, 0), dRenameLayer("Visual Aid"), dSetBlendMode("color")]);
    }),

  VisualAidStrong: () =>
    modal("Visual Aid Strong", async () => {
      await bp([dMakeSolidFill(0, 0, 0), dRenameLayer("Visual Aid Strong"), dSetBlendMode("color")]);
      await makeCurvesAdj("VA Contrast", [[0, 0], [90, 30], [165, 225], [255, 255]], false);
    }),

  VisualAidAlt: () =>
    modal("Visual Aid Alt", async () => {
      await bp([dMakeSolidFill(128, 128, 128), dRenameLayer("Visual Aid Alt"), dSetBlendMode("luminosity")]);
    }),

  /* Skin work & Frequency Separation */
  FSNewSkin: () => frequencySeparation(8, false),
  FSMedian: () => frequencySeparation(10, true),
  FSCustom: () => {
    const v = parseInt(document.getElementById("fsRadius").value, 10);
    frequencySeparation(Number.isFinite(v) ? Math.min(50, Math.max(1, v)) : 8, false);
  },

  AddTexture: () =>
    modal("Add Texture", async () => {
      await bp([
        {
          _obj: "make",
          _target: { _ref: "layer" },
          using: {
            _obj: "layer",
            name: "Skin Texture",
            mode: { _enum: "blendMode", _value: "overlay" },
            fillNeutral: true,
          },
          ...dontDisplay,
        },
        dAddNoise(3),
        dSetOpacity(40),
      ]);
    }),

  RemoveHairs: async () => {
    await bp([dMakeLayer(), dRenameLayer("Remove Hairs")]);
    await bp([dSelectTool("spotHealingBrushTool")]);
  },

  /* Selections & Masking */
  Luminosity: () =>
    modal("Luminosity", async () => {
      // Только загрузка светов RGB-канала. Intersect с самим собой в PS27
      // отдаёт "parameters not currently valid" и роняет UXP-процесс.
      await bp([dChannelToSelection()]);
    }),
  // +/− у Luminosity: расширить/сузить выделение (Select → Modify → Expand/Contract)
  SelPlus: () => bp([{ _obj: "expand", by: { _unit: "pixelsUnit", _value: 2 }, ...dontDisplay }]),
  SelMinus: () => bp([{ _obj: "contract", by: { _unit: "pixelsUnit", _value: 2 }, ...dontDisplay }]),
  SelInvert: () => bp([{ _obj: "inverse", ...dontDisplay }]),

  /* Face, Makeup & Hair */
  SkinTone: () => modal("Skin Tone", () => makeHueSatAdj("Skin Tone", 0, 0, 0, true)),
  AntiPink: () => modal("Anti-Pink", () => makeHueSatAdj("Anti-Pink", 0, -15, 0, true)),
  AntiRedness: () => modal("Anti-Redness", () => makeHueSatAdj("Anti-Redness", 0, -20, 0, true)),
  Eyes: () => modal("Eyes", () => makeCurvesAdj("Eyes — paint mask", [[0, 0], [128, 175], [255, 255]], true)),
  Teeth: () => modal("Teeth", () => makeHueSatAdj("Teeth — paint mask", 0, -25, 12, true)),
  HairHighlights: () =>
    modal("Hair Highlights", () => makeCurvesAdj("Hair Highlights", [[0, 0], [128, 150], [255, 255]], true)),
  HairBrush1: () => selectToolAndFG("paintbrushTool", 255, 255, 255),
  HairBrush2: () => selectToolAndFG("paintbrushTool", 0, 0, 0),

  Glow: () =>
    modal("Glow", async () => {
      await bp([
        dDuplicateLayer(),
        dRenameLayer("Glow"),
        dGaussianBlur(30),
        dSetBlendMode("softLight"),
        dSetOpacity(50),
      ]);
      // повторный Glow: маску удаляем только если она есть (иначе PS кидает диалог)
      try {
        const lyr = await bp([{ _obj: "get", _target: [{ _ref: "layer", _enum: "ordinal", _value: "targetEnum" }], ...dontDisplay }]);
        if (lyr && lyr[0] && lyr[0].hasUserMask) await bp([dDeleteMask()]);
      } catch (e) {}
      await bp([dMaskHideAll()]);
    }),

  /* Finish & Export */
  SolarCurve: () => modal("Solar Curve", () => makeCurvesAdj("Solar Curve", [[0, 255], [128, 0], [255, 255]], false)),

  Flatten: () => modal("Flatten", () => app.activeDocument.flatten()),

  ImageSize: () => showDialogLater({ _obj: "imageSize", _options: { dialogOptions: "display" } }, 150),

  OverSaturation: () =>
    modal("Over-Saturation Check", async () => {
      // Selective Color: по каждому цвету Black=+100 (absolute) — пересвеченные/перенасыщенные зоны проступают
      const channels = [
        "reds", "yellows", "greens", "cyans", "blues", "magentas", "whites", "neutrals", "blacks",
      ];
      await bp([
        {
          _obj: "make",
          _target: [{ _ref: "adjustmentLayer" }],
          using: {
            _obj: "adjustmentLayer",
            type: {
              _obj: "selectiveColor",
              mode: { _enum: "correctionMethod", _value: "absolute" },
              presetKind: { _enum: "presetKindType", _value: "presetKindDefault" },
              colorCorrection: channels.map((c) => ({
                _obj: "colorCorrection",
                colors: { _enum: "colors", _value: c },
                cyan: 0, magenta: 0, yellowColor: 0, black: -100,
              })),
            },
          },
          ...dontDisplay,
        },
        dRenameLayer("Over-Saturation Check"),
      ]);
    }),

  /* My Actions — экшены A..F из набора "My Panel Actions" */
  ...Object.fromEntries(
    ["A", "B", "C", "D", "E", "F"].map((k) => [
      `Action${k}`,
      () =>
        modal("Action " + k, async () => {
          // проверяем, что у пользователя есть набор и экшен — иначе PS кидает диалог
          let found = false;
          try {
            const tree = await app.actionTree;
            const set = tree.find((s) => s.name === "My Panel Actions");
            found = !!(set && set.children && set.children.some((a) => a.name === k));
          } catch (e) {}
          if (!found) {
            uiStatus("Нет экшена «" + k + "» в наборе «My Panel Actions» — назначьте свои в Actions");
            logLine("Action" + k + ": action set not found, skipped");
            return;
          }
          await bp([
            {
              _obj: "play",
              _target: [
                { _ref: "action", _name: k },
                { _ref: "actionSet", _name: "My Panel Actions" },
              ],
              ...dontDisplay,
            },
          ]);
        }),
    ])
  ),

  /* Быстрые корректирующие слои */
  Levels: () => bp([dMakeAdj("levels")]),
  Curves: () => bp([dMakeAdj("curves")]),
  HueSat: () => bp([dMakeAdj("hueSaturation")]),
  SelectiveColor: () => bp([dMakeAdj("selectiveColor")]),
  ColorBalance: () =>
    bp([
      {
        _obj: "make",
        _target: [{ _ref: "adjustmentLayer" }],
        using: {
          _obj: "adjustmentLayer",
          type: {
            _obj: "colorBalance",
            shadowLevels: [0, 0, 0],
            midtoneLevels: [0, 0, 0],
            highlightLevels: [0, 0, 0],
            preserveLuminosity: true,
            presetKind: { _enum: "presetKindType", _value: "presetKindDefault" },
          },
        },
        ...dontDisplay,
      },
    ]),

  // Liquify из UXP в PS 27.2 не вызывается (см. LiquifySmart) — подсказка
  Liquify: () => uiStatus("Liquify: Filter → Liquify (⇧⌘X)"),

  Sharpen: () =>
    modal("Sharpen", async () => {
      await smartStamp("Sharpen (High Pass)");
      await bp([dHighPass(2), dSetBlendMode("overlay")]);
    }),

  NewLayer: () => bp([dMakeLayer()]),

  StampVisible: () => modal("Stamp Visible", () => smartStamp("Stamp Visible")),

  Size120: () =>
    modal("120% Size", () =>
      bp([
        {
          _obj: "imageSize",
          width: { _unit: "percentUnit", _value: 120 },
          height: { _unit: "percentUnit", _value: 120 },
          constrainProportions: true,
          scaleStyles: true,
          resample: { _enum: "resampleMethod", _value: "automaticInterpolation" },
          ...dontDisplay,
        },
      ])
    ),

  SaveWeb: () =>
    modal("Save for Web", async () => {
      await bp([
        {
          _obj: "imageSize",
          width: { _unit: "pixelsUnit", _value: 2048 },
          constrainProportions: true,
          scaleStyles: true,
          resample: { _enum: "resampleMethod", _value: "automaticInterpolation" },
          ...dontDisplay,
        },
      ]);
      showDialogLater({ _obj: "save", _options: { dialogOptions: "display" } });
    }),

  SaveAs: () => showDialogLater({ _obj: "save", _options: { dialogOptions: "display" } }, 150),

  /* ---------- Новое в 6.0 ---------- */

  // Частотка через Gaussian Blur (алиас 6.0)
  FSGaussian: () => frequencySeparation((globalThis.NS && globalThis.NS.radius) || 8, !!(globalThis.NS && globalThis.NS.median)),

  // Custom FS через High Pass (6.0: "set the High Pass")
  FSHighPass: () =>
    modal("Custom FS", async () => {
      const R = (globalThis.NS && globalThis.NS.radius) || 8;
      const LOW = "FS Low Frequency";
      const HIGH = "FS High Frequency";
      const r1 = await bp([dDuplicateLayer(), dRenameLayer(LOW)]);
      const lowID = r1 && r1[0] && r1[0].layerID;
      await bp([
        dDuplicateLayer(),
        dRenameLayer(HIGH),
        dHighPass(R),
        dSetBlendMode("linearLight"),
      ]);
      await bp([
        {
          _obj: "select",
          _target: [{ _ref: "layer", ...(lowID ? { _id: lowID } : { _name: LOW }) }],
          selectionModifier: { _enum: "selectionModifierType", _value: "addToSelectionContinuous" },
          makeVisible: false,
          ...dontDisplay,
        },
        dGroup(),
        dRenameLayer("Frequency Separation"),
      ]);
    }),

  // Плёночное зерно: штамп + шум + чуть blur, Soft Light
  FilmGrain: () =>
    modal("Film Grain", async () => {
      await smartStamp("Film Grain");
      await bp([
        dAddNoise(4),
        dGaussianBlur(0.5),
        dSetBlendMode("softLight"),
        dSetOpacity(45),
      ]);
    }),

  // Smart Liquify: конвертация в смарт-объект; сам фильтр Liquify в PS 27.2
  // недоступен из UXP ни в модальном скоупе ("<unknown>"), ни вне его
  // ("only allowed from inside a modal scope") — даже ExtendScript едва
  // открывает его через GUI-путь. Поэтому: готовим смарт-объект и подсказываем
  // шорткат. Диалогов-ловушек нет, слой остаётся редактируемым.
  LiquifySmart: () =>
    modal("Smart Liquify", async () => {
      // всегда работаем с копией: Background напрямую в смарт-объект не конвертится
      await bp([dDuplicateLayer(), dRenameLayer("Liquify (smart)")]);
      const r = await bp([{ _obj: "newPlacedLayer", ...dontDisplay }]);
      const failed = r && r[0] && (r[0].message || r[0]._obj === "error");
      logLine("LQ smart " + (failed ? "FAIL " + JSON.stringify(r[0]).slice(0, 150) : "ok"));
      uiStatus(failed ? "Liquify: Filter → Liquify (⇧⌘X)" : "Смарт-объект готов. Дальше: Filter → Liquify (⇧⌘X)");
    }),

  // Image Size с Preserve Details 2.0
  ImageSizePreserveDetails: () =>
    showDialogLater(
      {
        _obj: "imageSize",
        constrainProportions: true,
        interfaceIconFrameDimmed: { _enum: "interpolationType", _value: "preserveDetailsUpscale" },
        _options: { dialogOptions: "display" },
      },
      150
    ),

  // Select People (PS 27.9+): настоящий дескриптор selectPeopleV2.
  // parts: hair=1, eyebrows=2, eyes=3, iris=4, nose=6, mouth=7, teeth=8,
  //        facialSkin=10, upperBodySkin=13, hands=15, accessories=22
  SelectPeoplePart: (part) =>
    modal("Select People: " + part, async () => {
      const PARTS = {
        hair: ["Hair", 1], eyebrows: ["Eyebrows", 2], eyes: ["Eyes", 3],
        iris: ["Iris", 4], nose: ["Nose", 6], mouth: ["Mouth", 7],
        teeth: ["Teeth", 8], facialSkin: ["Facial Skin", 10],
        upperBodySkin: ["Upper Body Skin", 13], hands: ["Hands", 15],
        skin: ["Facial Skin", 10], body: ["Upper Body Skin", 13],
        lips: ["Mouth", 7],
      };
      const p = PARTS[part];
      if (!p) return;
      try {
        await bp([dDeselect()]);
      } catch (e) {}
      const res = await bp([
        {
          _obj: "selectPeopleV2",
          selectAllPeople: true,
          tagsV2: [p[0]],
          tagsIndices: [p[1]],
          ...dontDisplay,
        },
      ]);
      if (res && res[0] && res[0]._obj === "error") throw new Error(res[0].message || "selectPeopleV2 error");
      // PS 27.2 молча игнорирует selectPeopleV2 — проверяем, появилось ли выделение
      const chk = await bp([{ _obj: "get", _target: [{ _ref: "document", _enum: "ordinal", _value: "targetEnum" }], ...dontDisplay }]);
      if (!(chk && chk[0] && chk[0].hasSelection)) {
        uiStatus("Select People требует Photoshop 27.9+ (или в кадре нет человека)");
        logLine("SelectPeople: no selection (PS < 27.9?)");
        return;
      }
      uiStatus("Select People: " + p[0]);
    }),

  // Auto Skin Mask: Select People (кожа) → чёрная маска на кривой
  AutoSkinMask: () =>
    modal("Auto Skin Mask", async () => {
      await Scripts.SelectPeoplePart("skin");
      await makeCurvesAdj("Auto Skin Mask", [[0, 0], [128, 128], [255, 255]], false);
      await bp([
        dDeleteMask(),
        {
          _obj: "make",
          new: { _class: "channel" },
          at: { _ref: "channel", _enum: "channel", _value: "mask" },
          using: { _enum: "userMaskEnabled", _value: "revealSelection" },
          ...dontDisplay,
        },
        dDeselect(),
      ]);
    }),
};

// Статус в LCD-экран панели (если есть)
function uiStatus(text) {
  try {
    if (typeof globalThis.screenSay === "function") globalThis.screenSay(text);
    else console.log("[status]", text);
  } catch (e) {}
}

// Select People обёртки
Scripts.SelEyes = () => Scripts.SelectPeoplePart("eyes");
Scripts.SelLips = () => Scripts.SelectPeoplePart("lips");
Scripts.SelTeeth = () => Scripts.SelectPeoplePart("teeth");
Scripts.SelHair = () => Scripts.SelectPeoplePart("hair");
Scripts.SelBody = () => Scripts.SelectPeoplePart("body");

/* ---------- Псевдонимы имён кнопок оригинальной раскладки ---------- */

const Aliases = {
  // 6.0
  FS_Gausian: "FSGaussian",
  FSClassicCustomized: "FSHighPass",
  RA_FilmGrain: "FilmGrain",
  Liquify_smart: "LiquifySmart",
  imageSize: "ImageSizePreserveDetails",
  selEyes: "SelEyes",
  selLips: "SelLips",
  selTeeth: "SelTeeth",
  selHair: "SelHair",
  selBody: "SelBody",
  autoSkinMask: "AutoSkinMask",
  // верхний ряд инструментов
  AITool: "ObjectSelectionTool",
  BrushTool: "BrushTool",
  SpotHealingBrushTool: "SpotHealingBrushTool",
  RemoveTool: "RemoveTool",
  CloneStampTool: "CloneStampTool",
  CropTool: "CropTool",
  // Dodge & Burn
  Dodge_Burn_localnewcopy: "DBCurves",
  dodge: "Dodge",
  burn: "Burn",
  brush1_local: "DBBrush",
  GlobalD_B_MidGrayLayer: "GlobalDB",
  GreyLayer: "GreyLayer",
  VisualAidD: "VisualAid",
  VisualAidDStrong: "VisualAidStrong",
  VisualAidAlt: "VisualAidAlt",
  brush2_midgray: "DBBrush",
  // Skin work & FS
  FS_New_Skin: "FSNewSkin",
  FS_Median: "FSMedian",
  FSClassicCustomized: "FSNewSkin",
  RA_DigitalSkinTexture: "AddTexture",
  RemoveBodyandFaceHair: "RemoveHairs",
  // Selections
  LassoTool: "LassoTool",
  MagicLassoTool: "ObjectSelectionTool",
  SelectionBrushTool: "SelectionBrushTool",
  SelectSubject: "SelectSubject",
  RectangleMarqueeTool: "RectMarqueeTool",
  PenTool: "PenTool",
  basic: "Luminosity",
  plus: "SelPlus",
  minus: "SelMinus",
  invert: "SelInvert",
  // Face, makeup & hair
  SkinColor: "SkinTone",
  JK_GlowingSkin: "Glow",
  JK_Anti_Pink: "AntiPink",
  JK_MagicEyes: "Eyes",
  RA_MagicSmile: "Teeth",
  Anti_Redness: "AntiRedness",
  HairHighlight: "HairHighlights",
  Hairbrush1: "HairBrush1",
  Hairbrush2: "HairBrush2",
  // Finish & export
  SolarCurve: "SolarCurve",
  flatImage: "Flatten",
  imageSize: "ImageSize",
  Over_SaturatedAreas: "OverSaturation",
  // My actions
  scriptA: "ActionA",
  scriptB: "ActionB",
  scriptC: "ActionC",
  scriptD: "ActionD",
  scriptE: "ActionE",
  scriptF: "ActionF",
  // нижние иконки
  Levels: "Levels",
  Curves: "Curves",
  Hue: "HueSat",
  Selectivecolor: "SelectiveColor",
  ColorBalance: "ColorBalance",
  RA_SharpenDetails: "Sharpen",
  NewLayer: "NewLayer",
  Layer: "StampVisible",
  _120: "Size120",
  webSize: "SaveWeb",
  SAVEAS: "SaveAs",
};

let _urlT = 0;
function openUrl(url) {
  const now = Date.now();
  if (now - _urlT < 1000) return;
  _urlT = now;
  try {
    require("uxp").shell.openExternal(url);
  } catch (e) {
    console.error("[openUrl]", e);
  }
}
globalThis.openUrl = openUrl;

/* ---------- Точка входа ---------- */

let _lastRun = { name: "", t: 0 };

function runScript(name) {
  // защита от двойного срабатывания клика (UXP иногда шлёт событие дважды)
  const now = Date.now();
  if (name === _lastRun.name && now - _lastRun.t < 900) {
    logLine("SKIP-dup " + name);
    return;
  }
  _lastRun = { name, t: now };
  if (name.startsWith("__tool:")) {
    core
      .executeAsModal(async () => {
        await bp([dSelectTool(name.slice(7))]);
      }, { commandName: "Select Tool" })
      .catch((e) => console.error("[tool]", e));
    return;
  }
  const target = Aliases[name] || name;
  const fn = Scripts[target];
  if (!fn) {
    console.error("Unknown script:", name);
    return;
  }
  // ВСЯ команда целиком — в модальном контексте, как в оригинальной панели
  // Ошибки ловим ВНУТРИ модальной функции: если дать ей упасть,
  // Photoshop показывает модальный диалог "The command ... is not currently available"
  logLine("RUN " + name);
  core
    .executeAsModal(async () => {
      try {
        await fn();
        uiStatus("Done: " + name);
        logLine("OK  " + name);
      } catch (e) {
        console.error(`[${name}]`, e);
        uiStatus("Error: " + (e && e.message ? e.message : name));
        logLine("ERR " + name + " :: " + (e && e.message) + " :: " + (e && e.stack ? e.stack.split("\n").slice(0, 4).join(" | ") : ""));
      }
    }, { commandName: "My Retouch: " + name })
    .catch((e) => {
      logLine("ERR-outer " + name + " :: " + (e && e.message));
    });
}

// делаем доступным из inline-обработчиков
globalThis.runScript = runScript;

/* ---------- Навешивание событий (UXP блокирует inline onClick) ---------- */

document.addEventListener("click", (e) => {
  const cmdEl = e.target.closest("[data-cmd]");
  if (cmdEl) {
    logLine("CLICK " + cmdEl.getAttribute("data-cmd"));
    runScript(cmdEl.getAttribute("data-cmd"));
    return;
  }
  const urlEl = e.target.closest("[data-url]");
  if (urlEl) {
    openUrl(urlEl.getAttribute("data-url"));
    return;
  }
  // клик мимо команд — логируем, чтобы отличить «клик не дошёл» от «клик мимо»
  const t = e.target;
  logLine("MISS " + (t && t.tagName) + "." + (t && t.className) + " #" + (t && t.id));
});
