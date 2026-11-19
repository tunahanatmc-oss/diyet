# Beslenme Zekâsı — Kişisel Beslenme ve Kilo Takibi

_(Proje/kurulum adı: Diyet)_

Çevrimdışı çalışan, hesap istemeyen, verilerinizi **yalnızca kendi cihazınızda** tutan kişisel beslenme uygulaması.
Windows’ta kurulabilir bir program, iPhone’da ana ekrana eklenen bir uygulama (PWA) olarak çalışır. Aynı kod, iki cihaz.

**Ne yapar?**
- Besin arama (Türkçe/İngilizce, “pirinc” yazınca “pirinç” bulunur), gram veya ev ölçüsüyle (su bardağı, çay bardağı, yemek/tatlı/çay kaşığı) kayıt
- Kalori, protein, yağ, karbonhidrat, lif, şeker, doymuş yağ, sodyum + mikro besinler
- Çiğ ↔ pişmiş hesaplayıcı (tencereyi tartarak, eklenen yağ ve emilimi dahil)
- Tarifler: malzeme, pişmiş ağırlık, porsiyon, ölçekleme
- Kilo takibi: trend çizgisi, haftalık değişim, BMI, uyarlanabilir TDEE
- Haftalık plan, alışveriş listesi, kiler; tokluk notları
- Barkod (Open Food Facts, internet gerekir), isteğe bağlı yapay zekâ asistanı (kendi ücretsiz Gemini anahtarınızla)
- Yedek alma / geri yükleme, Excel için CSV

**Veri dürüstlüğü:** Her değerin yanında türü yazar — **ölçülmüş**, **kaynaklı**, **tahmini** veya **eksik**. Eksik değer asla sıfır sayılmaz; toplamda “eksik veri” uyarısı çıkar.

---

## 1) En kolay yol: tarayıcıda açmak

Uygulama GitHub Pages’e yüklendikten sonra (bkz. bölüm 2) size bir adres verilir, örneğin:
`https://KULLANICI-ADINIZ.github.io/diyet/`

Bu adresi Edge, Chrome veya Safari’de açmanız yeterli. Bir kez açıldıktan sonra **internet olmadan da çalışır**.

> Bilgisayarınızda denemek isterseniz (isteğe bağlı, Node.js gerekir):
> ```
> npm install
> npm run dev
> ```
> Sonra tarayıcıda `http://localhost:5173` adresini açın.

---

## 2) Windows kurulum dosyasını GitHub’dan ücretsiz almak

Programlama aracı kurmanız gerekmez; kurulum dosyasını GitHub sizin için hazırlar.

1. **Ücretsiz GitHub hesabı açın:** https://github.com/signup
2. **Yeni depo (repository) oluşturun:** sağ üstte **+** → **New repository**.
   - Ad: `diyet`
   - **Public** (herkese açık) seçin — bu sayede derleme dakikaları ücretsizdir. Kişisel verileriniz depoya **asla** girmez; depoda yalnızca uygulamanın kodu bulunur.
   - **Create repository**.
3. **Dosyaları yükleyin:** depo sayfasında **uploading an existing file** bağlantısına tıklayın. Bu zip’in içindeki **tüm dosya ve klasörleri** (`.github` klasörü dahil) sürükleyip bırakın → **Commit changes**.
   - Not: Tarayıcı `.github` gibi noktayla başlayan klasörleri bazen göstermez. Görünmüyorsa: depoda **Add file → Create new file**, ad olarak `.github/workflows/windows-build.yml` yazın ve bu dosyanın içeriğini yapıştırın.
4. **Web yayınını açın:** depoda **Settings → Pages → Build and deployment → Source: GitHub Actions**.
5. **Derlemeyi izleyin:** üstteki **Actions** sekmesi. “build” işi yaklaşık 10–20 dakika sürer (ilk sefer en uzunu).
6. **Kurulum dosyasını indirin:** bitince işe tıklayın → sayfanın altında **Artifacts** → **Diyet-Windows-kurulum** (zip). İçinde `Diyet_0.1.0_x64-setup.exe` (önerilen) ve `.msi` bulunur.
   - Kalıcı bir indirme sayfası isterseniz: **Releases → Draft a new release → Tag: `v0.1.0`** → yayınlayın; dosyalar otomatik eklenir.
