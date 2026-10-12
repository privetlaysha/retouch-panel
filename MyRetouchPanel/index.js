/*
 * My Retouch Panel — собственная панель ретуши для Photoshop (UXP)
 * Все операции выполняются через Photoshop Action Descriptors (batchPlay).
 * Без лицензий, без сети, без обфускации.
 */

const { app, action, core } = require("photoshop");
const { entrypoints } = require("uxp");

/* ---------- Базовые помощники ---------- */

// Выполнить пачку дескрипторов, не роняя панель при ошибке
async function bp(descriptors, options = {}) {
  return await action.batchPlay(descriptors, {
    synchronousExecution: true,
    ...options,
  });
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
  _target: [{ _ref: "channel", _enum: "ordinal", _value: "targetEnum" }],
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
const dApplyImageSubtract = (lowName) => ({
  _obj: "applyImageEvent",
  with: {
    _obj: "calculation",
    to: { _ref: "layer", _name: lowName },
    blending: { _enum: "blendMode", _value: "subtract" },
    scale: 2,
    offset: 128,
  },
  ...dontDisplay,
});

// Сгруппировать выделенные/текущие слои
const dGroup = () => ({ _obj: "make", _target: [{ _ref: "layerSection" }], ...dontDisplay });

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
  _obj: "add",
  _target: [{ _ref: "channel", _property: "selection" }],
  to: { _ref: "channel", _enum: "channel", _value: "RGB" },
  ...dontDisplay,
});

