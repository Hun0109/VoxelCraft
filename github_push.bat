@echo off
chcp 65001 >nul
echo ========================================================
echo          🚀 BOOM ARENA - 깃허브(GitHub) 자동 연동 🚀
echo ========================================================
echo.
echo GitHub(https://github.com)에서 생성한 저장소(Repository) 주소를
echo 마우스 우클릭으로 붙여넣고 엔터를 눌러주세요.
echo.
echo (예시: https://github.com/아이디/boom-arena.git)
echo --------------------------------------------------------
set /p REPO_URL="깃허브 저장소 주소 입력: "

if "%REPO_URL%"=="" (
    echo 주소가 입력되지 않았습니다. 창을 닫습니다.
    pause
    exit /b
)

set GIT_EXE="%LOCALAPPDATA%\Programs\Git\cmd\git.exe"

echo.
echo [1/3] 깃허브 원격 주소 연결 중...
%GIT_EXE% remote remove origin >nul 2>&1
%GIT_EXE% remote add origin %REPO_URL%

echo [2/3] 브랜치 설정 중...
%GIT_EXE% branch -M main

echo [3/3] 깃허브로 업로드(Push) 시작...
%GIT_EXE% push -u origin main

echo.
if %ERRORLEVEL% EQU 0 (
    echo ========================================================
    echo  🎉 깃허브 연동 성공!
    echo.
    echo  이제 GitHub 저장소의 Settings -> Pages 로 이동하여
    echo  Branch를 'main'으로 설정하면 친구들과 할 수 있는
    echo  무료 웹사이트 주소가 열립니다!
    echo ========================================================
) else (
    echo.
    echo [안내] 만약 로그인 창이 뜨면 GitHub 로그인을 진행해주세요.
)
pause
