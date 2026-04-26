# AlPro Live Web Deploy Paketi

Bu paket, AlPro programını internetten açılabilir web sitesi haline getirmek için hazırlandı.

## İçerik

- `index.html` — AlPro arayüzü
- `server.js` — Node.js server + Investing canlı fiyat proxy
- `package.json` — çalıştırma komutu
- `render.yaml` — Render için otomatik deploy ayarı
- `railway.json` — Railway için deploy ayarı

## Lokal çalıştırma

```bash
npm install
npm start
```

Sonra aç:

```text
http://localhost:8833
```

## Render ile web sitesi yapma

1. Bu klasörü GitHub reposuna yükle.
2. Render.com hesabına gir.
3. New → Web Service seç.
4. GitHub reposunu bağla.
5. Render `render.yaml` dosyasını okuyarak ayarları otomatik alır.
6. Deploy bitince sana canlı site linki verir.

Örnek link:

```text
https://alpro-live-web.onrender.com
```

## Railway ile web sitesi yapma

1. Railway.app hesabına gir.
2. New Project → Deploy from GitHub repo seç.
3. Repo seç.
4. Start command otomatik olarak `npm start` olur.
5. Deploy bitince public domain aç.

## Önemli not

Bu sürümde kayıtların çoğu tarayıcı `localStorage` içinde tutulur.  
Yani her cihazda veri ayrı olabilir.

Telefon + bilgisayar aynı sipariş/veriyi görsün istiyorsan sonraki adımda Supabase veritabanı bağlamak gerekir.
