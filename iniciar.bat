@echo off
title Studio Shelly Rodrigues - Sistema
color 0A

echo.
echo  ====================================================
echo   Studio Shelly Rodrigues - Iniciando Sistema...
echo  ====================================================
echo.

cd /d "%~dp0"

echo [1/3] Iniciando Evolution API (WhatsApp)...
docker-compose up -d
if %errorlevel% neq 0 (
    echo.
    echo  AVISO: Docker nao encontrado ou erro ao iniciar.
    echo  Instale o Docker Desktop e tente novamente.
    echo  O sistema rodara sem WhatsApp integrado.
    echo.
)

echo.
echo [2/3] Aguardando Evolution API inicializar...
timeout /t 4 /nobreak > nul

echo.
echo [3/3] Iniciando servidor do sistema...
echo.
echo  ====================================================
echo   Sistema disponivel em: http://localhost:3000
echo   Nao feche esta janela!
echo  ====================================================
echo.

node server.js

pause
