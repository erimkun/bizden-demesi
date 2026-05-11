import React, { useRef, useState } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import PriceChart from './PriceChart';
import { PLATFORMS } from '../data/mockData';
import { getCheapestPlatform, formatPrice } from '../utils/priceUtils';

gsap.registerPlugin(useGSAP);

export default function PricePanel({ event, onClose }) {
  const panelRef = useRef(null);
  const cheapestId = getCheapestPlatform(event.prices);
  const availPlatforms = PLATFORMS.filter(p => event.prices[p.id]?.available);
  const [activePlatforms, setActivePlatforms] = useState(availPlatforms.map(p => p.id));
  const panelMeta = [event.date, event.time, event.venue, event.city].filter(Boolean).join(' · ') || 'Etkinlik detayları yakında';

  const togglePlatform = (id) => {
    setActivePlatforms(prev =>
      prev.includes(id)
        ? prev.length > 1 ? prev.filter(p => p !== id) : prev
        : [...prev, id]
    );
  };

  const sorted = [...PLATFORMS]
    .filter(p => event.prices[p.id]?.available && event.prices[p.id]?.amount !== null)
    .sort((a, b) => event.prices[a.id].amount - event.prices[b.id].amount);

  useGSAP(() => {
    const mm = gsap.matchMedia();

    mm.add({ reduceMotion: '(prefers-reduced-motion: reduce)' }, (context) => {
      const { reduceMotion } = context.conditions;

      const tl = gsap.timeline({
        defaults: {
          ease: 'power3.out',
          duration: reduceMotion ? 0 : 0.4,
        },
      });

      tl.from('.js-panel-shell', { y: 22, autoAlpha: 0 })
        .from('.js-platform-row', { y: 14, autoAlpha: 0, stagger: reduceMotion ? 0 : 0.04, duration: reduceMotion ? 0 : 0.32 }, '-=0.2')
        .from('.js-legend-btn', { y: 10, autoAlpha: 0, stagger: reduceMotion ? 0 : 0.03, duration: reduceMotion ? 0 : 0.26 }, '-=0.22');
    });

    return () => mm.revert();
  }, { scope: panelRef, dependencies: [event.id], revertOnUpdate: true });

  return (
    <div className="price-panel js-panel-shell" ref={panelRef}>
      <div className="price-panel-header">
        <div>
          <h2 className="panel-title">{event.name}</h2>
          <p className="panel-sub">{panelMeta}</p>
        </div>
        <button className="close-btn" onClick={onClose} aria-label="Kapat">×</button>
      </div>

      <div className="panel-body">
        <div className="panel-left">
          <div className="section-label">Platform karşılaştırması</div>
          <div className="platform-list">
            {sorted.map(p => {
              const data = event.prices[p.id];
              const isBest = p.id === cheapestId;
              return (
                <div key={p.id} className={`platform-row js-platform-row${isBest ? ' best' : ''}`}>
                  <div className="platform-info">
                    <span className="platform-dot-lg" style={{ background: p.color }} />
                    <span className="platform-name">{p.name}</span>
                    {isBest && <span className="best-badge">En ucuz</span>}
                  </div>
                  <div className="platform-right">
                    <span className="platform-price" style={{ color: isBest ? '#0C447C' : undefined }}>
                      {formatPrice(data.amount)}
                    </span>
                    {data.category && (
                      <span className="platform-cat">{data.category}</span>
                    )}
                    <a
                      href={data.url || p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="buy-btn"
                      style={{ borderColor: p.color, color: p.color }}
                      onClick={e => e.stopPropagation()}
                    >
                      Satın al ↗
                    </a>
                  </div>
                </div>
              );
            })}

            {PLATFORMS.filter(p => !event.prices[p.id]?.available).map(p => (
              <div key={p.id} className="platform-row js-platform-row unavailable">
                <div className="platform-info">
                  <span className="platform-dot-lg" style={{ background: '#ccc' }} />
                  <span className="platform-name" style={{ opacity: 0.4 }}>{p.name}</span>
                </div>
                <span className="unavail-label">Mevcut değil</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel-right">
          <div className="section-label">48 saatlik fiyat grafiği</div>

          <div className="chart-legend">
            {PLATFORMS.filter(p => event.prices[p.id]?.available && event.prices[p.id]?.amount !== null).map(p => (
              <button
                key={p.id}
                className={`legend-btn js-legend-btn${activePlatforms.includes(p.id) ? ' active' : ''}`}
                onClick={() => togglePlatform(p.id)}
              >
                <span className="legend-dot" style={{ background: activePlatforms.includes(p.id) ? p.color : '#ccc' }} />
                {p.name}
              </button>
            ))}
          </div>

          <PriceChart event={event} activePlatforms={activePlatforms} />

          {event.description && <p className="panel-desc">{event.description}</p>}

          {!!event.tags?.length && (
            <div className="tag-list">
              {event.tags.map(t => <span key={t} className="tag">#{t}</span>)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
