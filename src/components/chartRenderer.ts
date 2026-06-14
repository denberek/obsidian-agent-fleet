export interface BarChartDay {
  date: string;
  success: number;
  failure: number;
  cancelled: number;
}

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string> = {}): SVGElementTagNameMap[K] {
  const el = activeDocument.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, v);
  }
  return el;
}

function formatDateLabel(dateStr: string): string {
  // dateStr = "2026-03-29" → "Mar 29"
  try {
    const d = new Date(dateStr + "T12:00:00");
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return dateStr.slice(5); // fallback: "03-29"
  }
}

export function renderBarChart(container: HTMLElement, data: BarChartDay[]): void {
  const count = data.length || 1;
  const width = 1000;
  const gap = 6;
  const paddingLeft = 4;
  const paddingRight = 4;
  const usable = width - paddingLeft - paddingRight - gap * (count - 1);
  const barWidth = Math.floor(usable / count);
  const chartHeight = 140;
  const labelHeight = 36;
  const topPadding = 18;
  const height = topPadding + chartHeight + labelHeight;
  const maxValue = Math.max(1, ...data.map((d) => d.success + d.failure + d.cancelled));

  const svg = svgEl("svg", {
    viewBox: `0 0 ${width} ${height}`,
    width: "100%",
    height: String(height),
    class: "af-chart-bar",
  });

  // Horizontal grid lines
  for (let g = 0; g <= 4; g++) {
    const gy = topPadding + chartHeight - (g / 4) * chartHeight;
    svg.appendChild(
      svgEl("line", {
        x1: String(paddingLeft),
        y1: String(gy),
        x2: String(width - paddingRight),
        y2: String(gy),
        stroke: "var(--af-text-faint)",
        "stroke-opacity": "0.15",
        "stroke-width": "1",
      }),
    );
  }

  for (let i = 0; i < data.length; i++) {
    const d = data[i]!;
    const x = paddingLeft + i * (barWidth + gap);
    const total = d.success + d.failure + d.cancelled;
    const totalH = (total / maxValue) * chartHeight;
    const successH = (d.success / maxValue) * chartHeight;
    const cancelledH = (d.cancelled / maxValue) * chartHeight;
    const failureH = (d.failure / maxValue) * chartHeight;

    // Stacked bars (bottom to top): success → cancelled → failure
    // All segments are square rectangles — clean stacking, no rounding artifacts.

    if (d.success > 0) {
      svg.appendChild(
        svgEl("rect", {
          x: String(x),
          y: String(topPadding + chartHeight - successH),
          width: String(barWidth),
          height: String(Math.max(successH, 2)),
          fill: "var(--af-green)",
          opacity: "0.85",
        }),
      );
    }

    if (d.cancelled > 0) {
      svg.appendChild(
        svgEl("rect", {
          x: String(x),
          y: String(topPadding + chartHeight - successH - cancelledH),
          width: String(barWidth),
          height: String(Math.max(cancelledH, 2)),
          fill: "var(--af-yellow)",
          opacity: "0.85",
        }),
      );
    }

    if (d.failure > 0) {
      svg.appendChild(
        svgEl("rect", {
          x: String(x),
          y: String(topPadding + chartHeight - totalH),
          width: String(barWidth),
          height: String(Math.max(failureH, 2)),
          fill: "var(--af-red)",
          opacity: "0.85",
        }),
      );
    }

    // Empty day placeholder
    if (total === 0) {
      svg.appendChild(
        svgEl("rect", {
          x: String(x),
          y: String(topPadding + chartHeight - 3),
          width: String(barWidth),
          height: "3",
          rx: "1.5",
          fill: "var(--af-text-faint)",
          opacity: "0.2",
        }),
      );
    }

    // Count label above the bar
    if (total > 0) {
      const countLabel = svgEl("text", {
        x: String(x + barWidth / 2),
        y: String(topPadding + chartHeight - totalH - 5),
        "text-anchor": "middle",
        "font-size": "10",
        "font-weight": "600",
        fill: "var(--af-text-secondary)",
      });
      countLabel.textContent = String(total);
      svg.appendChild(countLabel);
    }

    // Date label below the bar — formatted nicely
    const label = svgEl("text", {
      x: String(x + barWidth / 2),
      y: String(topPadding + chartHeight + 16),
      "text-anchor": "middle",
      "font-size": "10",
      fill: "var(--af-text-muted)",
    });
    label.textContent = formatDateLabel(d.date);
    svg.appendChild(label);
  }

  container.appendChild(svg);
}

export function renderDonutChart(container: HTMLElement, success: number, total: number): void {
  const size = 130;
  const radius = 46;
  const stroke = 12;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * radius;
  const rate = total > 0 ? success / total : 0;
  const successArc = circumference * rate;
  const failureArc = circumference - successArc;

  const svg = svgEl("svg", {
    viewBox: `0 0 ${size} ${size}`,
    width: String(size),
    height: String(size),
    class: "af-chart-donut",
  });

  // Background ring
  svg.appendChild(
    svgEl("circle", {
      cx: String(cx),
      cy: String(cy),
      r: String(radius),
      fill: "none",
      stroke: total > 0 ? "var(--af-red)" : "var(--af-text-faint)",
      "stroke-width": String(stroke),
      opacity: "0.2",
    }),
  );

  // Success arc
  if (rate > 0) {
    svg.appendChild(
      svgEl("circle", {
        cx: String(cx),
        cy: String(cy),
        r: String(radius),
        fill: "none",
        stroke: "var(--af-green)",
        "stroke-width": String(stroke),
        "stroke-dasharray": `${successArc} ${failureArc}`,
        "stroke-dashoffset": String(circumference * 0.25),
        "stroke-linecap": "round",
      }),
    );
  }

  // Percentage text
  const pctText = svgEl("text", {
    x: String(cx),
    y: String(cy - 4),
    "text-anchor": "middle",
    "dominant-baseline": "middle",
    "font-size": "24",
    "font-weight": "700",
    fill: "var(--af-text-primary)",
  });
  pctText.textContent = `${Math.round(rate * 100)}%`;
  svg.appendChild(pctText);

  // "success" label
  const labelText = svgEl("text", {
    x: String(cx),
    y: String(cy + 18),
    "text-anchor": "middle",
    "font-size": "10",
    fill: "var(--af-text-muted)",
  });
  labelText.textContent = `${success}/${total} runs`;
  svg.appendChild(labelText);

  container.appendChild(svg);
}
