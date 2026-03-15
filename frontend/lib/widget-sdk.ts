/**
 * PieChat Widget SDK
 * 
 * Provides types, template generators, and sandbox helpers for
 * rendering rich interactive content inside chat messages.
 * 
 * Security: All widgets run inside sandboxed iframes with NO
 * access to the parent origin. Communication is via postMessage only.
 */

// ─── Widget Types ─────────────────────────────────────
export type WidgetType = 'chart' | 'table' | 'form' | 'custom' | 'code' | 'progress';

export interface WidgetPayload {
  type: WidgetType;
  title?: string;
  html?: string;
  css?: string;
  script?: string;
  data?: Record<string, unknown>;
  /** Inline width — number (px) or string ('80%', '600px'). Default: '100%' */
  width?: string | number;
  /** Inline height — number (px). Default: 200 */
  height?: number;
  interactive?: boolean;
  version?: string;
}

// ─── Chart Data ───────────────────────────────────────
export interface ChartDataset {
  label: string;
  data: number[];
  color?: string;
}

export interface ChartConfig {
  type: 'bar' | 'line' | 'pie' | 'doughnut' | 'area';
  labels: string[];
  datasets: ChartDataset[];
  title?: string;
  showLegend?: boolean;
}

// ─── Table Data ───────────────────────────────────────
export interface TableConfig {
  columns: Array<{ key: string; label: string; align?: 'left' | 'center' | 'right' }>;
  rows: Record<string, string | number>[];
  title?: string;
  sortable?: boolean;
  striped?: boolean;
}

// ─── Progress Data ────────────────────────────────────
export interface ProgressConfig {
  value: number;
  max?: number;
  label?: string;
  color?: string;
  showPercent?: boolean;
}

// ─── Form Data ────────────────────────────────────────
export interface FormField {
  name: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'checkbox' | 'textarea';
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  required?: boolean;
  value?: string;
}

export interface FormConfig {
  fields: FormField[];
  submitLabel?: string;
  title?: string;
}

