AluminyumPro V13.3B Supabase Client Resolver

Düzeltmeler:
1) /api/metals-history/count endpointinde no_supabase dönmesi düzeltildi.
2) History read helper artık farklı Supabase client isimlerini otomatik bulur:
   - supabase
   - supabaseClient
   - sb
   - supabaseAdmin
   - global.supabase
   - global.supabaseClient
3) Debug endpoint eklendi:
   - /api/supabase-status
4) Env değerleri asla gösterilmez, sadece var/yok bilgisi döner.

Test:
- /api/supabase-status
- /api/metals-history/count
- /api/metals-history/latest
- /api/metals-history/recent?limit=20

Commit:
Fix history endpoints Supabase client resolver
