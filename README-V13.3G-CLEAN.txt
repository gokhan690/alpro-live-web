AluminyumPro V13.3G Service Key Alias Debug

Düzeltmeler:
1) SUPABASE_SERVICE_KEY ve SUPABASE_SERVICE_ROLE_KEY ikisi de desteklenir.
2) Kod önce SUPABASE_SERVICE_KEY, sonra SUPABASE_SERVICE_ROLE_KEY, sonra ANON key dener.
3) /api/history-debug ve /api/supabase-status içinde usedKeyName ve candidateKeyNames görünür.
4) Böylece hangi env key ile bağlanmaya çalıştığı anlaşılır.
5) .env.example içinde iki alias da gösterilir.

Not:
- SUPABASE_SERVICE_KEY false ise bu sadece Render'da o isimde env yok demektir.
- SUPABASE_SERVICE_ROLE_KEY true ise o isimle key vardır.
- Invalid API key hatası çıkarsa kullanılan key'in değeri yanlış/başka projeye ait olabilir.

Commit:
Support Supabase service key alias and debug used key
