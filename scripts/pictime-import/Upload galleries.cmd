@echo off
rem Drag the folder of Pic-Time galleries onto this file (see upload.mjs for what goes in it).
if "%~1"=="" (echo Drag your Pic-Time galleries folder onto this file. & pause & exit /b)
node "%~dp0upload.mjs" "%~1"
pause
