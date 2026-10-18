@echo off
rem Drag the base folder (e.g. E:\EXPORTS\WEDDINGS) onto this file. It uploads gently in the daytime
rem and at full speed overnight, in a minimised window at low priority (see upload.mjs).
if "%~1"=="" (echo Drag your weddings folder onto this file. & pause & exit /b)
start "Uploading galleries" /min /belownormal cmd /c "node "%~dp0upload.mjs" "%~1" & pause"
