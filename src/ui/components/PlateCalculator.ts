import type { DisplayUnit } from '../../data/models';

interface PlateConfig {
  weight: number;
  color: string;
  label: string;
  h: number; // visual height px
  w: number; // visual width px
}

const PLATES: Record<DisplayUnit, PlateConfig[]> = {
  lbs: [
    { weight: 45,  color: '#1565C0', label: '45',  h: 66, w: 14 },
    { weight: 35,  color: '#E65100', label: '35',  h: 56, w: 13 },
    { weight: 25,  color: '#2E7D32', label: '25',  h: 48, w: 12 },
    { weight: 10,  color: '#616161', label: '10',  h: 38, w: 10 },
    { weight: 5,   color: '#B71C1C', label: '5',   h: 30, w: 9  },
    { weight: 2.5, color: '#78909C', label: '2.5', h: 22, w: 8  },
  ],
  kg: [
    { weight: 20,   color: '#1565C0', label: '20',   h: 66, w: 14 },
    { weight: 15,   color: '#E65100', label: '15',   h: 56, w: 13 },
    { weight: 10,   color: '#2E7D32', label: '10',   h: 48, w: 12 },
    { weight: 5,    color: '#616161', label: '5',    h: 38, w: 10 },
    { weight: 2.5,  color: '#B71C1C', label: '2.5',  h: 30, w: 9  },
    { weight: 1.25, color: '#78909C', label: '1.25', h: 22, w: 8  },
  ],
};

export const BAR_WEIGHT: Record<DisplayUnit, number> = { lbs: 45, kg: 20 };

interface PlateCalcOptions {
  value: number | undefined;
  displayUnit: DisplayUnit;
  onConfirm: (value: number) => void;
}

let _overlay: HTMLElement | null = null;
let _cleanupVp: (() => void) | null = null;
let _plates: number[] = [];

export function showPlateCalculator(opts: PlateCalcOptions): void {
  if (_overlay) closePlateCalculator();
  _plates = decomposeWeight(opts.value, opts.displayUnit);
  _overlay = buildOverlay(opts);
  document.body.appendChild(_overlay);
  requestAnimationFrame(() => _overlay?.classList.add('pc-visible'));
}

export function closePlateCalculator(): void {
  if (!_overlay) return;
  _cleanupVp?.();
  _cleanupVp = null;
  _overlay.classList.remove('pc-visible');
  const el = _overlay;
  _overlay = null;
  setTimeout(() => el.remove(), 320);
}

function decomposeWeight(value: number | undefined, unit: DisplayUnit): number[] {
  if (!value || value <= BAR_WEIGHT[unit]) return [];
  const perSide = (value - BAR_WEIGHT[unit]) / 2;
  const result: number[] = [];
  let rem = perSide;
  for (const p of PLATES[unit]) {
    while (rem >= p.weight - 0.001) {
      result.push(p.weight);
      rem -= p.weight;
    }
  }
  return result;
}

function plateTotal(unit: DisplayUnit): number {
  return BAR_WEIGHT[unit] + 2 * _plates.reduce((s, w) => s + w, 0);
}

function findConfig(weight: number, unit: DisplayUnit): PlateConfig | undefined {
  return PLATES[unit].find(p => Math.abs(p.weight - weight) < 0.001);
}

// Auto-consolidate small plates into bigger ones after manual adds.
// Rule 1: sub-mid plates (< PLATES[2]) summing ≥ mid → upgrade to mid + remainder.
// Rule 2: sub-big plates (< PLATES[0]) summing ≥ big → upgrade to big + remainder.
function normalizePlates(unit: DisplayUnit): void {
  const plates = PLATES[unit];
  const bigW = plates[0].weight;
  const midW = plates[2].weight;

  // Rule 1
  const subMidSum = _plates.filter(w => w < midW - 0.001).reduce((a, b) => a + b, 0);
  if (subMidSum >= midW - 0.001) {
    _plates = _plates.filter(w => w >= midW - 0.001);
    let rem = subMidSum;
    for (const p of plates.filter(p => p.weight <= midW + 0.001)) {
      while (rem >= p.weight - 0.001) { _plates.push(p.weight); rem -= p.weight; }
    }
    _plates.sort((a, b) => b - a);
  }

  // Rule 2
  const subBigSum = _plates.filter(w => w < bigW - 0.001).reduce((a, b) => a + b, 0);
  if (subBigSum >= bigW - 0.001) {
    _plates = _plates.filter(w => w >= bigW - 0.001);
    let rem = subBigSum;
    for (const p of plates) {
      while (rem >= p.weight - 0.001) { _plates.push(p.weight); rem -= p.weight; }
    }
    _plates.sort((a, b) => b - a);
  }
}

