# Desktop Scraper Genişleme Planı (Faz 5)

Sisteme Biletix dışında Türkiye'deki diğer önemli bilet platformlarını (Passo, Bubilet, Biletino, Mobilet, vb.) eklemek için Playwright / `browser-use` tabanlı ölçeklenebilir bir mimari kuracağız. Bu doküman, Copilot Agent (veya subagent) ile koordineli çalışarak platform bazlı kazıma yeteneklerini nasıl ekleyeceğimizi adım adım planlamaktadır.

## Hedef Platformlar:
1. **Passo** (Spor maçları, stadyum konserleri, büyük etkinlikler)
2. **Bubilet** (Daha uygun fiyatlı/genç kitleye hitap eden etkinlikler, tiyatrolar)
3. **Biletino** (Elektronik müzik, DJ setleri, özel organizasyonlar)
4. **Mobilet** (Tiyatrolar, butik mekanlar, özel konser salonları)
5. **Eventbrite** (B2B zirveler, sektörel buluşmalar, ücretsiz startup etkinlikleri)

---

## Geliştirme Akışı ve Agent (Bot) Talimatları

### Adım 1: Yeni Platform Klasör ve Konfigürasyon Yapısının Hazırlanması
Her yeni platform için `desktop-scraper/collectors/` altına bir JavaScript dosyası açılacaktır. Kodun yapısı `biletix.js` gibi modüler olacak; `collect({ page, url, eventName })` metodunu ihraç edecektir.

Agent'tan istenecek komut:
> `desktop-scraper/collectors/passo.js` isminde yeni bir toplayıcı (collector) oluştur. `biletix.js` dosyasını baz al ancak fonksiyon adlarını ve logları 'passo' olarak güncelle. Hedeflenen URL yapısı maçlar için ayrı konserler için ayrı değerlendirilmeli.

### Adım 2: Playwright Kodlama ve 'Browser Use' Yetenekleri (Skills) Kullanımı
Agent (özellikle otonom çalışan subagent) tarayıcı içi DOM analizi yetenekleri ile ilgili siteye gidebilir ve gerekli CSS Selector (seçicileri) otomatik keşfedebilir.

1. **`browser-use` Subagent Komutu (Tasarım Analizi İçin):**
   > "Browser'ı aç, 'https://www.passo.com.tr' veya 'https://www.bubilet.com.tr' üzerinden örnek bir konser sayfasına git. Satın alabileceğimiz veya bilet kategorilerinin/fiyatlarının listelendiği sayfadaki HTML element seçicilerini, biletin "Tükendi" olup olmadığını ve bilet tutarını tespit et."
   
2. **DOM Farklılıklarının Yönetimi:**
   - **Bubilet** için genellikle tek fiyatlı bloklar veya kategori seçimi.
   - **Passo** stadyum şablonları nedeniyle çok daha kompleks olabilir; sadece "En ucuz minimum fiyat" üzerinden başlanabilir.
   - Playwright kodu yazılırken fiyatların sonundaki "TL" veya "₺" ibarelerini sayısal değere (integer) dönüştürebilecek `parseInt` / `replace` rutinleri ortak bir yardımcı (utility) dosyasında tutulmalıdır.

### Adım 3: Etkinlik Keşfi (Discovery) Genişletmesi
Yalnızca `run.js` (detay tarama) değil, aynı zamanda projenin `events-to-track.json` dosyasını otomatik dolduran bir "Keşif Botu"na ihtiyacımız var (Mevcut `discover-biletix.js` gibi).

- **Yeni Dosyalar:** `discover-passo.js`, `discover-bubilet.js`
- Agent bu dosyaları yazarken arama / popüler etkinlikler sayfasına gidip sayfalama (`pagination`) işlemini yapabilen özel Playwright rutinleri eklemelidir.

### Adım 4: Cron Job Optimizasyonları (Rate Limits ve Engellerin Önlenmesi)
Bu kadar çok siteyi aynı IP'den otomatik kazımak, Bot koruma mekanizmalarına (Cloudflare, Imperva vb.) takılma riskini doğurur.

- Agent'ın önereceği taktikler:
  - Playwright başlarken gerçek insan gibi davranmasını sağlayan flag'ler (User-Agent rastgeleleştiricisi).
  - Eğer takılma yaşanırsa, `desktop-scrape.yml` içindeki Cron Job zamanını sadece gece değil, 4 parçaya (her 6 saatte bir belirli bir platform) bölebilecek şekilde GitHub Actions Job matrisi kullanılması.

## Özet Olarak Sonraki Hamlelerin Sırası:
1. `events-to-track.json` içerisine diğer platformlardan numune bilet URL'leri ekle.
2. Bubilet ve Passo için Playwright kodlarını (collector) yaz (`collectors/bubilet.js`, vb).
3. `desktop-scraper/run.js` içerisine COLLECTORS listesini genişlet ve entegre et.
4. Subagent/Playwright debug özellikleriyle script'i `--headed` modda test edip, buton tıklama/fiyat çekme işini onayla.
5. GitHub'a push ederek `desktop-scrape.yml`'ın (Az önce eklenen) sistemin veritabanına sorunsuz yazdığını canlıda gözlemle.