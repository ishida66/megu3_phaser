@echo off
cd /d "%~dp0"

echo Uploading MEGU assets to Cloudflare R2...
rclone copy "./assets" "kpm3:kpm3/assets" --progress

if errorlevel 1 (
    echo Upload failed!
) else (
    echo Upload completed successfully!
)

pause