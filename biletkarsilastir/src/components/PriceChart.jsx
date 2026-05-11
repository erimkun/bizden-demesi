import React, { useEffect, useRef, useState } from 'react';

const PLATFORM_COLORS = {
  biletix:      '#E8472A',
  passo:        '#00A651',
  bubilet:      '#7C3AED',
  biletino:     '#F59E0B',
  mobilet:      '#111827',
  eventbrite:   '#F05537',
  ticketmaster: '#026CDF',
};

const API_URL = import.meta.env.VITE_API_URL || '';

async function fetchHistory(eventId) {
  try {
    const res = await fetch(`${API_URL}/api/events/${eventId}/history?all=1&limit=1000`);
    if (!res.ok) return null;
    const json = await res.json();
    if (!json.success) return null;
    const labels = [];
    const result = {};
    for (const [pid, entries] of Object.entries(json.data.history)) {
      result[pid] = entries
        .filter(e => e.price !== null && e.available !== false)
        .map(e => ({
          x: formatHistoryLabel(e.scraped_at),
          y: e.price,
          scraped_at: e.scraped_at,
        }));
      for (const point of result[pid]) labels.push(point.x);
    }
    return {
      labels: [...new Set(labels)],
      series: result,
      fromApi: true,
    };
  } catch {
    return null;
  }
}

function formatHistoryLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || '');
  return date.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' });
}

function fallbackHistory(priceHistory = {}) {
  const maxLength = Math.max(0, ...Object.values(priceHistory).map(values => values?.length || 0));
  const labels = Array.from({ length: maxLength }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (maxLength - i - 1));
    return date.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' });
  });
  const series = Object.fromEntries(
    Object.entries(priceHistory).map(([pid, values]) => [
      pid,
      (values || []).map((price, i) => ({ x: labels[i], y: price })),
    ])
  );
  return { labels, series, fromApi: false };
}

export default function PriceChart({ event, activePlatforms }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const [history, setHistory] = useState(null);

  useEffect(() => {
    setHistory(null);
    fetchHistory(event.id).then(apiHistory => {
      setHistory(apiHistory || fallbackHistory(event.priceHistory || {}));
    });
  }, [event.id]);

  useEffect(() => {
    if (!canvasRef.current || history === null) return;

    const ctx = canvasRef.current.getContext('2d');
    if (chartRef.current) chartRef.current.destroy();

    const datasets = activePlatforms
      .filter(pid => history.series[pid]?.length)
      .map(pid => ({
        label: pid,
        data: history.series[pid],
        borderColor: PLATFORM_COLORS[pid] || '#888',
        backgroundColor: 'rgba(255,255,255,0)',
        borderWidth: 2,
        pointRadius: history.series[pid].length < 18 ? 2.5 : 0,
        pointHoverRadius: 4,
        tension: 0.32,
        parsing: { xAxisKey: 'x', yAxisKey: 'y' },
      }));

    chartRef.current = new window.Chart(ctx, {
      type: 'line',
      data: { labels: history.labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => `${ctx.dataset.label}: ₺${ctx.raw?.y?.toLocaleString('tr-TR')}`,
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: { size: 11 }, color: '#888', autoSkip: true, maxRotation: 0 },
          },
          y: {
            grid: { color: 'rgba(128,128,128,0.08)' },
            ticks: {
              font: { size: 11 },
              color: '#888',
              callback: v => '₺' + v.toLocaleString('tr-TR'),
            },
          },
        },
      },
    });

    return () => { if (chartRef.current) chartRef.current.destroy(); };
  }, [event.id, activePlatforms, history]);

  return (
    <div className="price-chart-shell">
      {history === null && (
        <div className="chart-loading">
          <span />
          Fiyat geçmişi yükleniyor
        </div>
      )}
      {history && !Object.values(history.series).some(points => points.length) && (
        <div className="chart-loading">
          Henüz fiyat geçmişi yok
        </div>
      )}
      <canvas ref={canvasRef} />
    </div>
  );
}
