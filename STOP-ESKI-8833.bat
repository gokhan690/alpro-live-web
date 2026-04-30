@echo off
echo 8833 portunu kullanan eski Node sureci kapatiliyor...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8833') do taskkill /PID %%a /F
pause