7. **Kurun:** `.exe` dosyasını çift tıklayın.

### SmartScreen uyarısı (normaldir)
Uygulama ücretli bir dijital imza ile imzalanmadığı için Windows ilk açılışta **“Windows bilgisayarınızı korudu”** diyebilir.
**Ek bilgi → Yine de çalıştır** seçin. Bu yalnızca bir kez sorulur. (İleride ücretsiz Microsoft Store bireysel geliştirici hesabıyla yayınlanırsa bu uyarı kalkar.)

Windows 10/11’de gereken WebView2 zaten yüklüdür; değilse kurulum otomatik indirir.

---

## 3) iPhone’da ana ekrana eklemek

1. iPhone’da **Safari** ile uygulama adresinizi açın (bölüm 2, adım 4’ten sonra: `https://KULLANICI-ADINIZ.github.io/diyet/`).
2. Alttaki **Paylaş** düğmesine (kare + yukarı ok) dokunun.
3. **Ana Ekrana Ekle** → **Ekle**.
4. Artık ana ekrandaki **Beslenme Zekâsı** simgesiyle tam ekran açılır ve internetsiz çalışır.

**iPhone notları**
- iPhone telefon çok dolarsa Safari site verilerini silebilir. Bu yüzden **Ayarlar → Yedeği indir** ile düzenli yedek alın ve dosyayı iCloud Drive’a kaydedin. Uygulama haftada bir hatırlatır.
- Windows ile iPhone arasında veri taşımak için: bir cihazda **Yedeği indir**, dosyayı (iCloud/Google Drive/e-posta ile) diğerine aktarın, orada **Yedekten geri yükle**. (Otomatik eşitleme henüz yok.)

---

## 4) İlk kullanım

İlk açılışta kısa bir kurulum gelir: profil (cinsiyet, doğum tarihi, boy, kilo, aktivite) → hedef → hesaplanan kalori ve makrolar (formül açıkça gösterilir) → ev ölçüleri → yedek klasörü.

İpuçları:
- **Mutfak tartısı** en doğru veriyi verir. Bir besini “1 su bardağı” olarak bir kez tartarsanız (Besinler → besin → **Tart**), uygulama o besin için sizin değerinizi “ölçülmüş” olarak kullanır.
- Pilav gibi yemeklerde **Pişir** düğmesiyle pişmiş ağırlığı tartın; 100 g pişmiş değeri buna göre hesaplanır.
- Kendinizi sabah, tuvaletten sonra, yemeden önce tartın.

---

## 4b) Görünüm, tema ve yeni özellikler (v0.2 arayüz)

**Tema:** Varsayılan tema koyu **“Gece”** temasıdır (kömür siyahı zemin, neon yeşil vurgu; protein mavi, karbonhidrat yeşil, yağ turuncu).
Eski açık **“Krem & Adaçayı”** teması duruyor: **Ayarlar / Profil → Görünüm → Tema**. Seçim bu cihazda saklanır (tarayıcı deposu), yedeğe girmez.

**Menü:** Bilgisayarda solda *Bugün · Besin Veritabanı · Mutfak & Tarifler · İlerleme & Trend · Ayarlar / Profil*, altında *Araçlar: Haftalık Plan, Asistan* ve günlük hedef kartı. Üstte arama (**Ctrl/⌘+K**), **Hızlı Ekle** ve profil. Telefonda altta *Bugün · Besinler · (+) Ekle · Mutfak · İlerleme*; profil simgesi Ayarlar/Plan/Asistan menüsünü açar.

