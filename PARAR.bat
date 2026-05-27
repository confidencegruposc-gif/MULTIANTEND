@echo off
title Parando MultiAtend...
color 0C
echo.
echo  Parando MultiAtend...
taskkill /f /im node.exe >nul 2>&1
echo  Servidor parado!
timeout /t 2 >nul
