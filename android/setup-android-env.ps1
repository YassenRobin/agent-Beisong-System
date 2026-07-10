param(
  [string]$SdkDir = "$PSScriptRoot\.android-sdk",
  [string]$GradleDir = "$PSScriptRoot\.gradle-dist",
  [string]$CommandLineToolsUrl = "https://dl.google.com/android/repository/commandlinetools-win-14742923_latest.zip",
  [string]$GradleUrl = "https://services.gradle.org/distributions/gradle-8.10.2-bin.zip"
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor 12288

function Ensure-Directory([string]$Path) {
  if (!(Test-Path -LiteralPath $Path)) {
    New-Item -ItemType Directory -Path $Path | Out-Null
  }
}

function Download-Zip([string]$Url, [string]$Target) {
  if (Test-Path -LiteralPath $Target) {
    $existing = Get-Item -LiteralPath $Target
    if ($existing.Length -gt 1048576) {
      return
    }
    Remove-Item -LiteralPath $Target -Force
  }
  $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
  if ($curl) {
    & curl.exe -L --ssl-no-revoke --retry 3 --retry-delay 2 -o $Target $Url
  } else {
    Invoke-WebRequest -Uri $Url -OutFile $Target
  }
}

Ensure-Directory $SdkDir
Ensure-Directory $GradleDir

$toolsZip = Join-Path $SdkDir "commandlinetools-win.zip"
$gradleZip = Join-Path $GradleDir "gradle-bin.zip"

Download-Zip $CommandLineToolsUrl $toolsZip
Download-Zip $GradleUrl $gradleZip

$cmdlineRoot = Join-Path $SdkDir "cmdline-tools"
$cmdlineLatest = Join-Path $cmdlineRoot "latest"
if (!(Test-Path -LiteralPath $cmdlineLatest)) {
  $tmpTools = Join-Path $SdkDir "cmdline-tools-tmp"
  if (Test-Path -LiteralPath $tmpTools) {
    Remove-Item -LiteralPath $tmpTools -Recurse -Force
  }
  Expand-Archive -LiteralPath $toolsZip -DestinationPath $tmpTools -Force
  Ensure-Directory $cmdlineRoot
  Move-Item -LiteralPath (Join-Path $tmpTools "cmdline-tools") -Destination $cmdlineLatest
  Remove-Item -LiteralPath $tmpTools -Recurse -Force
}

$gradleHome = Join-Path $GradleDir "gradle-8.10.2"
if (!(Test-Path -LiteralPath $gradleHome)) {
  Expand-Archive -LiteralPath $gradleZip -DestinationPath $GradleDir -Force
}

$env:ANDROID_HOME = $SdkDir
$env:ANDROID_SDK_ROOT = $SdkDir
$env:PATH = "$cmdlineLatest\bin;$SdkDir\platform-tools;$gradleHome\bin;$env:PATH"

& sdkmanager.bat --sdk_root=$SdkDir "platform-tools" "platforms;android-35" "build-tools;35.0.0"
("y`n" * 100) | & sdkmanager.bat --sdk_root=$SdkDir --licenses

Push-Location $PSScriptRoot
try {
  if (!(Test-Path -LiteralPath ".\gradlew.bat")) {
    & gradle.bat wrapper
  }
  & .\gradlew.bat assembleDebug
} finally {
  Pop-Location
}
