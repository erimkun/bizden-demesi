# Phase 2 Cleanup & Completion — Design Spec
Date: 2026-04-30

## Scope
Complete Phase 2d (frontend API wiring), clean up disorganized files, fix two code bugs, and add GitHub Actions CI/CD.

## File Cleanup
- Delete `all_code.md` and `all_code.txt` (generated dump files at root)
- `git rm -r --cached biletkarsilastir/dist/` — stop tracking built artifacts
- Move `biletkarsilastir/FAZ2_REHBER.md` → root `FAZ2_REHBER.md`
- Update root `.gitignore`: add `all_code.*`, `biletkarsilastir/dist/`, env local files
- Add `biletkarsilastir/.env.local.example` documenting `VITE_API_URL`

## Code Fixes
- `usePriceData.js`: fix closure bug — `doFetch` captures stale `events`; switch to `setEvents(prev => simulatePriceUpdate(prev))` so dependency on `events` state is removed
- `App.jsx` footer: update "Faz 1 (Mock Data)" → "Faz 2"

## Phase 2d — Frontend API Wiring
- `usePriceData.js`: if `VITE_API_URL` is set, fetch from `GET /api/events`; on failure fall back to mock data
- `PriceChart.jsx` / `PricePanel.jsx`: if API available, fetch history from `GET /api/events/:id/history`; fall back to `event.priceHistory`
- Pass `last_updated` from API response through to `StatusBar`

## GitHub Actions
- `.github/workflows/ci.yml`: on push + PR → frontend install+build, backend install
- `.github/workflows/deploy.yml`: on push to master → deploy frontend to Vercel via CLI
