@echo off
rem 塔界远征 - 本地游戏服务启动脚本
rem 双击运行即可，保持窗口开着服务就在；关掉窗口或按 Ctrl+C 即停止
title Tower Odyssey - localhost:5180
cd /d E:\WorkSpace\tower-odyssey
echo [启动] http://localhost:5180  （玩家端 / ，管理后台 /admin）
node server.js
pause