const BIG_PLATE_RENDER_LIMIT = 4;

// ─── Build ────────────────────────────────────────────────────────────────────

function buildOverlay(opts: PlateCalcOptions): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = 'pc-overlay';

  const sheet = document.createElement('div');
  sheet.className = 'pc-sheet';
  overlay.appendChild(sheet);

  // Backdrop tap = dismiss without saving
  overlay.addEventListener('click', e => {
    if (e.target === overlay) closePlateCalculator();
  });

  // Shrink to visible viewport when keyboard opens
  const vv = window.visualViewport;
  if (vv) {
    const update = () => {
      overlay.style.height = `${vv.height}px`;
      overlay.style.top = `${vv.offsetTop}px`;
    };
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();
    _cleanupVp = () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }

  renderSheet(sheet, opts);
  return overlay;
}

function renderSheet(sheet: HTMLElement, opts: PlateCalcOptions): void {
  const { displayUnit: unit } = opts;
  const total = plateTotal(unit);

  sheet.innerHTML = `
    <div class="pc-handle"></div>

    <div class="pc-weight-row">
      <input
        type="number"
        id="pc-num"
        class="pc-num-input"
        inputmode="decimal"
        value="${total}"
        placeholder="${BAR_WEIGHT[unit]}"
        autocomplete="off"
      />
      <span class="pc-num-unit">${unit}</span>
    </div>
    <div class="pc-bar-label text-muted">Bar: ${BAR_WEIGHT[unit]} ${unit} &nbsp;·&nbsp; Per side: ${_plates.length ? _plates.map(w => w).join(', ') : '—'}</div>

    <div class="pc-bar-scroll">
      <div class="pc-bar-row" id="pc-bar-row">
        ${renderBarRow(unit)}
      </div>
    </div>

    <div class="pc-plate-grid">
      ${PLATES[unit].map(p => `
        <button class="pc-add-btn" data-weight="${p.weight}" style="--plate-color:${p.color};">
          <span class="pc-add-label">+${p.label}</span>
          <span class="pc-add-unit">${unit}</span>
        </button>
      `).join('')}
    </div>

    <div class="pc-footer">
      <button class="pc-action-btn" id="pc-undo" ${_plates.length === 0 ? 'disabled' : ''}>↩ Undo</button>
      <button class="pc-action-btn" id="pc-clear" ${_plates.length === 0 ? 'disabled' : ''}>Clear</button>
      <button class="btn btn-primary pc-done-btn" id="pc-done">Done</button>
    </div>
  `;

  wireSheet(sheet, opts);
  // Focus the number input after a short delay so keyboard doesn't fight the animation
  setTimeout(() => sheet.querySelector<HTMLInputElement>('#pc-num')?.select(), 350);
}

function renderBarRow(unit: DisplayUnit): string {
  const bigW = PLATES[unit][0].weight;
  const bigCfg = findConfig(bigW, unit)!;
  const bigCount = _plates.filter(w => Math.abs(w - bigW) < 0.001).length;
  const overflowCount = Math.max(0, bigCount - BIG_PLATE_RENDER_LIMIT);
  const visibleBigCount = bigCount - overflowCount;
  // Smaller plates follow big plates in the sorted array
  const otherPlates = _plates.filter(w => Math.abs(w - bigW) >= 0.001);

  // Right side: innermost big plates → overflow badge → lighter plates (all clickable)
  let rightHtml = '';
  for (let i = 0; i < visibleBigCount; i++) rightHtml += plateDiv(bigW, unit, true, i);
  if (overflowCount > 0) rightHtml += overflowBadge(overflowCount, bigCfg);
  otherPlates.forEach((w, i) => { rightHtml += plateDiv(w, unit, true, bigCount + i); });

  // Left side: mirror (outermost = lightest first)
  let leftHtml = '';
  [...otherPlates].reverse().forEach(w => { leftHtml += plateDiv(w, unit, false); });
  if (overflowCount > 0) leftHtml += overflowBadge(overflowCount, bigCfg);
  for (let i = 0; i < visibleBigCount; i++) leftHtml += plateDiv(bigW, unit, false);

  return `
    <div class="pc-side">${leftHtml}</div>
    <div class="pc-collar"></div>
    <div class="pc-sleeve"></div>
    <div class="pc-collar"></div>
    <div class="pc-side">${rightHtml}</div>
  `;
}

