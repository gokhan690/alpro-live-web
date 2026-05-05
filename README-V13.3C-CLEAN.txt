AluminyumPro V13.3C Supabase Env Client

Düzeltmeler:
1) count/latest/recent endpointlerinde no_supabase hatası düzeltilir.
2) Endpointler kendi Supabase client'ını env değişkenlerinden kurabilir.
3) Desteklenen env isimleri:
   - SUPABASE_URL
   - SUPABASE_SERVICE_ROLE_KEY
   - SUPABASE_ANON_KEY
   - VITE_SUPABASE_URL
   - VITE_SUPABASE_ANON_KEY
4) Debug:
   - /api/supabase-status

Test:
- /api/supabase-status
- /api/metals-history/count
- /api/metals-history/latest
- /api/metals-history/recent?limit=20

Commit:
Fix history endpoints with env Supabase client
