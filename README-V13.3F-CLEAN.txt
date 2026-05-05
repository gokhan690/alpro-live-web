AluminyumPro V13.3F History Debug Direct

Bu sürümde:
1) /api/history-debug endpointi eklendi.
2) Supabase client direkt env’den kurulup tabloya direkt sorgu atar.
3) SUPABASE_SERVICE_KEY adı da desteklenir.
4) Bu endpoint kayıt yazılıyor mu, okunuyor mu, tablo boş mu, deploy eski mi net gösterir.

Test:
- /api/history-debug
- /api/supabase-status
- /api/metals-history/count
- /api/metals-history/latest

Commit:
Add direct history debug endpoint
