AluminyumPro V13.3D Dynamic Latest Symbols

Düzeltmeler:
1) /api/metals-history/latest artık sabit symbol listesi aramaz.
2) Son 1000 kaydı çeker, hangi symbol varsa otomatik son kaydını bulur.
3) aluminium / copper / zinc / ALU / MCU3 gibi isim farkları sorun olmaktan çıkar.
4) Yeni endpoint:
   - /api/metals-history/symbols

Test:
- /api/metals-history/count
- /api/metals-history/symbols
- /api/metals-history/latest
- /api/metals-history/recent?limit=20

Commit:
Fix latest history dynamic symbols
