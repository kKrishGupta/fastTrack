@echo off
title FaceTrack Monitoring - ActivityWatch
"%~dp0node\node.exe" "%~dp0bridge\launch.mjs"
if errorlevel 1 pause