const dSubtractChannel = () => ({
  _obj: "subtract",
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
  await bp([dMakeAdj("curves"), dSetCurve(points), dRenameLayer(name), ...(hideAll ? [dDeleteMask(), dMaskHideAll()] : [])]);
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
async function frequencySeparation(radius, useMedian) {
  const LOW = "FS Low Frequency";
  const HIGH = "FS High Frequency";
  await modal("Frequency Separation", async () => {
    await bp([
      dDuplicateLayer(),
      dRenameLayer(LOW),
      dDuplicateLayer(),
      dRenameLayer(HIGH),
      dSelectBackLayer(),
      useMedian ? dMedian(radius) : dGaussianBlur(radius),
      // вернуться на high-слой
      {
        _obj: "select",
        _target: [{ _ref: "layer", _name: HIGH }],
        makeVisible: false,
        ...dontDisplay,
      },
      dApplyImageSubtract(LOW),
      dSetBlendMode("linearLight"),
    ]);
    // сгруппировать LOW+HIGH
    await bp([
      {
        _obj: "select",
        _target: [{ _ref: "layer", _name: LOW }],
        selectionModifier: { _enum: "selectionModifierType", _value: "addToSelectionContinuous" },
        makeVisible: false,
        ...dontDisplay,
      },
      dGroup(),
      dRenameLayer("Frequency Separation"),
    ]);
  });
}

/* ---------- Карта команд ---------- */

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
  SelectSubject: () => bp([{ _obj: "autoCutout", sampleAllLayers: false, ...dontDisplay }]),

  /* Dodge & Burn */
  DBCurves: async () =>
    modal("DB Curves", async () => {
      await makeCurvesAdj("Dodge", [[0, 0], [128, 168], [255, 255]], true);
      await makeCurvesAdj("Burn", [[0, 0], [128, 88], [255, 255]], true);
      await bp([
        {
          _obj: "select",
          _target: [{ _ref: "layer", _name: "Dodge" }],
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
        dMakeLayer(),
        dRenameLayer("Skin Texture"),
        dSelectAll(),
        dFillGray50(),
        dDeselect(),
        dSetBlendMode("overlay"),
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
      await bp([dChannelToSelection(), dIntersectRGB()]);
    }),
  SelPlus: () => bp([dAddChannel()]),
  SelMinus: () => bp([dSubtractChannel()]),
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
        dMaskHideAll(),
      ]);
    }),

  /* Finish & Export */
  SolarCurve: () => modal("Solar Curve", () => makeCurvesAdj("Solar Curve", [[0, 255], [128, 0], [255, 255]], false)),

  Flatten: () => modal("Flatten", () => app.activeDocument.flatten()),

  ImageSize: () => bp([{ _obj: "imageSize", _options: { dialogOptions: "display" } }]),

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
        bp([
          {
            _obj: "play",
            _target: [
              { _ref: "action", _name: k },
              { _ref: "actionSet", _name: "My Panel Actions" },
            ],
            ...dontDisplay,
          },
        ]),
    ])
  ),

  /* Быстрые корректирующие слои */
  Levels: () => bp([dMakeAdj("levels")]),
  Curves: () => bp([dMakeAdj("curves")]),
  HueSat: () => bp([dMakeAdj("hueSaturation")]),
  SelectiveColor: () => bp([dMakeAdj("selectiveColor")]),
  ColorBalance: () => bp([dMakeAdj("colorBalance")]),

  Liquify: () => modal("Liquify", () => bp([{ _obj: "liquify", _options: { dialogOptions: "display" } }])),

  Sharpen: () =>
    modal("Sharpen", async () => {
      await bp([
        { _obj: "mergeVisible", duplicate: true, ...dontDisplay },
        dRenameLayer("Sharpen (High Pass)"),
        dHighPass(2),
        dSetBlendMode("overlay"),
      ]);
    }),

  NewLayer: () => bp([dMakeLayer()]),

  StampVisible: () => bp([{ _obj: "mergeVisible", duplicate: true, ...dontDisplay }, dRenameLayer("Stamp Visible")]),

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
      await bp([{ _obj: "save", _options: { dialogOptions: "display" } }]);
    }),

  SaveAs: () => bp([{ _obj: "save", _options: { dialogOptions: "display" } }]),

  /* ---------- Новое в 6.0 ---------- */

  // Частотка через Gaussian Blur (алиас 6.0)
  FSGaussian: () => frequencySeparation(8, false),

  // Custom FS через High Pass (6.0: "set the High Pass")
  FSHighPass: () =>
    modal("Custom FS", async () => {
      const R = (globalThis.NS && globalThis.NS.radius) || 8;
      const LOW = "FS Low Frequency";
      const HIGH = "FS High Frequency";
      await bp([
        dDuplicateLayer(),
        dRenameLayer(LOW),
        dDuplicateLayer(),
        dRenameLayer(HIGH),
        dHighPass(R),
        dSetBlendMode("linearLight"),
      ]);
      await bp([
        {
          _obj: "select",
          _target: [{ _ref: "layer", _name: LOW }],
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
      await bp([
        { _obj: "mergeVisible", duplicate: true, ...dontDisplay },
        dRenameLayer("Film Grain"),
        dAddNoise(4),
        dGaussianBlur(0.5),
        dSetBlendMode("softLight"),
        dSetOpacity(45),
      ]);
    }),

  // Smart Liquify: конвертация в смарт-объект + диалог Liquify (редактируемо потом)
  LiquifySmart: () =>
    modal("Smart Liquify", async () => {
      await bp([{ _obj: "newPlacedLayer", ...dontDisplay }]); // convert to Smart Object
      await bp([{ _obj: "liquify", _options: { dialogOptions: "display" } }]);
    }),

  // Image Size с Preserve Details 2.0
  ImageSizePreserveDetails: () =>
    bp([
      {
        _obj: "imageSize",
        constrainProportions: true,
        interfaceIconFrameDimmed: { _enum: "interpolationType", _value: "preserveDetailsUpscale" },
        _options: { dialogOptions: "display" },
      },
    ]),

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
  AITool: "RemoveTool",
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
  Liquify_smart: "Liquify",
  RA_SharpenDetails: "Sharpen",
  NewLayer: "NewLayer",
  Layer: "StampVisible",
  _120: "Size120",
  webSize: "SaveWeb",
  SAVEAS: "SaveAs",
};

function openUrl(url) {
  try {
    require("uxp").shell.openExternal(url);
  } catch (e) {
    console.error("[openUrl]", e);
  }
}
globalThis.openUrl = openUrl;

/* ---------- Точка входа ---------- */

function runScript(name) {
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
  core
    .executeAsModal(async () => {
      await fn();
    }, { commandName: "My Retouch: " + name })
    .then(() => uiStatus("Done: " + name))
    .catch((e) => {
      console.error(`[${name}]`, e);
      uiStatus("Error: " + (e && e.message ? e.message : name));
    });
}

// делаем доступным из inline-обработчиков
globalThis.runScript = runScript;

/* ---------- Навешивание событий (UXP блокирует inline onClick) ---------- */

document.addEventListener("click", (e) => {
  const cmdEl = e.target.closest("[data-cmd]");
  if (cmdEl) {
    runScript(cmdEl.getAttribute("data-cmd"));
    return;
  }
  const urlEl = e.target.closest("[data-url]");
  if (urlEl) {
    openUrl(urlEl.getAttribute("data-url"));
  }
});
