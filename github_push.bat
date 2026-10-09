@echo off
chcp 65001 >nul
title Boom Arena - 깃허브 푸시 도우미
echo ========================================================
echo          🚀 Boom_arena 깃허브(GitHub) 원클릭 업로드 🚀
echo ========================================================
echo.
echo 연결된 저장소: https://github.com/Hun0109/Boom_arena.git
echo.
echo 지금 깃허브로 파일들을 업로드합니다...
echo (만약 GitHub 브라우저 로그인 창이 뜨면 [Sign in]을 눌러주세요)
echo --------------------------------------------------------

set GIT_EXE="%LOCALAPPDATA%\Programs\Git\cmd\git.exe"

%GIT_EXE% push -u origin main

echo.
if %ERRORLEVEL% EQU 0 (
    echo ========================================================
    echo  🎉 깃허브 업로드(Push) 성공!
    echo.
    echo  [다음 단계: 친구들과 플레이할 무료 웹 주소 열기]
    echo  1. https://github.com/Hun0109/Boom_arena/settings/pages 접속
    echo  2. Branch를 'main'으로 선택 후 [Save] 클릭!
    echo  3. 1분 뒤 생성되는 주소로 친구들과 바로 멀티플레이 가능!
    echo ========================================================
) else (
    echo --------------------------------------------------------
    echo ⚠️ 업로드 중 오류가 발생했거나 로그인이 취소되었습니다.
    echo 다시 시도하려면 아무 키나 눌러주세요.
)
pause
