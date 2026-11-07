# P1 mimarisi — Turkish-TTS yerel GPU servisi

## Kapsam

Söylet, GitHub Pages üzerinden servis edilen statik tarayıcı uygulamasıdır. P0 API istemcisi `src/turkish-tts-api.js` içinde `GET /ready` ve `POST /v1/tts` kullanır. P1 bu API'yi **kullanıcının kendi CUDA GPU bilgisayarında** çalıştırmak için bağımsız, terminalden başlatılan yerel Docker altyapısı sağlar. Web sayfası sistem komutu çalıştırmaz, dosya sistemi dışına yazılım kurmaz ve 5 GB modeli OPFS'ye indirmez. Yerel runtime ve tarayıcı tamamen ayrı süreçlerdir.

```text
Söylet (statik web / kullanıcı etkileşimi)
    │  yalnızca kullanıcı "Seslendir" dediğinde
    │  POST http://127.0.0.1:8000/v1/tts  (JSON metin)
    │  GET  http://127.0.0.1:8000/ready   (kullanıcı kontrole basınca)
    ▼
NVIDIA GPU bulunan kullanıcı makinesi (loopback 127.0.0.1:8000)
    │ Docker Engine + Compose + GPU passthrough
    ▼
Boran-Sert/Turkish-TTS (FastAPI, Python, PyTorch/CUDA)
    │ kendi diskte HF cache / local Docker volume
    ├── Trendyol/Trendyol-TTS (~5 GB)
    └── PCM16 48 kHz WAV yanıtı
    ▼
Tarayıcı WAV/MP3 oynatıcı ve kaydetme (Söylet'in mevcut src/audio.js)
```

## Sürüm ve güncelleme güvenliği

- `local-tts/manage.sh` sabit bir **commit SHA** üzerinden upstream kaynağı klonlar; hareketli `main` ile otomatik güncellenmez.
- `local-tts/upstream/` .gitignore ile dışlanır; upstream kodu veya ağırlıkları Söylet deposunda dağıtılmaz.
- Docker image yerel olarak upstream'in `docker/Dockerfile` dosyasından oluşturulur.
- Model, HF önbellek volume'unda saklanır; `stop` veya konteyner yeniden oluşturma ağırlıkları silmez.
- Upstream repo, modeller, Docker bağımlılıkları ve indirme kaynakları ayrı güven sınırlarıdır. Kaynağa ve modellere güvenmeden scripti çalıştırmayın.

## Güven sınırları

- Docker host portu yalnızca `127.0.0.1:8000` ile erişilebilir.
- Web origin izni `https://alorak.github.io`, `http://127.0.0.1:5173`, `http://localhost:5173` ile sınırlıdır. `Access-Control-Allow-Origin` CORS kapsamındaki tarayıcı isteklerini sınırlar; kimlik doğrulama **değildir**. Aynı bilgisayardaki diğer uygulamalar yerel API'ye erişebilir.
- GPU servisi HTTP kullanır ama sadece loopback üzerinde dinler. Dış ağ ve internete port açılmamalıdır.
- Tarayıcıdan program yüklenmez ve API çağrıları otomatik yapılmaz. Metin gönderimi açık kullanıcı eylemiyle gerçekleşir.
- `apiUrl` mevcut P0 yaklaşımıyla tarayıcı localStorage'ında saklanır. Kimlik bilgisi URL'si desteklenmez.
- Tarayıcı ve Docker host farklı cihazlarsa loopback çözümü uygulanamaz; P1 **aynı bilgisayar** kullanımını hedefler.

## Doğrulama matrisi

| Doğrulama | Beklenti |
| --- | --- |
| `bash local-tts/manage.sh doctor` | Git, Docker, Compose, Docker daemon kontrolü |
| `bash local-tts/manage.sh download` | Pinned kaynak + imaj + kalıcı HF modeli; web arayüzü açılmıyor |
| `bash local-tts/manage.sh setup` | Ön yükleme ve başlatma; Docker yalnızca loopback portu yayımlar |
| `curl /ready` | İlk yüklemede 503 olabilir; sonra `ready: true` |
| `curl -X POST /v1/tts` | Geçerli, oynatılabilir mono WAV |
| Söylet yerel API | Tek seferde bağlantı kontrolü, ses üretimi, WAV ve MP3 |
| Söylet Piper/Supertonic | API kullanılmadığında yerel/on-device üretim değişmemeli |
| `stop` ardından `start` | Aynı HF cache kullanılır, ağırlıklar tekrar inmez |
| Başka makinede erişim | `8000` host portu erişilemez (loopback-only) |
| Browser / ağ / CORS | Chrome/Firefox/Safari ve HTTPS→loopback davranışı gerçek cihazda doğrulanmalı |

**Gerçek GPU üzerinde doğrulama zorunlu:** Proje dosyalarının statik testi, Docker runtime'ın NVIDIA sürücüsü ve GPU belleğiyle birlikte doğru çalıştığını tek başına kanıtlamaz. P1 PR testlerinin geçmesi yalnızca kod/konfigürasyon testlerini doğrular.

## P2'den farkı

P1 model dosyalarını işletim sistemindeki Docker önbelleğine indirir ve Python/CUDA ile çalıştırır. P2 için farklı model temsilinin (ONNX/GGUF), tarayıcı çıkarım motorunun (WASM/WebGPU), bellek/performans doğrulamasının ve güvenilir indirme akışının ayrıca geliştirilmesi gerekir. P1 bu aşamaların tamamlandığı anlamına gelmez.