// ─── Shared Styles ────────────────────────────────────
const BASE_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: #1f2937;
    background: transparent;
    padding: 12px;
    overflow: hidden;
    -webkit-font-smoothing: antialiased;
  }
  .widget-title {
    font-size: 13px;
    font-weight: 700;
    color: #0284c7;
    margin-bottom: 10px;
    letter-spacing: -0.01em;
  }
  @media (prefers-color-scheme: dark) {
    body { color: #e5e7eb; }
    .widget-title { color: #38bdf8; }
  }
`;

// ─── Color Palette ────────────────────────────────────
const CHART_COLORS = [
  '#0ea5e9', '#8b5cf6', '#f59e0b', '#10b981',
  '#ef4444', '#ec4899', '#06b6d4', '#84cc16',
];

// ─── Template Generators ──────────────────────────────

/**
 * Generate a Chart widget payload
 */
export function createChartWidget(config: ChartConfig): WidgetPayload {
  const { type, labels, datasets, title, showLegend = true } = config;

  const css = `
    ${BASE_CSS}
    canvas { width: 100% !important; height: auto !important; }
    .chart-container { position: relative; width: 100%; }
    .legend { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; justify-content: center; }
    .legend-item { display: flex; align-items: center; gap: 4px; font-size: 11px; color: #6b7280; }
    .legend-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    @media (prefers-color-scheme: dark) { .legend-item { color: #9ca3af; } }
  `;

  // SVG-based chart rendering (no external libs needed)
  const script = `
    (function() {
      const data = ${JSON.stringify({ type, labels, datasets, showLegend })};
      const container = document.getElementById('chart');
      const w = container.offsetWidth;
      const h = 180;
      const colors = ${JSON.stringify(CHART_COLORS)};

      if (data.type === 'bar' || data.type === 'line' || data.type === 'area') {
        const allValues = data.datasets.flatMap(d => d.data);
        const maxVal = Math.max(...allValues, 1);
        const minVal = Math.min(0, ...allValues);
        const range = maxVal - minVal || 1;
        const padding = { top: 10, right: 16, bottom: 30, left: 40 };
        const chartW = w - padding.left - padding.right;
        const chartH = h - padding.top - padding.bottom;

        let svg = '<svg width="'+w+'" height="'+h+'" xmlns="http://www.w3.org/2000/svg">';

        // Grid lines
        for (let i = 0; i <= 4; i++) {
          const y = padding.top + (chartH / 4) * i;
          const val = Math.round(maxVal - (range / 4) * i);
          svg += '<line x1="'+padding.left+'" y1="'+y+'" x2="'+(w-padding.right)+'" y2="'+y+'" stroke="#e5e7eb" stroke-width="0.5" stroke-dasharray="3,3"/>';
          svg += '<text x="'+(padding.left-6)+'" y="'+(y+3)+'" text-anchor="end" font-size="9" fill="#9ca3af">'+val+'</text>';
        }

        // X axis labels
        const barGroupW = chartW / data.labels.length;
        data.labels.forEach((label, i) => {
          const x = padding.left + barGroupW * i + barGroupW / 2;
          svg += '<text x="'+x+'" y="'+(h-6)+'" text-anchor="middle" font-size="9" fill="#9ca3af">'+label+'</text>';
        });

        data.datasets.forEach((ds, di) => {
          const color = ds.color || colors[di % colors.length];
          if (data.type === 'bar') {
            const barW = Math.max(8, (barGroupW - 8) / data.datasets.length);
            ds.data.forEach((val, i) => {
              const barH = ((val - minVal) / range) * chartH;
              const x = padding.left + barGroupW * i + (barGroupW - barW * data.datasets.length) / 2 + barW * di;
              const y = padding.top + chartH - barH;
              svg += '<rect x="'+x+'" y="'+y+'" width="'+barW+'" height="'+barH+'" fill="'+color+'" rx="3" opacity="0.85">';
              svg += '<animate attributeName="height" from="0" to="'+barH+'" dur="0.5s" fill="freeze"/>';
              svg += '<animate attributeName="y" from="'+(padding.top+chartH)+'" to="'+y+'" dur="0.5s" fill="freeze"/>';
              svg += '</rect>';
            });
          } else {
            // Line / Area
            let points = '';
            ds.data.forEach((val, i) => {
              const x = padding.left + barGroupW * i + barGroupW / 2;
              const y = padding.top + chartH - ((val - minVal) / range) * chartH;
              points += x + ',' + y + ' ';
            });
            if (data.type === 'area') {
              const firstX = padding.left + barGroupW / 2;
              const lastX = padding.left + barGroupW * (ds.data.length - 1) + barGroupW / 2;
              const bottom = padding.top + chartH;
              svg += '<polygon points="'+firstX+','+bottom+' '+points.trim()+' '+lastX+','+bottom+'" fill="'+color+'" opacity="0.15"/>';
            }
            svg += '<polyline points="'+points.trim()+'" fill="none" stroke="'+color+'" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>';
            // Dots
            ds.data.forEach((val, i) => {
              const x = padding.left + barGroupW * i + barGroupW / 2;
              const y = padding.top + chartH - ((val - minVal) / range) * chartH;
              svg += '<circle cx="'+x+'" cy="'+y+'" r="3.5" fill="white" stroke="'+color+'" stroke-width="2"/>';
            });
          }
        });

        svg += '</svg>';
        container.innerHTML = svg;
      } else if (data.type === 'pie' || data.type === 'doughnut') {
        const total = data.datasets[0].data.reduce((a,b) => a+b, 0) || 1;
        const cx = w/2, cy = 80, r = 65;
        const innerR = data.type === 'doughnut' ? r * 0.55 : 0;
        let startAngle = -Math.PI/2;
        let svg = '<svg width="'+w+'" height="180" xmlns="http://www.w3.org/2000/svg">';
        data.datasets[0].data.forEach((val, i) => {
          const slice = (val / total) * Math.PI * 2;
          const endAngle = startAngle + slice;
          const large = slice > Math.PI ? 1 : 0;
          const x1 = cx + r * Math.cos(startAngle);
          const y1 = cy + r * Math.sin(startAngle);
          const x2 = cx + r * Math.cos(endAngle);
          const y2 = cy + r * Math.sin(endAngle);
          const color = colors[i % colors.length];
          if (innerR > 0) {
            const ix1 = cx + innerR * Math.cos(startAngle);
            const iy1 = cy + innerR * Math.sin(startAngle);
            const ix2 = cx + innerR * Math.cos(endAngle);
            const iy2 = cy + innerR * Math.sin(endAngle);
            svg += '<path d="M'+x1+' '+y1+' A'+r+' '+r+' 0 '+large+' 1 '+x2+' '+y2+' L'+ix2+' '+iy2+' A'+innerR+' '+innerR+' 0 '+large+' 0 '+ix1+' '+iy1+' Z" fill="'+color+'" opacity="0.85"/>';
          } else {
            svg += '<path d="M'+cx+' '+cy+' L'+x1+' '+y1+' A'+r+' '+r+' 0 '+large+' 1 '+x2+' '+y2+' Z" fill="'+color+'" opacity="0.85"/>';
          }
          startAngle = endAngle;
        });
        if (data.type === 'doughnut') {
          const pct = Math.round((data.datasets[0].data[0] / total) * 100);
          svg += '<text x="'+cx+'" y="'+(cy+5)+'" text-anchor="middle" font-size="18" font-weight="bold" fill="#1f2937">'+pct+'%</text>';
        }
        svg += '</svg>';
        container.innerHTML = svg;
      }

      // Legend
      if (data.showLegend) {
        const legend = document.getElementById('legend');
        const items = data.type === 'pie' || data.type === 'doughnut' ? data.labels : data.datasets.map(d => d.label);
        items.forEach((label, i) => {
          const el = document.createElement('div');
          el.className = 'legend-item';
          el.innerHTML = '<span class="legend-dot" style="background:'+colors[i % colors.length]+'"></span>' + label;
          legend.appendChild(el);
        });
      }

      // Report height
      setTimeout(() => {
        const totalH = document.body.scrollHeight;
        window.parent.postMessage({ type: 'piechat-widget-resize', height: totalH }, '*');
      }, 100);
    })();
  `;

  const html = `
    ${title ? '<div class="widget-title">' + escapeHtml(title) + '</div>' : ''}
    <div id="chart" class="chart-container"></div>
    <div id="legend" class="legend"></div>
  `;

  return {
    type: 'chart',
    title,
    html,
    css,
    script,
    data: config as unknown as Record<string, unknown>,
    height: 250,
    interactive: false,
    version: '1.0',
  };
}

/**
 * Generate a Table widget payload
 */
export function createTableWidget(config: TableConfig): WidgetPayload {
  const { columns, rows, title, sortable = true, striped = true } = config;

  const css = `
    ${BASE_CSS}
    body { overflow: auto; }
    table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 12px; }
    th {
      background: #f1f5f9; color: #475569; padding: 8px 10px; font-weight: 600;
      text-align: left; border-bottom: 2px solid #e2e8f0; position: sticky; top: 0;
      font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em;
      ${sortable ? 'cursor: pointer; user-select: none;' : ''}
    }
    th:hover { background: #e2e8f0; }
    th .sort-icon { opacity: 0.4; margin-left: 4px; font-size: 10px; }
    th.sorted .sort-icon { opacity: 1; color: #0284c7; }
    td {
      padding: 7px 10px; border-bottom: 1px solid #f1f5f9;
      transition: background 0.15s;
    }
    ${striped ? 'tr:nth-child(even) td { background: #f8fafc; }' : ''}
    tr:hover td { background: #eff6ff !important; }
    @media (prefers-color-scheme: dark) {
      th { background: #1e293b; color: #94a3b8; border-color: #334155; }
      th:hover { background: #334155; }
      td { border-color: #1e293b; }
      ${striped ? 'tr:nth-child(even) td { background: #0f172a; }' : ''}
      tr:hover td { background: #1e3a5f !important; }
    }
  `;

  const script = `
    (function() {
      ${sortable ? `
      const cols = ${JSON.stringify(columns.map(c => c.key))};
      let sortCol = null, sortAsc = true;
      document.querySelectorAll('th[data-key]').forEach(th => {
        th.addEventListener('click', () => {
          const key = th.dataset.key;
          if (sortCol === key) sortAsc = !sortAsc;
          else { sortCol = key; sortAsc = true; }
          const tbody = document.querySelector('tbody');
          const trs = Array.from(tbody.querySelectorAll('tr'));
          trs.sort((a, b) => {
            const aVal = a.querySelector('[data-col="'+key+'"]')?.textContent || '';
            const bVal = b.querySelector('[data-col="'+key+'"]')?.textContent || '';
            const aNum = parseFloat(aVal), bNum = parseFloat(bVal);
            if (!isNaN(aNum) && !isNaN(bNum)) return sortAsc ? aNum - bNum : bNum - aNum;
            return sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
          });
          trs.forEach(tr => tbody.appendChild(tr));
          document.querySelectorAll('th').forEach(h => h.classList.remove('sorted'));
          th.classList.add('sorted');
          th.querySelector('.sort-icon').textContent = sortAsc ? '▲' : '▼';
        });
      });
      ` : ''}
      setTimeout(() => {
        window.parent.postMessage({ type: 'piechat-widget-resize', height: document.body.scrollHeight }, '*');
      }, 50);
    })();
  `;

  const headerHtml = columns.map(c =>
    `<th data-key="${escapeHtml(c.key)}" style="text-align:${c.align || 'left'}">
      ${escapeHtml(c.label)}<span class="sort-icon">▲</span>
    </th>`
  ).join('');

  const rowsHtml = rows.map(row =>
    '<tr>' + columns.map(c =>
      `<td data-col="${escapeHtml(c.key)}" style="text-align:${c.align || 'left'}">${escapeHtml(String(row[c.key] ?? ''))}</td>`
    ).join('') + '</tr>'
  ).join('');

  const html = `
    ${title ? '<div class="widget-title">' + escapeHtml(title) + '</div>' : ''}
    <table>
      <thead><tr>${headerHtml}</tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  `;

  const estimatedHeight = Math.min(400, 50 + rows.length * 34 + (title ? 28 : 0));

  return {
    type: 'table',
    title,
    html,
    css,
    script,
    data: config as unknown as Record<string, unknown>,
    height: estimatedHeight,
    interactive: sortable,
    version: '1.0',
  };
}

/**
 * Generate a Progress widget payload
 */
export function createProgressWidget(config: ProgressConfig): WidgetPayload {
  const { value, max = 100, label, color = '#0ea5e9', showPercent = true } = config;
  const pct = Math.min(100, Math.round((value / max) * 100));

  const css = `
    ${BASE_CSS}
    .progress-wrap { display: flex; align-items: center; gap: 10px; }
    .progress-label { font-size: 12px; font-weight: 600; color: #475569; min-width: 0; flex-shrink: 1; }
    .progress-bar { flex: 1; height: 10px; background: #f1f5f9; border-radius: 99px; overflow: hidden; }
    .progress-fill { height: 100%; border-radius: 99px; transition: width 0.8s cubic-bezier(0.22, 1, 0.36, 1); }
    .progress-pct { font-size: 13px; font-weight: 700; min-width: 42px; text-align: right; }
    @media (prefers-color-scheme: dark) {
      .progress-label { color: #94a3b8; }
      .progress-bar { background: #1e293b; }
    }
  `;

  const html = `
    <div class="progress-wrap">
      ${label ? '<span class="progress-label">' + escapeHtml(label) + '</span>' : ''}
      <div class="progress-bar">
        <div class="progress-fill" style="width:0%;background:${escapeHtml(color)}"></div>
      </div>
      ${showPercent ? '<span class="progress-pct" style="color:' + escapeHtml(color) + '">' + pct + '%</span>' : ''}
    </div>
  `;

  const script = `
    setTimeout(() => {
      document.querySelector('.progress-fill').style.width = '${pct}%';
      window.parent.postMessage({ type: 'piechat-widget-resize', height: document.body.scrollHeight }, '*');
    }, 50);
  `;

  return {
    type: 'progress',
    title: label,
    html,
    css,
    script,
    data: config as unknown as Record<string, unknown>,
    height: 50,
    interactive: false,
    version: '1.0',
  };
}

/**
 * Generate a Form widget payload
 */
export function createFormWidget(config: FormConfig): WidgetPayload {
  const { fields, submitLabel = 'Submit', title } = config;

  const css = `
    ${BASE_CSS}
    form { display: flex; flex-direction: column; gap: 10px; }
    label { font-size: 12px; font-weight: 600; color: #475569; display: flex; flex-direction: column; gap: 4px; }
    label.checkbox-label { flex-direction: row; align-items: center; gap: 8px; cursor: pointer; }
    input, select, textarea {
      padding: 7px 10px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 13px;
      outline: none; transition: border-color 0.2s, box-shadow 0.2s; background: white;
    }
    input:focus, select:focus, textarea:focus {
      border-color: #0ea5e9; box-shadow: 0 0 0 3px rgba(14,165,233,0.1);
    }
    input[type="checkbox"] { width: 16px; height: 16px; accent-color: #0ea5e9; }
    textarea { resize: vertical; min-height: 60px; }
    button[type="submit"] {
      padding: 8px 16px; background: #0ea5e9; color: white; border: none; border-radius: 8px;
      font-weight: 600; font-size: 13px; cursor: pointer; transition: all 0.2s;
    }
    button[type="submit"]:hover { background: #0284c7; transform: translateY(-1px); }
    button[type="submit"]:active { transform: translateY(0); }
    .required { color: #ef4444; }
    @media (prefers-color-scheme: dark) {
      label { color: #94a3b8; }
      input, select, textarea { background: #1e293b; border-color: #334155; color: #e5e7eb; }
      input:focus, select:focus, textarea:focus { border-color: #38bdf8; box-shadow: 0 0 0 3px rgba(56,189,248,0.15); }
    }
  `;

  const fieldsHtml = fields.map(f => {
    const req = f.required ? '<span class="required">*</span>' : '';
    switch (f.type) {
      case 'checkbox':
        return `<label class="checkbox-label">
          <input type="checkbox" name="${escapeHtml(f.name)}" ${f.value === 'true' ? 'checked' : ''}/>
          ${escapeHtml(f.label)} ${req}
        </label>`;
      case 'select':
        return `<label>${escapeHtml(f.label)} ${req}
          <select name="${escapeHtml(f.name)}">
            <option value="">-- Select --</option>
            ${(f.options || []).map(o => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join('')}
          </select>
        </label>`;
      case 'textarea':
        return `<label>${escapeHtml(f.label)} ${req}
          <textarea name="${escapeHtml(f.name)}" placeholder="${escapeHtml(f.placeholder || '')}">${escapeHtml(f.value || '')}</textarea>
        </label>`;
      default:
        return `<label>${escapeHtml(f.label)} ${req}
          <input type="${f.type}" name="${escapeHtml(f.name)}" placeholder="${escapeHtml(f.placeholder || '')}" value="${escapeHtml(f.value || '')}"/>
        </label>`;
    }
  }).join('');

  const html = `
    ${title ? '<div class="widget-title">' + escapeHtml(title) + '</div>' : ''}
    <form id="widget-form">
      ${fieldsHtml}
      <button type="submit">${escapeHtml(submitLabel)}</button>
    </form>
  `;

  const script = `
    document.getElementById('widget-form').addEventListener('submit', function(e) {
      e.preventDefault();
      const fd = new FormData(this);
      const data = {};
      fd.forEach((v, k) => { data[k] = v; });
      // Also handle checkboxes (unchecked ones not in FormData)
      this.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        data[cb.name] = cb.checked;
      });
      window.parent.postMessage({ type: 'piechat-widget-action', action: 'form-submit', data: data }, '*');
      this.querySelector('button[type="submit"]').textContent = '✓ Sent';
      this.querySelector('button[type="submit"]').disabled = true;
    });
    setTimeout(() => {
      window.parent.postMessage({ type: 'piechat-widget-resize', height: document.body.scrollHeight }, '*');
    }, 50);
  `;

  const estimatedHeight = Math.min(500, 60 + fields.length * 58 + (title ? 28 : 0));

  return {
    type: 'form',
    title,
    html,
    css,
    script,
    data: config as unknown as Record<string, unknown>,
    height: estimatedHeight,
    interactive: true,
    version: '1.0',
  };
}

/**
 * Generate a Code highlight widget
 */
export function createCodeWidget(code: string, language = 'javascript', title?: string): WidgetPayload {
  const css = `
    ${BASE_CSS}
    body { overflow: auto; }
    pre {
      background: #0f172a; color: #e2e8f0; padding: 14px 16px; border-radius: 10px;
      font-family: 'Fira Code', 'SF Mono', 'Cascadia Code', Consolas, monospace;
      font-size: 12px; line-height: 1.6; overflow-x: auto; tab-size: 2;
      white-space: pre; word-break: normal;
    }
    .lang-badge {
      display: inline-block; font-size: 9px; font-weight: 700; text-transform: uppercase;
      color: #94a3b8; background: #1e293b; padding: 2px 8px; border-radius: 4px;
      margin-bottom: 6px; letter-spacing: 0.05em;
    }
    .copy-btn {
      position: absolute; top: 8px; right: 8px; background: #334155; color: #94a3b8;
      border: none; border-radius: 6px; padding: 4px 10px; font-size: 11px; cursor: pointer;
      transition: all 0.2s; font-weight: 600;
    }
    .copy-btn:hover { background: #475569; color: #e2e8f0; }
    .code-wrap { position: relative; }
    /* Basic syntax highlighting */
    .kw { color: #c084fc; } .str { color: #34d399; } .num { color: #fbbf24; }
    .cm { color: #64748b; font-style: italic; } .fn { color: #38bdf8; }
  `;

  // Basic syntax highlighting
  const highlighted = escapeHtml(code)
    .replace(/\b(const|let|var|function|return|if|else|for|while|class|import|export|from|async|await|new|try|catch|throw|typeof|instanceof)\b/g, '<span class="kw">$1</span>')
    .replace(/(["'`])(?:(?!\1|\\).|\\.)*\1/g, '<span class="str">$&</span>')
    .replace(/\b(\d+\.?\d*)\b/g, '<span class="num">$1</span>')
    .replace(/(\/\/.*?)$/gm, '<span class="cm">$1</span>')
    .replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="cm">$1</span>');

  const html = `
    ${title ? '<div class="widget-title">' + escapeHtml(title) + '</div>' : ''}
    <div class="code-wrap">
      <span class="lang-badge">${escapeHtml(language)}</span>
      <button class="copy-btn" id="copy-btn">Copy</button>
      <pre><code>${highlighted}</code></pre>
    </div>
  `;

  const script = `
    const rawCode = ${JSON.stringify(code)};
    document.getElementById('copy-btn').addEventListener('click', function() {
      // Can't use clipboard API in sandbox, send to parent
      window.parent.postMessage({ type: 'piechat-widget-action', action: 'copy', data: rawCode }, '*');
      this.textContent = '✓ Copied';
      setTimeout(() => { this.textContent = 'Copy'; }, 2000);
    });
    setTimeout(() => {
      window.parent.postMessage({ type: 'piechat-widget-resize', height: document.body.scrollHeight }, '*');
    }, 50);
  `;

  const lines = code.split('\n').length;
  const estimatedHeight = Math.min(600, 60 + lines * 19.2 + (title ? 28 : 0));

  return {
    type: 'code',
    title,
    html,
    css,
    script,
    height: estimatedHeight,
    interactive: true,
    version: '1.0',
  };
}

/**
 * Generate a custom HTML widget from raw html/css/js
 */
export function createCustomWidget(
  html: string,
  css?: string,
  script?: string,
  options?: { title?: string; height?: number; interactive?: boolean }
): WidgetPayload {
  return {
    type: 'custom',
    title: options?.title,
    html,
    css: (css || '') ? BASE_CSS + '\n' + css : BASE_CSS,
    script: (script || '') + `
      setTimeout(() => {
        window.parent.postMessage({ type: 'piechat-widget-resize', height: document.body.scrollHeight }, '*');
      }, 100);
    `,
    height: options?.height || 200,
    interactive: options?.interactive ?? true,
    version: '1.0',
  };
}

// ─── Build full srcdoc HTML ───────────────────────────
/**
 * Builds a complete sandboxed HTML document from a WidgetPayload.
 * Intended for use as iframe.srcdoc value.
 */
export function buildWidgetSrcdoc(widget: WidgetPayload): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:;"/>
  <style>${widget.css || BASE_CSS}</style>
</head>
<body>
  ${widget.html || ''}
  <script>${widget.script || ''}<\/script>
</body>
</html>`;
}

// ─── MAX_PAYLOAD_SIZE ─────────────────────────────────
export const MAX_WIDGET_PAYLOAD_SIZE = 64 * 1024; // 64 KB

export function validateWidgetPayload(widget: WidgetPayload): { valid: boolean; error?: string } {
  const json = JSON.stringify(widget);
  if (json.length > MAX_WIDGET_PAYLOAD_SIZE) {
    return { valid: false, error: `Widget payload exceeds ${MAX_WIDGET_PAYLOAD_SIZE / 1024}KB limit (${Math.round(json.length / 1024)}KB)` };
  }
  if (!widget.type) {
    return { valid: false, error: 'Widget type is required' };
  }
  if (!widget.html && !widget.script) {
    return { valid: false, error: 'Widget must have html or script content' };
  }
  return { valid: true };
}

// ─── Helpers ──────────────────────────────────────────
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
