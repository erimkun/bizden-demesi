import { useState, useEffect, useCallback, useRef } from 'react';
import { EVENTS } from '../data/mockData';
import {
  getLastFetchTime, setLastFetchTime, isDueForUpdate,
  getTimeUntilUpdate, savePriceSnapshot
} from '../utils/priceUtils';

// Same Vercel domain — API lives at /api/* alongside the frontend.
// Set VITE_API_URL only when running the frontend against a separate backend (e.g. local dev).
const API_URL = import.meta.env.VITE_API_URL || '';

function simulatePriceUpdate(events) {
  return events.map(ev => ({
    ...ev,
    prices: Object.fromEntries(
      Object.entries(ev.prices).map(([platform, data]) => {
        if (!data.available || data.amount === null) return [platform, data];
        const drift = (Math.random() - 0.49) * 0.02;
        const newAmount = Math.round(data.amount * (1 + drift));
        return [platform, { ...data, amount: newAmount }];
      })
    ),
  }));
}

async function fetchEventsFromApi() {
  const res = await fetch(`${API_URL}/api/events`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const json = await res.json();
  if (!json.success) throw new Error('API returned success=false');
  return json.data.map(ev => ({
    ...ev,
    // API prices use `amount`; ensure priceHistory is present (may be empty from API)
    priceHistory: ev.priceHistory || {},
  }));
}

export function usePriceData() {
  const [events, setEvents] = useState(EVENTS);
  const [status, setStatus] = useState('fetching');
  const [lastFetch, setLastFetch] = useState(getLastFetchTime());
  const [countdown, setCountdown] = useState({ h: 4, m: 0, s: 0, diff: 14400000 });
  const [usingApi, setUsingApi] = useState(false);
  const timerRef = useRef(null);
  const fetchRef = useRef(null);

  const doFetch = useCallback(async () => {
    setStatus('fetching');
    try {
      await new Promise(r => setTimeout(r, 600));

      const apiEvents = await fetchEventsFromApi();
      setEvents(apiEvents);
      setUsingApi(true);
      savePriceSnapshot(apiEvents);

      const now = new Date();
      setLastFetchTime(now);
      setLastFetch(now);
      setStatus('updated');
      setTimeout(() => setStatus('idle'), 3000);
    } catch (e) {
      console.warn('[usePriceData] fetch failed, falling back to mock drift:', e.message);
      // API failed — fall back to simulated drift
      setEvents(prev => {
        const updated = simulatePriceUpdate(prev);
        savePriceSnapshot(updated);
        return updated;
      });
      setStatus('error');
      setTimeout(() => setStatus('idle'), 4000);
    }
  }, []); // no dependency on `events` — uses functional updater instead

  // Fetch real data on mount
  useEffect(() => { doFetch(); }, [doFetch]);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCountdown(getTimeUntilUpdate());
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, []);

  useEffect(() => {
    fetchRef.current = setInterval(() => {
      if (isDueForUpdate()) doFetch();
    }, 60 * 1000);
    return () => clearInterval(fetchRef.current);
  }, [doFetch]);

  return { events, status, lastFetch, countdown, refresh: doFetch, usingApi };
}
