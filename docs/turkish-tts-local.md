# Turkish-TTS yerel GPU kurulumu (P1)

Bu kılavuz, [Boran-Sert/Turkish-TTS](https://github.com/Boran-Sert/Turkish-TTS) modelini **kendi bilgisayarınızda** çalıştırıp [Söylet](https://alorak.github.io/soylet/) web arayüzüne bağlar. Türkçe metin ve ses çıktısı bu kurulumda bilgisayarınızda kalır: model yaklaşık **5 GB** ağırlığını **yerel Docker volume** içine indirir, Söylet **`127.0.0.1:8000`** adresindeki servise bağlanır. Tarayıcıdan işletim sistemine kendiliğinden yazılım kurulmaz.

> **P1 kapsamı:** Yerel CUDA GPU + Docker ile çalışan ayrı bir TTS servisidir; tarayıcıda çalışan bir ONNX/WASM modeli değildir. Modeli tarayıcı depolamasına indiren P2 bu dokümanın kapsamı dışındadır.

## 1. Destek ve ön koşullar

| Ortam | P1 desteği | Notlar |
| --- | --- | --- |
| Linux + NVIDIA GPU | Desteklenen hedef | NVIDIA sürücüsü, Docker Engine, Compose v2, NVIDIA Container Toolkit; Git ve `curl` |
| Windows 11 + WSL2 | Uygun yapılandırmada desteklenen hedef | NVIDIA WSL2 sürücüsü, Docker Desktop'ın WSL2 entegrasyonu ve Linux Docker GPU desteği; komutları **WSL2 terminalinde** çalıştırın |
| macOS / Apple Silicon | **Desteklenmiyor** | Upstream bu projede CUDA'yı zorunlu tutuyor; Metal/MPS portu yok |
| CPU-only / AMD GPU | **Desteklenmiyor** | Bu P1 çalışma motoru için CUDA gereklidir |
| Telefon/tablet | **Desteklenmiyor** | `127.0.0.1` telefonda telefonun kendisini gösterir; başka bilgisayardaki GPU'yu değil |

Upstream README: Python 3.10+, CUDA GPU, ~5 GB model indirmesi ve yaklaşık 8 GB GPU bellek önerisi. RTX 4060 Laptop ölçümünde tepe VRAM ~5,7 GB olsa da diğer sistemlerde bellek ihtiyacı değişebilir. Docker imajı/bağımlılıklar için model boyutuna ek boş disk alanı gerekir. İlk Docker image derlemesi de büyük olabilir.

**Güvenlik:** Modelin HTTP API'sinde kimlik doğrulaması yoktur. Buradaki Compose dosyası **yalnızca `127.0.0.1:8000`** dinler. `0.0.0.0:8000` veya internet yönlendirmesiyle yayımlamayın. CORS yalnızca tanımlanan Söylet ve yerel geliştirme origin'lerini kabul edecek şekilde sınırlandırılmıştır. CORS tek başına yerel API'yi diğer yerel süreçlerden koruyan bir kimlik doğrulama mekanizması değildir.

## 2. İndirme ve kurulum

Önce sistemde Docker, Compose v2, Git, NVIDIA sürücüsü ve GPU destekli Docker çalışır durumda olmalıdır. Linux'ta NVIDIA Container Toolkit'i NVIDIA'nın resmi yönergeleriyle kurun; Windows'ta WSL2 + Docker Desktop GPU desteğini etkinleştirin. Komutları **GPU'nun bulunduğu bilgisayarda**, WSL2 kullanıyorsanız Linux terminalinde çalıştırın.

```bash
git clone https://github.com/alorak/soylet.git
cd soylet
bash local-tts/manage.sh doctor
bash local-tts/manage.sh setup
```

`setup` açıkça çalıştırıldığında:

1. Boran Sert'in upstream deposunu `local-tts/upstream/` içine Git ile çeker ve belirli **commit SHA**'sına sabitler (script içinde görünür).
2. Upstream Dockerfile'dan yerel imajı oluşturur.
3. `Trendyol/Trendyol-TTS` ağırlıklarını Hugging Face üzerinden kalıcı Docker volume'a indirir. Modelin kendisini Söylet deposuna kopyalamaz.
4. Konteyneri arka planda başlatır. Model yüklenene kadar `/ready` 503 dönebilir.

Komutlar `sudo` çağırmaz, sistem paketleri kurmaz, model silmez ve yetkisiz bir ağ servisi başlatmaz. Kendi sisteminizde Git, Docker, sürücü ve NVIDIA Container Toolkit kurulumu önceden yapılmalıdır.

Yalnızca modeli indirip şimdilik servisi başlatmamak için:

```bash
bash local-tts/manage.sh download
bash local-tts/manage.sh start   # Daha sonra
```

Hazırlığı kontrol edin:

```bash
bash local-tts/manage.sh status
curl -fsS http://127.0.0.1:8000/ready
```

Beklenen hazır yanıt örneği:

```json
{"ready":true,"pool_size":1,"idle":1}
```

`pool_size` ve `idle` anlık değerlerdir; farklı olabilir. İlk başlatmada model derleme/yükleme süreci sürerken 503 normal olabilir. Log:

```bash
bash local-tts/manage.sh logs
```

**Bağımsız TTS doğrulaması** (Söylet'i dahil etmeden önce):

```bash
curl --fail --show-error -X POST http://127.0.0.1:8000/v1/tts \
  -H 'Content-Type: application/json' \
  -d '{"text":"Merhaba, bugün hava çok güzel."}' \
  --output local-test.wav
```

Dosya oynatılabilir bir WAV olmalıdır. Upstream model çıktısı tek kanal 48 kHz PCM16'dır.

## 3. Söylet'e bağlama

1. GPU bilgisayarının tarayıcısında [Söylet'i açın](https://alorak.github.io/soylet/).
2. **Modeller → Turkish-TTS → API ayarla** ekranına girin.
3. **Bu bilgisayarı kullan** düğmesine basın. Adres otomatik `http://127.0.0.1:8000` olur.
4. **Bağlantıyı kontrol et** deyin. Sunucu hazırsa `/ready` bilgisi görüntülenir.
5. **Kaydet ve seç** deyin, ana sayfada metni yazıp **Seslendir** düğmesine basın.
6. WAV / MP3 olarak dinleyin ve indirin.

**Gizlilik:** Söylet'in tarayıcı uygulaması GitHub Pages üzerinden yüklenir; metin yalnızca `Seslendir` eylemiyle kendi bilgisayarınızdaki localhost API'ye gönderilir. Servise dış ağdan metin gönderilmez; ancak web sayfasını ilk açmak için internet gerekebilir. Servisin kendisi, Hugging Face indirmesi tamamlandıktan sonra model ağırlıklarını yeniden indirmek zorunda değildir. Söylet'in sayfası ve bağımlılıkları service worker'da önceden önbelleğe alınmışsa yerel kullanım internet kesikken de mümkün olabilir; çevrimdışı çalışmayı tarayıcı ve cihaz bazında doğrulayın.

**Önemli tarayıcı farkı:** HTTPS web sayfasından `http://127.0.0.1` isteği bazı tarayıcılarda yerel ağ erişim izni, CORS veya güvenlik kısıtlamasına takılabilir. Bu davranış tarayıcı sürümüne bağlıdır. Önce `/ready` kontrolü yapın; sorun çözülmezse Söylet'i aynı bilgisayarda `npm install && npm run dev` ile açıp `http://127.0.0.1:5173` origin'inden deneyin. Bu ayar da localhost'la haberleşir.

## 4. Kullanım sonrası / yeniden başlatma

```bash
bash local-tts/manage.sh stop    # Konteyneri kapatır, ağırlıklar volume'da kalır
bash local-tts/manage.sh start   # Modeli yeniden indirmeden başlatır
bash local-tts/manage.sh status
```

`stop` modeli silmez. Özellikle `docker compose down -v` komutunu kullanmayın; bu, kalıcı model cache volume'unu da kaldırabilir. Kaynak sürümünü yenilemek için `manage.sh` içindeki sabit upstream SHA'yı gözden geçirerek yeni sürüm testi yapmak gerekir. Script bilerek otomatik olarak `main` üzerindeki değişikliklere güncellenmez.

## 5. Sık karşılaşılan hatalar

| Belirti | Neden / işlem |
| --- | --- |
| `docker compose` yok | Compose v2 kurun veya Docker Desktop/Engine'i güncelleyin |
| `could not select device driver ... gpu` | NVIDIA Container Toolkit / WSL2 Docker GPU passthrough kurulumu eksik |
| `nvidia-smi` başarısız | NVIDIA sürücüsü, WSL2 GPU erişimi veya host ortamını doğrulayın |
| `/ready` → 503 | Model hâlâ yükleniyor; `logs` üzerinden inceleyin |
| `/ready` → bağlantı reddedildi | Docker servisinin ayakta olduğunu, `127.0.0.1:8000` portunu ve logları kontrol edin |
| Web arayüzünde `Failed to fetch` / CORS | `https://alorak.github.io` origin'i ve tarayıcı yerel ağ izni. Önce `curl` ile `/ready` testini yapın |
| Port 8000 kullanılıyor | O servisi kapatın; portu değiştirirseniz Söylet URL'sini de değiştirin |
| İndirilen model tekrar indiriliyor | Önceki Docker volume kullanılmıyor olabilir; `docker compose -f local-tts/compose.yaml config --volumes` veya Docker volume listesini kontrol edin |
| Ses çıkmıyor / 500 | GPU belleği, upstream istisna logları, bağımsız `curl /v1/tts` testi |

## 6. Lisans ve kaynak

- [Turkish-TTS](https://github.com/Boran-Sert/Turkish-TTS): üst kod Apache-2.0, vendored VoxCPM Apache-2.0, Trendyol ağırlıkları upstream bilgisine göre MIT. Üçüncü taraf lisans ve veri/kullanım koşulları için upstream `LICENSE-NOTICE.md` ve model kartını okuyun.
- [Trendyol model deposu](https://huggingface.co/Trendyol/Trendyol-TTS): Ağırlıklar Hugging Face'ten **kullanıcının bilgisayarına** indirilir.
- [Söylet P1 mimari notu](turkish-tts-local-architecture.md): Güven sınırları, test matrisi ve P2 farkı.