function overflowBadge(count: number, cfg: PlateConfig): string {
  return `<div class="pc-plate-overflow" style="height:${cfg.h}px;border-color:${cfg.color};color:${cfg.color};">${count}×${cfg.label}</div>`;
}

function plateDiv(weight: number, unit: DisplayUnit, clickable: boolean, index?: number): string {
  const cfg = findConfig(weight, unit);
  if (!cfg) return '';
  const style = `height:${cfg.h}px;width:${cfg.w}px;background:${cfg.color};`;
  if (clickable && index !== undefined) {
    return `<div class="pc-plate pc-plate-rm" style="${style}" data-index="${index}" title="Remove ${cfg.label} ${unit}"></div>`;
  }
  return `<div class="pc-plate" style="${style}"></div>`;
}

// ─── Wiring ───────────────────────────────────────────────────────────────────

function wireSheet(sheet: HTMLElement, opts: PlateCalcOptions): void {
  const numInput = sheet.querySelector<HTMLInputElement>('#pc-num')!;

  // Typing → decompose to plates
  numInput.addEventListener('input', () => {
    const v = parseFloat(numInput.value);
    if (!isNaN(v) && v > 0) {
      _plates = decomposeWeight(v, opts.displayUnit);
      refresh(sheet, opts, false);
    }
  });

  // Plate add buttons
  sheet.querySelectorAll<HTMLButtonElement>('.pc-add-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const w = parseFloat(btn.dataset.weight!);
      // Insert maintaining heaviest-first order
      const idx = _plates.findIndex(p => p < w);
      if (idx === -1) _plates.push(w); else _plates.splice(idx, 0, w);
      normalizePlates(opts.displayUnit);
      numInput.value = String(plateTotal(opts.displayUnit));
      refresh(sheet, opts, true);
    });
  });

  // Undo
  sheet.querySelector('#pc-undo')?.addEventListener('click', () => {
    // Remove outermost plate = last element (lightest in the sorted array)
    _plates.pop();
    numInput.value = String(plateTotal(opts.displayUnit));
    refresh(sheet, opts, true);
  });

  // Clear
  sheet.querySelector('#pc-clear')?.addEventListener('click', () => {
    _plates = [];
    numInput.value = String(BAR_WEIGHT[opts.displayUnit]);
    refresh(sheet, opts, true);
  });

  // Done
  sheet.querySelector('#pc-done')?.addEventListener('click', () => {
    const typed = parseFloat(numInput.value);
    opts.onConfirm(isNaN(typed) ? plateTotal(opts.displayUnit) : typed);
    closePlateCalculator();
  });

  wireRmPlates(sheet, opts);
}

function wireRmPlates(sheet: HTMLElement, opts: PlateCalcOptions): void {
  sheet.querySelectorAll<HTMLElement>('.pc-plate-rm').forEach(el => {
    el.addEventListener('click', () => {
      const i = parseInt(el.dataset.index!);
      _plates.splice(i, 1);
      const numInput = sheet.querySelector<HTMLInputElement>('#pc-num')!;
      numInput.value = String(plateTotal(opts.displayUnit));
      refresh(sheet, opts, true);
    });
  });
}

function refresh(sheet: HTMLElement, opts: PlateCalcOptions, rewire: boolean): void {
  const unit = opts.displayUnit;

  // Update bar visualization
  const barRow = sheet.querySelector('#pc-bar-row');
  if (barRow) barRow.innerHTML = renderBarRow(unit);

  // Update "per side" label
  const label = sheet.querySelector('.pc-bar-label');
  if (label) {
    label.textContent = `Bar: ${BAR_WEIGHT[unit]} ${unit}  ·  Per side: ${_plates.length ? _plates.join(', ') : '—'}`;
  }

  // Update undo/clear disabled state
  const hasPlates = _plates.length > 0;
  (sheet.querySelector('#pc-undo') as HTMLButtonElement | null)!.disabled = !hasPlates;
  (sheet.querySelector('#pc-clear') as HTMLButtonElement | null)!.disabled = !hasPlates;

  if (rewire) wireRmPlates(sheet, opts);
}
