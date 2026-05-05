AluminyumPro V13.2 Auto History Snapshot

Düzeltmeler:
1) Server fiyat geçmişi otomatik snapshot almaya başlar.
2) Varsayılan olarak 60 saniyede bir kayıt denemesi yapar.
3) AUTO_HISTORY_SNAPSHOT=false ile kapatılabilir.
4) HISTORY_SNAPSHOT_INTERVAL_MS ile süre ayarlanabilir. Minimum 30000 ms önerilir.
5) Manuel kontrol endpointleri:
   - /api/metals-history/status
   - /api/metals-history/auto-snapshot
   - /api/metals-history/snapshot
   - /api/metals-history
6) Ana ekranda “Server fiyat geçmişi yüklendi...” mesajı görünmez.

Commit:
Add auto server price history snapshot
