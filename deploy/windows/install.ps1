# 塔界远征 · Windows Server 一键部署（防火墙放行 + 开机自启计划任务 + 立即启动）
#
#   管理员 PowerShell 执行：
#     powershell -ExecutionPolicy Bypass -File deploy\windows\install.ps1 -Port 5180
#
param(
    [string]$AppDir = (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)),
    [int]$Port = 5180
)

$ErrorActionPreference = 'Stop'
function Say($m) { Write-Host $m -ForegroundColor Cyan }
function Ok($m)  { Write-Host "   OK: $m" -ForegroundColor Green }
function Bad($m) { Write-Host "   FAIL: $m" -ForegroundColor Red; exit 1 }

Say "塔界远征 Windows 部署"
Say "  AppDir: $AppDir"
Say "  Port:   $Port"

# 1) 检查 Node
Say "`n[1/4] 检查 Node"
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { Bad "未找到 node.exe，请先安装 Node 18+ (https://nodejs.org) 并重启 PowerShell" }
$ver = (node -v)
Ok "node $ver ($($node.Source))"

# 2) 防火墙放行
Say "`n[2/4] 防火墙放行 $Port"
$ruleName = "Tower Odyssey $Port"
$existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if (-not $existing) {
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow -Profile Any | Out-Null
    Ok "已创建入站规则 $ruleName"
} else { Ok "规则已存在" }

# 3) 注册开机自启计划任务
Say "`n[3/4] 注册开机自启任务"
$task = 'TowerOdyssey'
$action  = New-ScheduledTaskAction -Execute $node.Source -Argument "server.js" -WorkingDirectory $AppDir
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable -DontStopIfGoingOnBatteries
$envSettings = New-ScheduledTaskSettingsSet
Register-ScheduledTask -TaskName $task -Action $action -Trigger $trigger -Settings $settings -Description 'Tower Odyssey Game Server' -Force -User 'SYSTEM' -RunLevel Highest | Out-Null
Ok "计划任务已注册（SYSTEM 权限，开机自启，崩溃重启 3 次）"

# 4) 启动并健康检查
Say "`n[4/4] 启动服务"
Stop-Process -Name node -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1
Start-Process -FilePath $node.Source -ArgumentList 'server.js' -WorkingDirectory $AppDir -WindowStyle Hidden
Start-Sleep -Seconds 3

try {
    $r = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 5
    Ok "健康检查通过：$($r | ConvertTo-Json -Compress)"
} catch { Bad "健康检查失败：$_" }

$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.*' } | Select-Object -First 1).IPAddress
Write-Host ""
Say "部署完成"
Write-Host "   本机访问： http://localhost:$Port" -ForegroundColor Yellow
Write-Host "   局域网/外网： http://${ip}:$Port   （腾讯云安全组也要放行 $Port）" -ForegroundColor Yellow
Write-Host "   停止服务： Stop-Process -Name node -Force" -ForegroundColor Gray
Write-Host "   卸载任务： Unregister-ScheduledTask -TaskName TowerOdyssey -Confirm:`$false" -ForegroundColor Gray
Write-Host "   生产建议： 用 NSSM (https://nssm.cc) 把 node 注册成真正的 Windows 服务，比计划任务稳定。" -ForegroundColor Gray
