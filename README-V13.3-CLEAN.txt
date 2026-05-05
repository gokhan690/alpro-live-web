AluminyumPro V13.3 History Read Order Fix

Düzeltmeler:
1) /api/metals-history default olarak en yeni kayıtları önce getirir.
2) /api/metals-history?order=asc verilirse eski→yeni sıralar.
3) /api/metals-history/recent endpointi eklendi.
4) /api/metals-history/latest endpointi eklendi.
5) /api/metals-history/count endpointi eklendi.
6) Snapshot kaydı çalışmasına rağmen API’de eski son kayıt görünmesi düzeltildi.

Test:
- /api/metals-history/latest
- /api/metals-history/count
- /api/metals-history/recent?limit=20
- /api/metals-history?limit=20
- /api/metals-history?order=asc&limit=20

Commit:
Fix history read order and latest endpoints
