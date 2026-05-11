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
    const res = await fetch(`${API_URL}/api/events/${eventId}/history?hours=48`);
    if (!res.ok) return null;
    const json = await res.json();
    if (!json.success) return null;
    // API returns { [platform]: [{ price, available, scraped_at }, ...] }
    // Convert to { [platform]: number[] } for Chart.js
    const result = {};
    for (const [pid, entries] of Object.entries(json.data.history)) {
      result[pid] = entries.map(e => e.price);
    }
    return result;
  } catch {
    return null;
  }
}

export default function PriceChart({ event, activePlatforms }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const [history, setHistory] = useState(null);

  useEffect(() => {
    setHistory(null);
    fetchHistory(event.id).then(apiHistory => {
      setHistory(apiHistory || event.priceHistory || {});
    });
  }, [event.id]);

  useEffect(() => {
    if (!canvasRef.current || history === null) return;

    const ctx = canvasRef.current.getContext('2d');
    if (chartRef.current) chartRef.current.destroy();

    const labels = Array.from({ length: 48 }, (_, i) => {
      if (i % 8 === 0) {
        const h = new Date();
        h.setHours(h.getHours() - (48 - i));
        return h.getHours() + ':00';
      }
      return '';
    });

    const datasets = activePlatforms
      .filter(pid => history[pid]?.length)
      .map(pid => ({
        label: pid,
        data: history[pid],
        borderColor: PLATFORM_COLORS[pid] || '#888',
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0.3,
      }));

    chartRef.current = new window.Chart(ctx, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => `${ctx.dataset.label}: ₺${ctx.raw?.toLocaleString('tr-TR')}`,
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: { size: 11 }, color: '#888', autoSkip: false, maxRotation: 0 },
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
    <div style={{ position: 'relative', height: 200, width: '100%' }}>
      {history === null && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: 13 }}>
          Yükleniyor…
        </div>
      )}
      <canvas ref={canvasRef} />
    </div>
  );
}
