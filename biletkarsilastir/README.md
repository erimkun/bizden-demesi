# BiletKarşılaştır 🎟️

Biletix, Passo, Eventbrite ve Ticketmaster üzerindeki etkinlik biletlerini karşılaştıran platform.

## Faz 1 — Kurulum (Mock Data)

```bash
cd biletkarsilastir
npm install
npm run dev
```

Uygulama `http://localhost:5173` adresinde çalışır.

## Proje Yapısı

```
src/
  data/
    mockData.js         ← Etkinlikler ve platform verileri
  components/
    StatusBar.jsx       ← Güncelleme durumu ve geri sayım
    EventCard.jsx       ← Etkinlik listesi kartı
    PricePanel.jsx      ← Fiyat karşılaştırma paneli
    PriceChart.jsx      ← 48 saatlik fiyat grafiği (Chart.js)
  hooks/
    usePriceData.js     ← 4 saatlik güncelleme mantığı
  utils/
    priceUtils.js       ← Fiyat hesaplama ve localStorage yardımcıları
  App.jsx               ← Ana uygulama
  index.css             ← Stiller
```

## Özellikler

- ✅ 4 platform fiyat karşılaştırması (Biletix, Passo, Eventbrite, Ticketmaster)
- ✅ 48 saatlik fiyat geçmişi grafiği (platform bazlı toggle)
- ✅ 4 saatlik otomatik güncelleme (geri sayım ile)
- ✅ Kategori filtresi ve arama
- ✅ Fiyata göre sıralama
- ✅ "En ucuz" platform vurgulama
- ✅ Doğrudan satın alma linkleri
- ✅ localStorage ile fiyat geçmişi saklama
- ✅ Dark mode desteği

## Faz 2'ye Geçiş

`FAZ2_REHBER.md` dosyasına bakın.
