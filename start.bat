@echo off
chcp 65001 >nul
title Projection Mapping Studio

echo ========================================================
echo  🎬 Projection Mapping Web Studio
echo ========================================================
echo.
echo Запуск локального сервера...
start "" "http://localhost:3050"
node server.js

pause
