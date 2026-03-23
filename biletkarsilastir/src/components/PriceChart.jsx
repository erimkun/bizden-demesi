import React, { useEffect, useRef } from 'react';

const PLATFORM_COLORS = {
  biletix:      '#E8472A',
  passo:        '#00A651',
  eventbrite:   '#F05537',
  ticketmaster: '#026CDF',
};

export default function PriceChart({ event, activePlatforms }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;

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
      .filter(pid => event.priceHistory[pid])
      .map(pid => ({
        label: pid,
        data: event.priceHistory[pid],
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
  }, [event, activePlatforms]);

  return (
    <div style={{ position: 'relative', height: 200, width: '100%' }}>
      <canvas ref={canvasRef} />
    </div>
  );
}
