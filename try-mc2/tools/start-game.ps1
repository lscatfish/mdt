# 一键启动:启动本地服务器并打开浏览器
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $root
$serverScript = Join-Path $root 'tools\server.mjs'
$logOut = Join-Path $root 'server.out.log'
$logErr = Join-Path $root 'server.err.log'

$proc = Start-Process -FilePath 'node' -ArgumentList @($serverScript, '8080') -WorkingDirectory $root -PassThru -RedirectStandardOutput $logOut -RedirectStandardError $logErr
Start-Sleep -Milliseconds 900
Start-Process 'http://localhost:8080'
Write-Host "服务器已启动 (PID $($proc.Id)) -> http://localhost:8080"
Write-Host "按 Ctrl+C 或关闭游戏窗口后可在任务管理器中结束 node 进程;或运行:"
Write-Host "  Stop-Process -Id $($proc.Id)"
