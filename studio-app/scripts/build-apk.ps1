<#
.SYNOPSIS
  Builds the Moments Studio app's APK (side-loaded on Tony's Android phone, not in Play), and
  optionally publishes it so the app offers the update and /studio/app can download it.
  The same set-up as Check90's scripts/build-apk.ps1.

.EXAMPLE
  npm run apk                         # build only
  npm run apk -- -Install             # build, then install on a USB-connected phone with adb
  npm run apk -- -Publish             # build, then upload to the website (R2: mil-galleries/studio-app/)
#>
param(
  [switch]$Install,
  [switch]$Publish
)
$ErrorActionPreference = 'Stop'
$app = Split-Path -Parent $PSScriptRoot
$site = Split-Path -Parent $app

# Gradle needs a JDK. Android Studio ships one (JBR); use it if JAVA_HOME isn't set.
if (-not $env:JAVA_HOME) {
  $jbr = @('D:\Android\android-studio\jbr', 'C:\Program Files\Android\Android Studio\jbr') | Where-Object { Test-Path $_ } | Select-Object -First 1
  if ($jbr) { $env:JAVA_HOME = $jbr } else { throw 'No JDK found. Install Android Studio, or set JAVA_HOME.' }
}
if (-not $env:ANDROID_HOME) {
  $sdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
  if (Test-Path $sdk) { $env:ANDROID_HOME = $sdk } else { throw 'No Android SDK found. Open Android Studio once to install it.' }
}

# The Android version follows package.json (1.2.3 -> versionName 1.2.3, versionCode 10203).
$version = (Get-Content (Join-Path $app 'package.json') -Raw | ConvertFrom-Json).version
$parts = $version.Split('.') | ForEach-Object { [int]$_ }
$code = $parts[0] * 10000 + $parts[1] * 100 + $parts[2]
$gradle = Join-Path $app 'android\app\build.gradle'
(Get-Content $gradle -Raw) -replace 'versionCode \d+', "versionCode $code" -replace 'versionName "[^"]*"', "versionName `"$version`"" | Set-Content $gradle -NoNewline

Write-Host "== Building the app $version" -ForegroundColor Cyan
Push-Location $app
try {
  # Production build talks to the live studio (no VITE_API_URL).
  npm run build
  if ($LASTEXITCODE -ne 0) { throw 'Web build failed' }
  npx cap sync android
  if ($LASTEXITCODE -ne 0) { throw 'cap sync failed' }
} finally { Pop-Location }

Write-Host '== Building the APK with Gradle' -ForegroundColor Cyan
Push-Location (Join-Path $app 'android')
try {
  .\gradlew.bat assembleDebug
  if ($LASTEXITCODE -ne 0) { throw 'Gradle build failed' }
} finally { Pop-Location }
$apk = Join-Path $app 'android\app\build\outputs\apk\debug\app-debug.apk'
Write-Host "APK ready: $apk" -ForegroundColor Green

if ($Install) {
  & (Join-Path $env:ANDROID_HOME 'platform-tools\adb.exe') install -r $apk
  if ($LASTEXITCODE -ne 0) { throw 'adb install failed. Is the phone plugged in with USB debugging on?' }
}

if ($Publish) {
  Write-Host '== Publishing to the website' -ForegroundColor Cyan
  $info = Join-Path $env:TEMP 'moments-studio-latest.json'
  @{ version = $version; builtAt = (Get-Date).ToUniversalTime().ToString('o') } | ConvertTo-Json | Set-Content -Path $info -Encoding utf8NoBOM
  Push-Location $site
  try {
    npx wrangler r2 object put mil-galleries/studio-app/MomentsStudio.apk --file $apk --remote --content-type application/vnd.android.package-archive
    if ($LASTEXITCODE -ne 0) { throw 'Uploading the APK failed' }
    npx wrangler r2 object put mil-galleries/studio-app/latest.json --file $info --remote --content-type application/json
    if ($LASTEXITCODE -ne 0) { throw 'Uploading the version info failed' }
  } finally { Pop-Location }
  Write-Host "Published ${version}: https://www.momentsinlight.co.nz/studio/app" -ForegroundColor Green
}
