# söylet

Türkçe metni **yalnızca tarayıcıda** sese dönüştüren statik web uygulaması. Metin ya da ses dosyası bir sunucuya gönderilmez. ONNX Runtime Web ve yerel fonem dönüştürme kullanır.

## Çalıştırma

Node.js 20+:

```bash
npm install
npm run dev
```

Derleme:

```bash
npm test
npm run build
npm run preview
```

Sunucu API'si, veritabanı veya API anahtarı gerekmez. GitHub Pages iş akışı yalnızca `main` dalına yapılan push/merge işleminde veya elle tetiklendiğinde derler ve dağıtır. Pages > Build and deployment > **GitHub Actions** seçilmelidir. Kurulumda `GITHUB_PAGES=true` ile `/soylet/` taban yolu kullanılır.

## Kullanım

1. Metni yaz ve **Seslendir** düğmesine bas. İlk kullanımda varsayılan **Piper Fettah** modelini otomatik indirir (yaklaşık 63 MB).
2. Ses oluştuğunda oynat, **WAV indir** veya **MP3 indir**.
3. Ana sayfada özel **Model** menüsü bütün modelleri gösterir. İndirilenler seçilebilir; indirilmemiş modellerde **Aktif edilmeli** yazısı bulunur. Bu modele basıldığında Modeller sayfasındaki ilgili yeşil **İndir** düğmesine yönlendirilirsin. **Seslendir** ilk kullanımda varsayılan Piper modelini otomatik indirir.
4. **Hız** ayarı sürüklenebilir 0,75×–1,35× çubuğudur. Supertonic 3 seçilirse ayrıca özel **Ses karakteri** menüsüyle F1–F5/M1–M5 seçebilirsin. Menüler klavyeyle de kullanılabilir. Piper'de ses karakteri gösterilmez.
5. Sağ üstten **Modeller** sayfasına git. Henüz indirilmemiş modeller gri kartla ve yeşil **İndir** düğmesiyle gösterilir. İndirilen modellerdeki **Varsayılan seç** düğmesi, uygulamanın seçili ses modelini değiştirir; bu seçim tarayıcıda saklanır. Model indirmek artık mevcut varsayılan modeli kendiliğinden değiştirmez. Ses karakteri ve hız kontrolleri yalnızca ana sayfadadır. Üstteki tıklanabilir **söylet.** yazısı ana sayfaya götürür. Alt bilgide projenin [GitHub deposuna](https://github.com/alorak/soylet) bağlantı vardır.

## Modeller

| Model | Motor | İndirme | Ses seçenekleri |
| --- | --- | --- | --- |
| Piper Fettah (varsayılan) | Piper / ONNX | ~63 MB | Tek ses |
| Piper Fahrettin | Piper / ONNX | ~63 MB | Tek ses |
| Piper DFKI | Piper / ONNX | ~63 MB | Tek ses |
| Supertonic 3 | ONNX Runtime Web | ~400 MB | 10 ses stili |

Piper modelleri `diffusionstudio/piper-voices` üzerinden, Supertonic 3 dosyaları ise `supertone-oss-archive/supertonic-3` model deposunun sabit bir revizyonundan tarayıcı tarafından indirilir. Modeller repoda, GitHub Pages paketinde veya kendi sunucumuzda yer almaz. İndirme dosyaları *Origin Private File System* (OPFS) içinde saklanır. İndirme iptal edilirse tamamlanmış dosyalar bir sonraki indirmede yeniden kullanılabilir.

**Ses karakteri konusunda dürüst sınırlama:** Piper'in bu Türkçe modelleri tek seslidir. Çocuk sesi ya da bağımsız ince/kalın ton parametresi yoktur. Piper'de hız değişikliği basit örnekleme hızı dönüşümüyle uygulandığı için ses perdesi de etkilenebilir. Supertonic 3'te hız modelden kontrol edilir; cinsiyete göre hazır ses stili seçilebilir. Hazır ses stilleri otomatik olarak *çocuk sesi* sunmaz.

## Çevrimdışı çalışma / gizlilik

- Üretilen ses yalnızca yerel JS/WebAssembly üzerinde hesaplanır.
- ONNX WASM ve Piper fonem dönüştürücü dosyaları, npm bağımlılıklarından `public/runtime/` altına kopyalanır; uygulama runtime sırasında CDN istemez.
- Service worker aynı origin altındaki uygulama kabuğunu ve ilk kullanımda yüklenen JS/WASM dosyalarını önbelleğe alır. İlgili model indirildikten ve gerekli çalışma dosyaları ilk kez yüklendikten sonra çevrimdışı çalışabilir.
- Model indirmek için Hugging Face erişimi, kalıcı depolama için HTTPS/localhost ve modern tarayıcı gerekir.
- Özellikle Supertonic için cihazın kullanılabilir RAM ve depolama kapasitesi önemlidir. Büyük model CPU'da yavaş çalışabilir. Tarayıcı önbelleği/verileri temizlenirse dosyalar kaybolabilir.
- Otomatik oynatım bazı tarayıcılarda engellenebilir; böyle durumlarda gösterilen ses oynatıcısındaki ▶ tuşu kullanılmalıdır.
- MP3 tarayıcı içinde `@breezystack/lamejs` ile kodlanır; WAV ve MP3 çıktıları aynı oluşturulan PCM sese dayanır.

## Lisanslar

Kaynak kod: MIT. Supertonic tarayıcı çıkarım yardımcı kodu MIT lisansı kapsamında alınmıştır (copyright Supertone Inc.). Supertonic **model ağırlıkları** ise ayrı bir **OpenRAIL-M** lisansına tabidir. `@breezystack/lamejs` kütüphanesi LGPL-3.0 lisanslıdır. Üçüncü taraf ayrıntıları için `THIRD_PARTY_NOTICES.md` ve ilgili modellerin model kartlarına bakın. Model dosyalarını yeniden dağıtmayın; kullanım hakkını ilgili model lisansına göre değerlendirin.

## Mimari

- `src/main.js` — uygulama, ayarlar, model seçimi ve durum yönetimi
- `src/models.js` — Türkçe model kataloğu ve OPFS indirme/silme
- `src/tts.js` — Piper ve Supertonic 3 ONNX tarayıcı çıkarımı
- `src/audio.js` — WAV/MP3 dönüştürme
- `src/vendor/supertonic-helper.js` — resmi MIT Supertonic tarayıcı helper'ı
- `scripts/prepare-runtime.mjs` — yerel fonem dönüştürücü ve ONNX runtime WASM kopyalama
- `public/sw.js` — same-origin uygulama önbelleği