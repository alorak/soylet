# P2 — Trendyol-TTS / VoxCPM2 tarayıcı çalıştırma

**Durum: Deneysel altyapı. Henüz kullanılabilir bir Turkish-TTS tarayıcı ses motoru değil.**

P0 (uzak/yerel API) ve P1 (kullanıcının CUDA bilgisayarında Docker) korunur. P2 yalnızca ayrı, üretim uygulaması tarafından import edilmeyen dosyalar ekler. Model seçimindeki mevcut Piper, Supertonic ve Turkish-TTS API davranışları değiştirilmez.

## Neden hemen indirilebilir bir model yok?

- [Trendyol/Trendyol-TTS](https://huggingface.co/Trendyol/Trendyol-TTS) resmî dosyaları Türkçe LoRA'sı birleştirilmiş VoxCPM2 **PyTorch/safetensors** ağırlıklarıdır. ONNX/GGUF ve tarayıcı çıkarım motoru olmadan bunlar çalıştırılamaz.
- [Boran-Sert/Turkish-TTS](https://github.com/Boran-Sert/Turkish-TTS) Python/PyTorch/CUDA kullanır.
- [VoxCPM.cpp](https://github.com/bluryar/VoxCPM.cpp) VoxCPM2 desteğini *ön aşamada* tanımlıyor. WASM prototipi CPU/SIMD/pthreads kullanıyor. Trendyol ağırlıklarıyla tarayıcıda doğrulanmış kalite/parity kanıtı bulunamadı.
- Pthreads için sayfanın COOP/COEP başlıklarını göndermesi gerekir. Mevcut GitHub Pages dağıtımının bu güvenlik koşulunu karşıladığı varsayılamaz. Üretim ana sitesinin başlıklarını değiştirmeden önce ayrı bir host/dev ortamında doğrulama yapılmalıdır.
- OPFS'ye çok büyük dosyanın indirilmesi, modelin tarayıcı bellek limitleri içinde çalışacağı anlamına gelmez.

**Yayın kilidi:** src/p2/manifest.js içinde P2_BROWSER_VOXCPM_ENABLED = false. Çalışmayan bir motoru kullanıcıya seçtirmemek ve gereksiz 5 GB indirmeyi engellemek için bu özellik açılamaz. Dokümandaki aşamaların tamamlanması gereklidir.

## Bu PR'da yapılanlar

| Bileşen | İşlev | Durum |
| --- | --- | --- |
| src/p2/manifest.js | Trendyol VoxCPM2 kimliği, pinned SHA, GGUF boyutu, hash listesi ve cihaz uygunluk kontrolü | Birim testlerine uygun |
| src/p2/download-core.js | HTTP 206 Range ve Content-Range, bounded indirme, SHA-256 ile her parçayı doğrulama, kaldığı yerden devam | Birim testlerine uygun |
| src/p2/download.worker.js | UI'yi kilitlemeden OPFS sync access handle ile dosya yazma | Gerçek tarayıcı testi gerekli |
| src/p2/download-client.js | Worker ilerleme, iptal ve fail-closed deneysel istemci | Üretimde import edilmez |
| scripts/p2-build-manifest.mjs | Önceden oluşturulmuş GGUF için hash manifesti hazırlama | Dönüştürücü değil |
| test/p2-browser-foundation.test.mjs | İndirme, bozulma, kesinti, güvenlik ve mevcut akış regresyonları | Otomatik testler |

**Ağırlık veya WASM binary bu PR'da bulunmuyor.** Bir kullanıcıya çalışmayacak büyük dosyaları indirtmek amaçlanmıyor.

## Gerçek P2'ye geçiş için kapılar

1. **GGUF dönüşümü:** Resmî Trendyol safetensors ağırlıkları, tokenizer ve AudioVAE v2, VoxCPM2 uyumlu biçimde dışa aktarılmalı. VoxCPM1/1.5 modelini kullanmak Trendyol-TTS entegrasyonu sayılmaz. Olası dönüştürücü yolları arasında VoxCPM.cpp ve [llama.cpp-omni VoxCPM2](https://github.com/tc-mb/llama.cpp-omni) bulunuyor; ancak uygunluk kanıtı olmadan başarı iddia edilmez.
2. **Kaynak sabitleme:** Kaynak model ve dönüştürülmüş artifact için Hugging Face 40 haneli commit SHA, ağırlık hash'leri ve lisans notları tutulmalı.
3. **Native model parity:** Python referansına karşı aynı Türkçe test cümlelerinin sesi kıyaslanmalı: 48 kHz çıktı, boş olmayan ses, sözcük anlaşılırlığı, sayılar/tarihler/kısaltmalar, Türkçe karakterler ve prozodi.
4. **WASM tarayıcı parity:** Emscripten derlemesi ve GGUF ile model yükleme/sentez; Worker, OPFS, kalıcı dosya, WAV dışa aktarma ve offline kullanım gerçek cihazlarda doğrulanmalı.
5. **Çalışma ortamı:** Cross-origin isolation, SharedArrayBuffer, gerçek bellek tüketimi, tarayıcı kotası, hız (RTF) ve mobil uyumsuzluk test edilmeli. Ayrı alan adında COOP/COEP başlıkları sağlayabilen bir host gerekebilir. Ana GitHub Pages sitesinin davranışı değiştirilmemeli.
6. **Yayın:** Bağımsız modelParity, browserSmoke, turkishQuality ve licenseReview kanıtları olmadan model kataloğuna eklenmemeli. Gerçek WASM runtime, hash'lenmiş binary ve uçtan uca kalite testleri bu PR'da **henüz bulunmuyor**.

## Manifest oluşturma (yalnızca geliştirici)

Gerçekten VoxCPM2'ye dönüştürülmüş bir GGUF dosyası hazır olduğunda:

```bash
node scripts/p2-build-manifest.mjs \
  --file /path/to/Trendyol-VoxCPM2-Q4_K.gguf \
  --artifact-repo organizasyon/gguf-deposu \
  --artifact-revision ARTIFACT_REPO_40_HEX_SHA \
  --source-revision SOURCE_MODEL_40_HEX_SHA \
  --out /tmp/p2-trendyol-manifest.json
```

Betik en fazla 4 MiB veri okuyarak SHA-256 parça listesi üretir. Sadece GGUF imzasını kontrol eder; iç mimari doğruluğunu veya kaliteyi ispatlamaz. Üretilen manifest içindeki tüm doğrulama durumları pending kalır ve yayın kapısı otomatik açılmaz.

## İndirme ve güvenlik sözleşmesi

- P2 sadece pinned HTTPS Hugging Face GGUF URL'lerini kabul eder. Kullanıcı bilgisi, query parametresi, HTTP veya dosya yolu kaçışı reddedilir.
- Sunucu tam olarak HTTP 206 ve beklenen Content-Range döndürmeli. 200 dönmesi halinde tüm dosya belleğe alınmaz; işlem durur.
- Her parça en fazla 8 MiB'dir; SHA-256 doğrulanmadan OPFS'ye yazılmaz.
- Kaydedilen parçalar yeniden başlatıldığında tekrar hash'lenir, yalnızca doğru olanlar atlanır. Hatalı parça tekrar istenir.
- OPFS yolu: soylet-p2-v1 / artifactRevision / GGUF dosyası. Model boyutu en çok 8 GiB, gerçek cihaz depolaması uygun olmalıdır.
- İndirme/özet çıkarma işlemi ses üretimini sağlamaz. Dosyayı model olarak yükleyen ve ses üreten runtime **eksik**.

## Doğrulama

```bash
npm test
npm run build
```

Bu testler yalnızca altyapıyı doğrular. P2 tamamlanma ölçütü gerçek Trendyol modelini tarayıcıda çalıştırmak ve ses kalitesini raporlamaktır. P0/P1'in devam eden işlevleri etkilenmemelidir.
