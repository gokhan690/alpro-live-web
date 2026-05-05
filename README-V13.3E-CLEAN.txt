AluminyumPro V13.3E History Routes First

Düzeltmeler:
1) /api/metals-history/count, latest, recent, symbols ve ana history endpointleri en üste alındı.
2) Bu endpointler artık Investing/getMetals fiyat çekme fonksiyonuna düşmez.
3) History sayfalarında "Invalid API key / Investing verisi alınamadı" hatası çıkması engellendi.
4) /api/supabase-status yine korunur.

Test:
- /api/supabase-status
- /api/metals-history/count
- /api/metals-history/symbols
- /api/metals-history/latest
- /api/metals-history/recent?limit=20
- /api/metals-history?limit=20

Commit:
Fix history routes before price fetch routes
