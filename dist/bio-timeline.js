// Each calendar year gets one equal-width column, including leap years.
export function timelinePosition(value, firstYear = 2017, endYear = 2027) {
  const date = value instanceof Date ? value : new Date(`${value}T00:00:00Z`);
  const year = date.getUTCFullYear();
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);
  const fraction = year + (date.getTime() - start) / (end - start);
  return Math.max(0, Math.min(100, (fraction - firstYear) / (endYear - firstYear) * 100));
}

export function initBioTimeline(now = new Date()) {
  document.querySelectorAll('.bio-chart').forEach(chart => {
    const firstYear = Number(chart.dataset.firstYear);
    const endYear = Number(chart.dataset.endYear);
    chart.querySelectorAll('[data-start]').forEach(period => {
      const start = timelinePosition(period.dataset.start, firstYear, endYear);
      const end = timelinePosition(period.dataset.end === 'present' ? now : period.dataset.end, firstYear, endYear);
      period.style.setProperty('--start', `${start}%`);
      period.style.setProperty('--duration', `${Math.max(0, end - start)}%`);
    });
    chart.querySelectorAll('[data-date]').forEach(event => {
      event.style.setProperty('--at', `${timelinePosition(event.dataset.date, firstYear, endYear)}%`);
    });
  });
}
