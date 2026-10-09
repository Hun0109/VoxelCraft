@echo off
chcp 65001 >nul
title Boom Arena - 깃허브 푸시 도우미
echo ========================================================
echo          🚀 Boom_arena 깃허브(GitHub) 원클릭 업로드 🚀
echo ========================================================
echo.
echo 연결된 저장소: https://github.com/Hun0109/VoxelCraft.git
echo.
echo 지금 깃허브로 파일들을 업로드합니다...
echo --------------------------------------------------------

set GIT_EXE="%LOCALAPPDATA%\Programs\Git\cmd\git.exe"

%GIT_EXE% push -u origin main

echo.
if %ERRORLEVEL% EQU 0 (
    echo ========================================================
    echo  🎉 깃허브 업로드(Push) 성공!
    echo.
    echo  [웹 주소]
    echo  👉 https://hun0109.github.io/VoxelCraft/
    echo ========================================================
) else (
    echo --------------------------------------------------------
    echo ⚠️ 업로드 중 오류가 발생했거나 로그인이 취소되었습니다.
    echo 다시 시도하려면 아무 키나 눌러주세요.
)
pause
