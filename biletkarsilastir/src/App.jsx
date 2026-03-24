import React, { useState, useMemo, useRef, useEffect } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin';
import { useGSAP } from '@gsap/react';
import StatusBar from './components/StatusBar';
import EventCard from './components/EventCard';
import PricePanel from './components/PricePanel';
import { CATEGORIES } from './data/mockData';
import { usePriceData } from './hooks/usePriceData';
import banner from './data/banner.png';

gsap.registerPlugin(useGSAP, ScrollTrigger, ScrollToPlugin);

export default function App() {
  const { events, status, lastFetch, countdown, refresh } = usePriceData();
  const appRef = useRef(null);
  const panelAnchorRef = useRef(null);
  const [showIntro, setShowIntro] = useState(true);
  const [activeCategory, setActiveCategory] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('date');

  const filtered = useMemo(() => {
    let list = events;
    if (activeCategory !== 'all') list = list.filter(e => e.category === activeCategory);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(e =>
        e.name.toLowerCase().includes(q) ||
        e.venue.toLowerCase().includes(q) ||
        e.city.toLowerCase().includes(q) ||
        e.tags.some(t => t.includes(q))
      );
    }
    if (sortBy === 'price-asc') {
      list = [...list].sort((a, b) => {
        const bA = Object.values(a.prices).filter(p => p.available && p.amount).map(p => p.amount);
        const bB = Object.values(b.prices).filter(p => p.available && p.amount).map(p => p.amount);
        return (Math.min(...bA) || 0) - (Math.min(...bB) || 0);
      });
    } else if (sortBy === 'price-desc') {
      list = [...list].sort((a, b) => {
        const bA = Object.values(a.prices).filter(p => p.available && p.amount).map(p => p.amount);
        const bB = Object.values(b.prices).filter(p => p.available && p.amount).map(p => p.amount);
        return (Math.min(...bB) || 0) - (Math.min(...bA) || 0);
      });
    }
    return list;
  }, [events, activeCategory, search, sortBy]);

  const selectedEvent = events.find(e => e.id === selectedId);
  const filteredKey = filtered.map(e => e.id).join('|');

  const handleSelect = (id) => {
    setSelectedId(prev => prev === id ? null : id);
  };

  useEffect(() => {
    if (!showIntro) return undefined;

    // Fallback close for StrictMode/dev double-invocation edge cases.
    const fallbackId = window.setTimeout(() => {
      setShowIntro(false);
    }, 4200);

    return () => window.clearTimeout(fallbackId);
  }, [showIntro]);

  useGSAP(() => {
    if (!showIntro) return undefined;
    const introTl = gsap.timeline({ defaults: { ease: 'power3.out' } });

    gsap.set('.intro-overlay', { autoAlpha: 1 });
    gsap.set('.intro-shell', { autoAlpha: 0, y: 42, scale: 0.84, rotationX: -12 });
    gsap.set('.intro-mark', { y: 18, autoAlpha: 0 });
    gsap.set('.intro-title', { y: 24, autoAlpha: 0 });
    gsap.set('.intro-sub', { y: 12, autoAlpha: 0 });
    gsap.set('.intro-scan', { scaleX: 0, autoAlpha: 0.85 });

    introTl
      .fromTo(
        '.intro-shell',
        { scale: 0.84, y: 42, rotationX: -12, autoAlpha: 0 },
        { scale: 1, y: 0, rotationX: 0, autoAlpha: 1, duration: 0.62, ease: 'back.out(1.25)' },
        0
      )
      .to('.intro-mark', { y: 0, autoAlpha: 1, duration: 0.28 }, '-=0.28')
      .to(
        '.intro-title',
        { y: 0, autoAlpha: 1, filter: 'blur(0px)', letterSpacing: '-0.03em', duration: 0.44 },
        '-=0.16'
      )
      .to('.intro-sub', { y: 0, autoAlpha: 1, duration: 0.28 }, '-=0.24')
      .fromTo('.intro-scan', { scaleX: 0, autoAlpha: 0.45 }, { scaleX: 1, autoAlpha: 1, duration: 0.4 }, '-=0.04')
      .to('.intro-shell', { scale: 1.014, duration: 0.12, yoyo: true, repeat: 1 }, '-=0.08')
      .to('.intro-overlay', {
        autoAlpha: 0,
        duration: 0.36,
        delay: 0.42,
        onComplete: () => setShowIntro(false),
      });

    return () => {
      introTl.kill();
    };
  }, { scope: appRef, dependencies: [showIntro] });

  useGSAP(() => {
    const root = appRef.current;
    if (!root) return undefined;

    const mm = gsap.matchMedia();

    mm.add({ reduceMotion: '(prefers-reduced-motion: reduce)' }, (context) => {
      const { reduceMotion } = context.conditions;

      const tl = gsap.timeline({
        defaults: {
          ease: 'power3.out',
          duration: reduceMotion ? 0 : 0.55,
        },
      });

      tl.from('.js-hero-pitch', { y: 24, autoAlpha: 0 })
        .from('.js-toolbar', { y: 14, autoAlpha: 0 }, '-=0.32')
        .from(
          '.js-category-nav .cat-btn',
          { y: 12, autoAlpha: 0, stagger: reduceMotion ? 0 : 0.04, duration: reduceMotion ? 0 : 0.34 },
          '-=0.2'
        )
        .from('.js-status-dock', { y: 12, autoAlpha: 0, duration: reduceMotion ? 0 : 0.3 }, '-=0.2');
    });

    return () => mm.revert();
  }, { scope: appRef });

  useGSAP(() => {
    const root = appRef.current;
    if (!root) return undefined;

    const mm = gsap.matchMedia();

    mm.add({ reduceMotion: '(prefers-reduced-motion: reduce)' }, (context) => {
      const { reduceMotion } = context.conditions;
      if (reduceMotion) return;

      const cards = gsap.utils.toArray('.events-grid .event-card');
      if (!cards.length) return;

      gsap.fromTo(
        cards,
        { y: 18, autoAlpha: 0, scale: 0.985 },
        {
          y: 0,
          autoAlpha: 1,
          scale: 1,
          duration: 0.46,
          stagger: { each: 0.05, from: 'start' },
          ease: 'power2.out',
          clearProps: 'transform,opacity,visibility',
        }
      );
    });

    return () => mm.revert();
  }, { scope: appRef, dependencies: [filteredKey], revertOnUpdate: true });

  useGSAP(() => {
    const root = appRef.current;
    if (!root) return undefined;

    const mm = gsap.matchMedia();

    mm.add(
      {
        desktop: '(min-width: 900px)',
        reduceMotion: '(prefers-reduced-motion: reduce)',
      },
      (context) => {
        const { desktop, reduceMotion } = context.conditions;
        if (reduceMotion) return;

        gsap.to('.app-glow-a', {
          y: desktop ? 100 : 30,
          x: desktop ? -40 : -10,
          ease: 'none',
          scrollTrigger: {
            trigger: root,
            start: 'top top',
            end: 'bottom top',
            scrub: 1,
          },
        });

        gsap.to('.app-glow-b', {
          y: desktop ? -80 : -20,
          x: desktop ? 45 : 10,
          ease: 'none',
          scrollTrigger: {
            trigger: root,
            start: 'top top',
            end: 'bottom top',
            scrub: 1,
          },
        });
      }
    );

    return () => mm.revert();
  }, { scope: appRef });

  useEffect(() => {
    if (!selectedEvent) return undefined;

    let raf1 = 0;
    let raf2 = 0;

    const run = () => {
      const anchor = panelAnchorRef.current;
      if (!anchor) return;

      const panel = anchor.querySelector('.price-panel');
      if (!panel) return;

      const topOffset = 84;
      const targetY = Math.max(anchor.getBoundingClientRect().top + window.scrollY - topOffset, 0);
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      gsap.killTweensOf(window);

      if (reduceMotion) {
        window.scrollTo(0, targetY);
        return;
      }

      gsap.fromTo(
        panel,
        { y: 20, autoAlpha: 0 },
        {
          y: 0,
          autoAlpha: 1,
          duration: 0.42,
          ease: 'power3.out',
          overwrite: 'auto',
        }
      );

      gsap.to(window, {
        duration: 0.7,
        ease: 'power2.out',
        scrollTo: {
          y: targetY,
          autoKill: false,
        },
        overwrite: 'auto',
      });
    };

    // Wait for the panel DOM and layout to settle before measuring targetY.
    raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(run);
    });

    return () => {
      if (raf1) window.cancelAnimationFrame(raf1);
      if (raf2) window.cancelAnimationFrame(raf2);
      gsap.killTweensOf(window);
    };
  }, [selectedEvent?.id]);

  return (
    <div className="app" ref={appRef}>
      {showIntro && (
        <div className="intro-overlay" aria-hidden="true">
          <div className="intro-shell">
            <p className="intro-mark">CANLI KARSILASTIRMA</p>
            <h2 className="intro-title">BiletKarsilastir</h2>
            <p className="intro-sub">Platform fiyatlari tek bakista.</p>
            <div className="intro-scan" />
          </div>
        </div>
      )}

      <div className="app-glow app-glow-a" aria-hidden="true" />
      <div className="app-glow app-glow-b" aria-hidden="true" />

      <header className="app-header">
        <div className="header-inner">
          <div className="header-content js-hero-pitch">
            <div className="brand">
              <span className="brand-icon">◈</span>
              <span className="brand-name">BiletKarşılaştır</span>
            </div>
            <h1 className="hero-title">Fiyatı tek tek gezmeden, en iyi bileti aynı ekranda bul.</h1>
            <p className="hero-copy">
              Etkinliğini seç, platform fiyatlarını ve 48 saatlik değişimi birlikte gör, sonra doğrudan satın alma adımına geç.
            </p>
          </div>
          <div className="header-visual">
            <img src={banner} className="banner-img" alt="BiletKarşılaştır Illustration" />
          </div>
        </div>
      </header>

      <div className="toolbar js-toolbar">
        <input
          className="search-input"
          type="text"
          placeholder="Etkinlik, mekan veya şehir ara..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className="sort-select" value={sortBy} onChange={e => setSortBy(e.target.value)}>
          <option value="date">Tarihe göre</option>
          <option value="price-asc">Fiyat: Düşükten yükseğe</option>
          <option value="price-desc">Fiyat: Yüksekten düşüğe</option>
        </select>
      </div>

      <nav className="category-nav js-category-nav">
        {CATEGORIES.map(cat => (
          <button
            key={cat.id}
            className={`cat-btn${activeCategory === cat.id ? ' active' : ''}`}
            onClick={() => { setActiveCategory(cat.id); setSelectedId(null); }}
          >
            {cat.label}
          </button>
        ))}
      </nav>

      <main className="main-content">
        {filtered.length === 0 ? (
          <div className="empty-state">
            <p>Arama kriterlerinize uygun etkinlik bulunamadı.</p>
          </div>
        ) : (
          <div className="events-grid">
            {filtered.map(ev => (
              <EventCard
                key={ev.id}
                event={ev}
                selected={ev.id === selectedId}
                onClick={() => handleSelect(ev.id)}
              />
            ))}
          </div>
        )}

        {selectedEvent && (
          <div ref={panelAnchorRef} className="js-selected-panel-anchor">
            <PricePanel
              event={selectedEvent}
              onClose={() => setSelectedId(null)}
            />
          </div>
        )}
      </main>

      <div className="status-dock js-status-dock">
        <StatusBar
          status={status}
          lastFetch={lastFetch}
          countdown={countdown}
          onRefresh={refresh}
          refreshing={status === 'fetching'}
        />
      </div>

      <footer className="app-footer">
        <p>BiletKarşılaştır — Faz 1 (Mock Data) · Fiyatlar {new Date().toLocaleDateString('tr-TR')} tarihi itibarıyla</p>
        <p className="footer-note">Bu uygulama gerçek bilet satışı yapmaz. Fiyat bilgileri temsilidir.</p>
      </footer>
    </div>
  );
}
