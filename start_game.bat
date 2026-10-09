@echo off
chcp 65001 >nul
echo ===================================================
echo     💥 BOOM ARENA (붐 아레나) 로컬 서버 실행 중 💥
echo ===================================================
echo.
echo 브라우저에서 아래 주소로 접속하거나 잠시 후 자동으로 열립니다!
echo 주소: http://localhost:8080
echo.
echo 서버를 종료하려면 이 창을 닫거나 Ctrl+C를 누르세요.
echo ---------------------------------------------------
start http://localhost:8080
py -m http.server 8080
pause
