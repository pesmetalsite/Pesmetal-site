@echo off
REM ================================================
REM Deploy PESMETAL Admin - Execute este script
REM ================================================
echo.
echo Deploy PESMETAL Admin
echo ==========================
echo.

cd /d "%~dp0"

REM Verifica se está no diretório correto
if not exist "package.json" (
    echo Erro: Execute este script dentro da pasta apps/admin
    pause
    exit /b 1
)

echo Fazendo deploy...
npx vercel --prod --yes

echo.
echo Deploy concluido!
pause
