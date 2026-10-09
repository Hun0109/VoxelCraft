@echo off
chcp 65001 >nul
title Boom Arena - 깃허브 웹 자동 동기화
echo ========================================================
echo       🚀 Boom Arena -> 깃허브 웹(GitHub Pages) 자동 동기화
echo ========================================================
echo.
echo [1/3] 변경된 파일들을 정리하는 중...
set GIT_EXE="%LOCALAPPDATA%\Programs\Git\cmd\git.exe"

%GIT_EXE% add .

echo [2/3] 변경사항 커밋 중...
%GIT_EXE% commit -m "Update: %date% %time%" >nul 2>&1

echo [3/3] 깃허브로 자동 전송(Push) 중...
%GIT_EXE% push origin main

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================================
    echo  🎉 깃허브 웹(GitHub Pages) 동기화 완료!
    echo.
    echo  약 1분 뒤 온라인 웹사이트에 자동으로 적용됩니다:
    echo  👉 https://hun0109.github.io/Boom_arena/
    echo ========================================================
) else (
    echo.
    echo --------------------------------------------------------
    echo ⚠️ 깃허브 로그인이 필요합니다.
    echo 창에 GitHub 아이디와 비밀번호(또는 Personal Access Token)를 입력해주세요.
    echo --------------------------------------------------------
)
echo.
pause
