import React, { useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { getBestPrice, getCheapestPlatform, get24hChange, formatPrice } from '../utils/priceUtils';
import { PLATFORMS } from '../data/mockData';

gsap.registerPlugin(useGSAP);

const CAT_LABELS = {
  konser:   'Konser / Müzik',
  tiyatro:  'Tiyatro / Sanat',
  festival: 'Festival / Kültür',
  spor:     'Spor',
};

const AVAIL_LABELS = {
  available: null,
  limited:   'Son biletler',
  soldout:   'Tükendi',
};

export default function EventCard({ event, selected, onClick }) {
  const cardRef = useRef(null);
  const best = getBestPrice(event.prices);
  const cheapestId = getCheapestPlatform(event.prices);
  const cheapest = PLATFORMS.find(p => p.id === cheapestId);
  const allHistory = Object.values(event.priceHistory || {})[0] || [];
  const change = get24hChange(allHistory);
  const availLabel = AVAIL_LABELS[event.availability];
  const categoryLabel = CAT_LABELS[event.category] || 'Etkinlik';
  const dateLine = [event.date, event.time].filter(Boolean).join(' · ') || 'Tarih yakında';
  const placeLine = [event.venue, event.city].filter(Boolean).join(', ') || 'Mekan yakında';

  const availPlatforms = PLATFORMS.filter(p =>
    event.prices[p.id]?.available && event.prices[p.id]?.amount !== null
  );

  useGSAP(() => {
    const card = cardRef.current;
    if (!card) return;

    const mm = gsap.matchMedia();

    mm.add(
      {
        finePointer: '(hover: hover) and (pointer: fine)',
        reduceMotion: '(prefers-reduced-motion: reduce)',
      },
      (context) => {
        const { finePointer, reduceMotion } = context.conditions;
        if (!finePointer || reduceMotion) return;

        const rotateXTo = gsap.quickTo(card, 'rotationX', { duration: 0.28, ease: 'power3.out' });
        const rotateYTo = gsap.quickTo(card, 'rotationY', { duration: 0.28, ease: 'power3.out' });
        const yTo = gsap.quickTo(card, 'y', { duration: 0.26, ease: 'power2.out' });

        gsap.set(card, {
          transformPerspective: 900,
          transformOrigin: 'center center',
        });

        const onMove = (e) => {
          const bounds = card.getBoundingClientRect();
          const px = (e.clientX - bounds.left) / bounds.width;
          const py = (e.clientY - bounds.top) / bounds.height;

          rotateYTo(gsap.utils.mapRange(0, 1, -7, 7, px));
          rotateXTo(gsap.utils.mapRange(0, 1, 7, -7, py));
          yTo(-6);

          card.style.setProperty('--mx', `${(px * 100).toFixed(2)}%`);
          card.style.setProperty('--my', `${(py * 100).toFixed(2)}%`);
        };

        const onLeave = () => {
          rotateXTo(0);
          rotateYTo(0);
          yTo(0);
          card.style.setProperty('--mx', '50%');
          card.style.setProperty('--my', '50%');
        };

        card.addEventListener('pointermove', onMove);
        card.addEventListener('pointerleave', onLeave);

        return () => {
          card.removeEventListener('pointermove', onMove);
          card.removeEventListener('pointerleave', onLeave);
        };
      }
    );

    return () => mm.revert();
  }, { scope: cardRef });

  return (
    <div
      ref={cardRef}
      className={`event-card${selected ? ' selected' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onClick()}
    >
      <div className="event-card-header">
        <div className="event-meta">
          <span className={`cat-badge cat-${event.category}`}>{categoryLabel}</span>
          {availLabel && <span className="avail-badge">{availLabel}</span>}
        </div>
        <h3 className="event-name">{event.name}</h3>
        <div className="event-info">
          <span>{dateLine}</span>
          <span>{placeLine}</span>
        </div>
      </div>

      <div className="event-card-price">
        <div className="price-main">
          <span className="best-price">{formatPrice(best)}</span>
          <span className="best-label">en ucuz</span>
          {cheapest && <span className="cheapest-from">— {cheapest.name}</span>}
        </div>
        <div className={`change-badge ${change > 0 ? 'up' : change < 0 ? 'down' : 'stable'}`}>
          {change > 0 ? '▲' : change < 0 ? '▼' : '—'}
          {change !== 0 ? ` %${Math.abs(change)}` : ' Sabit'}
        </div>
      </div>

      <div className="event-card-platforms">
        {availPlatforms.length ? availPlatforms.map(p => (
          <span key={p.id} className="platform-pill" style={{ borderColor: p.color }}>
            <span className="platform-dot" style={{ background: p.color }} />
            {p.name}
          </span>
        )) : <span className="platform-pill">Fiyat bekleniyor</span>}
      </div>
    </div>
  );
}