**Yeni:**
- **Seri (streak):** Art arda en az bir kayıt girdiğiniz gün sayısı; cihazda hesaplanır. Bugün henüz kayıt yoksa seri dün itibarıyla sayılır, bir gün tamamen atlanınca sıfırlanır.
- **Öğün fotoğrafı:** Bugün ekranında öğün kartındaki küçük resme dokunun → fotoğraf seçin/çekin. Fotoğraf küçültülüp (en fazla 640 px JPEG) **yalnızca cihazdaki kişisel veritabanına** kaydedilir ve **yedeğe dahildir** (öğün başına ~30–80 KB). ⋮ menüsünden değiştirilebilir/silinebilir.
- **Adınız ve hedef kilo:** Profil formunda (isteğe bağlı). Ad selamlamada, hedef kilo İlerleme ekranında (kalan yol, hedef çizgisi, tahmini ulaşma tarihi — “tahmini” etiketli) kullanılır.
- **Mutfak laboratuvarı:** Tarif artık tek ekranda: 1) çiğ malzemeler, 2) pişirme yöntemi + pişmiş tencere ağırlığı + porsiyon, 3) pişmiş net makrolar. Çiğ ↔ pişmiş dönüştürücü de bu ekranda.

**Dürüst işaretler:** “Yakılan kalori”, Apple Watch / cihaz eşitleme ve adım (NEAT) **henüz yok** — ekranda **“Yakında”** olarak görünür, sayı uydurulmaz. **Zekâ Önerisi** kartı kural tabanlıdır: yalnızca hedefiniz ve kayıtlarınızın aritmetiğini söyler (ör. kalan protein); Gemini anahtarı tanımlıysa Asistan’a geçiş önerir. Eksik değerler “eksik veri” etiketiyle gösterilmeye devam eder.


---

## 5) Yedekleme

- **Ayarlar → Yedeği indir**: tüm kişisel verileriniz (öğün fotoğrafları dahil) tek bir `.diyetbackup` dosyasında. Tema tercihi ve Gemini anahtarı yedeğe girmez.
- **Yedekten geri yükle**: bozuk veya yanlış dosya reddedilir, mevcut verileriniz değişmez.
- **Haftalık otomatik yedek** (Windows/Edge/Chrome): bir klasör seçin; uygulama açıldığında son yedek 7 günden eskiyse yeni yedek yazar, son 8’ini tutar.
- **CSV**: kayıtlar, kilolar ve tarifler Excel’de Türkçe karakterlerle açılır.

---

## 6) Veri kaynakları ve lisanslar

- **USDA FoodData Central** — Foundation Foods (2025-04) ve SR Legacy (2018-04), kamu malı (CC0). 8.133 besin; ~340 yaygın besine 457 Türkçe ad eklendi.
- **Open Food Facts** — barkod ürünleri, ODbL. Yalnızca taradığınız ürünler cihaza kaydedilir.
- **TürKomp** uygulamaya **eklenmedi** ve otomatik çekilmez; dilerseniz bir değeri kendiniz girersiniz (“TürKomp — kişisel”).
- FAO/INFOODS yoğunluk verileri izin alınana kadar eklenmedi.

Bu uygulama tıbbi tavsiye vermez.

---

## Geliştirici notları (isteğe bağlı)

| Komut | Ne yapar |
|---|---|
| `npm install` | bağımlılıkları kurar |
| `npm run dev` | geliştirme sunucusu |
| `npm test` | hesap motoru, veri, yedek, seri ve öğün fotoğrafı testleri (Vitest) |
| `npm run build` | `dist/` (PWA) üretir |
| `npx tauri build` | Windows kurulum dosyası (Rust gerekir; GitHub Actions bunu yapar) |
| `node scripts/build-reference.mjs <sr_klasörü> <foundation_klasörü>` | USDA CSV’lerinden `public/data/reference.json` üretir |

Arayüz: tema değişkenleri `src/styles.css` (`[data-theme=dark|light]`), tema seçimi `src/ui/theme.ts`, ikonlar lucide-react (`src/ui/icons.tsx`), yazı tipi Inter (paketli, çevrimdışı). Seri: `src/data/streak.ts`. Öğün fotoğrafları: şema v2 `meal_photo` tablosu.

Yapı: `src/engine` (saf hesap fonksiyonları, testli) · `src/data` (sql.js kişisel veritabanı + IndexedDB, salt-okunur referans veri, yedek) · `src/screens`, `src/ui` (arayüz) · `src/integrations` (Open Food Facts, barkod, Gemini) · `src-tauri` (Windows kabuğu).
Kural: **arayüz hesap yapmaz, yapay zekâ hesap yapmaz** — tüm sayılar motordan gelir.
