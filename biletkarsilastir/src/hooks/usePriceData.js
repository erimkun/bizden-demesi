import { useState, useEffect, useCallback, useRef } from 'react';
import { EVENTS } from '../data/mockData';
import {
  getLastFetchTime, setLastFetchTime, isDueForUpdate,
  getTimeUntilUpdate, savePriceSnapshot
} from '../utils/priceUtils';

const SIMULATE_PRICE_DRIFT = true;

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

export function usePriceData() {
  const [events, setEvents] = useState(EVENTS);
  const [status, setStatus] = useState('idle'); // idle | fetching | updated | error
  const [lastFetch, setLastFetch] = useState(getLastFetchTime());
  const [countdown, setCountdown] = useState({ h: 4, m: 0, s: 0, diff: 14400000 });
  const timerRef = useRef(null);
  const fetchRef = useRef(null);

  const doFetch = useCallback(async () => {
    setStatus('fetching');
    try {
      await new Promise(r => setTimeout(r, 1200));
      const updated = SIMULATE_PRICE_DRIFT ? simulatePriceUpdate(events) : events;
      setEvents(updated);
      savePriceSnapshot(updated);
      const now = new Date();
      setLastFetchTime(now);
      setLastFetch(now);
      setStatus('updated');
      setTimeout(() => setStatus('idle'), 3000);
    } catch (e) {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 4000);
    }
  }, [events]);

  useEffect(() => {
    if (!getLastFetchTime()) {
      setLastFetchTime(new Date());
      setLastFetch(new Date());
      savePriceSnapshot(EVENTS);
    }
  }, []);

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

  return { events, status, lastFetch, countdown, refresh: doFetch };
}
