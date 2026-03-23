import React from 'react';
import { formatTime } from '../utils/priceUtils';

export default function StatusBar({ status, lastFetch, countdown, onRefresh, refreshing }) {
  const { h, m, s } = countdown;
  const pad = n => String(n).padStart(2, '0');

  const statusConfig = {
    idle:     { dot: '#3B6D11', label: 'Veriler güncel' },
    fetching: { dot: '#BA7517', label: 'Güncelleniyor…', pulse: true },
    updated:  { dot: '#3B6D11', label: 'Veriler güncellendi' },
    error:    { dot: '#A32D2D', label: 'Güncelleme başarısız' },
  };
  const cfg = statusConfig[status] || statusConfig.idle;

  return (
    <div className="status-bar">
      <div className="status-info">
        <span className={`status-dot${cfg.pulse ? ' pulse' : ''}`} style={{ background: cfg.dot }} />
        <span className="status-label">{cfg.label}</span>
        {lastFetch && (
          <span className="last-fetch">Son güncelleme: {formatTime(lastFetch)}</span>
        )}
        <span className="countdown">
          Sonraki güncelleme: {pad(h)}:{pad(m)}:{pad(s)}
        </span>
      </div>

      <button className="status-refresh-btn" onClick={onRefresh} disabled={refreshing}>
        {refreshing ? '⟳ Güncelleniyor' : '⟳ Güncelle'}
      </button>
    </div>
  );
}
