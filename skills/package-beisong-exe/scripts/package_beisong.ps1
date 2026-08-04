[CmdletBinding()]
param(
    [string]$ProjectPath = (Get-Location).Path,
    [switch]$DirectoryOnly,
    [switch]$SkipTests,
    [switch]$VerifyOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-Checked {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$CommandArgs
    )

    Write-Host ("[RUN] {0} {1}" -f $FilePath, ($CommandArgs -join ' '))
    & $FilePath @CommandArgs
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed with exit code $LASTEXITCODE`: $FilePath"
    }
}

function Resolve-ArtifactName {
    param(
        [Parameter(Mandatory = $true)][string]$Template,
        [Parameter(Mandatory = $true)][string]$ProductName,
        [Parameter(Mandatory = $true)][string]$PackageName,
        [Parameter(Mandatory = $true)][string]$Version
    )

    return $Template.Replace('${productName}', $ProductName).
        Replace('${name}', $PackageName).
        Replace('${version}', $Version).
        Replace('${arch}', 'x64').
        Replace('${ext}', 'exe')
}

function Assert-NonEmptyFile {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Missing required file: $Path"
    }
    if ((Get-Item -LiteralPath $Path).Length -le 0) {
        throw "Required file is empty: $Path"
    }
}

function Get-ArchiveEntryInfo {
    param(
        [string[]]$Lines,
        [Parameter(Mandatory = $true)][string]$EntryPath
    )

    $index = [Array]::IndexOf($Lines, "Path = $EntryPath")
    if ($index -lt 0) {
        throw "Portable package is missing archive entry: $EntryPath"
    }

    $size = $null
    $crc = $null
    $upperBound = [Math]::Min($index + 12, $Lines.Length - 1)
    for ($lineIndex = $index + 1; $lineIndex -le $upperBound; $lineIndex++) {
        if ($Lines[$lineIndex] -match '^Size = (\d+)$') {
            $size = [Int64]$Matches[1]
        }
        if ($Lines[$lineIndex] -match '^CRC = ([0-9A-F]+)$') {
            $crc = $Matches[1]
        }
        if ($Lines[$lineIndex] -eq '') {
            break
        }
    }

    if ($null -eq $size -or $size -le 0) {
        throw "Portable archive entry is empty or has no size: $EntryPath"
    }
    if (-not $crc) {
        throw "Portable archive entry has no CRC: $EntryPath"
    }

    return [pscustomobject]@{
        Path = $EntryPath
        Size = $size
        CRC = $crc
    }
}

$resolvedProject = (Resolve-Path -LiteralPath $ProjectPath).Path
$packageJsonPath = Join-Path $resolvedProject 'package.json'
if (-not (Test-Path -LiteralPath $packageJsonPath -PathType Leaf)) {
    throw "package.json not found under $resolvedProject"
}

$package = Get-Content -LiteralPath $packageJsonPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($package.name -ne 'beisong') {
    throw "Expected package name 'beisong', got '$($package.name)'"
}
if (-not $package.scripts.pack) {
    throw "package.json does not define scripts.pack"
}

$nodeCommand = (Get-Command node.exe -ErrorAction Stop).Source
$npmCommand = (Get-Command npm.cmd -ErrorAction Stop).Source
$nodeModules = Join-Path $resolvedProject 'node_modules'
if (-not (Test-Path -LiteralPath $nodeModules -PathType Container)) {
    throw "node_modules is missing. Install locked dependencies after obtaining approval."
}

$releaseDirName = if ($package.build.directories.output) {
    [string]$package.build.directories.output
} else {
    'release'
}
$releaseDir = Join-Path $resolvedProject $releaseDirName
$unpackedDir = Join-Path $releaseDir 'win-unpacked'
$asarPath = Join-Path $unpackedDir 'resources\app.asar'
$ffmpegPath = Join-Path $unpackedDir 'ffmpeg.dll'
$nativeAddonPath = Join-Path $unpackedDir 'resources\app.asar.unpacked\node_modules\better-sqlite3\build\Release\better_sqlite3.node'
$unpackedExe = Join-Path $unpackedDir ("{0}.exe" -f $package.build.productName)
$asarCommand = Join-Path $resolvedProject 'node_modules\.bin\asar.cmd'
$electronCommand = Join-Path $resolvedProject 'node_modules\.bin\electron.cmd'

$originalLocation = (Get-Location).Path
try {
    Set-Location -LiteralPath $resolvedProject

    Write-Host "[INFO] Project: $resolvedProject"
    Write-Host "[INFO] Node: $(& $nodeCommand --version)"
    Write-Host "[INFO] Package: $($package.build.productName) $($package.version)"

    $gitCommand = Get-Command git.exe -ErrorAction SilentlyContinue
    if ($gitCommand) {
        Write-Host '[INFO] Working tree status (preserved, never cleaned):'
        & $gitCommand.Source status --short
        if ($LASTEXITCODE -ne 0) {
            Write-Warning 'Unable to read Git status; packaging may continue.'
        }
    }

    if (-not $SkipTests) {
        $loadPathTest = Join-Path $resolvedProject 'scripts\test-packaged-load-path.cjs'
        if (-not (Test-Path -LiteralPath $loadPathTest -PathType Leaf)) {
            throw "Missing packaged-path regression test: $loadPathTest"
        }
        Invoke-Checked -FilePath $nodeCommand -CommandArgs @($loadPathTest)

        $builtinTest = Join-Path $resolvedProject 'scripts\test-builtin-articles.cjs'
        if (Test-Path -LiteralPath $builtinTest -PathType Leaf) {
            Invoke-Checked -FilePath $nodeCommand -CommandArgs @($builtinTest)
        }
    }

    if (-not $VerifyOnly) {
        $packScript = if ($DirectoryOnly) { 'pack:dir' } else { 'pack' }
        if (-not $package.scripts.$packScript) {
            throw "package.json does not define scripts.$packScript"
        }
        Invoke-Checked -FilePath $npmCommand -CommandArgs @('run', $packScript)
    } else {
        Write-Host '[INFO] VerifyOnly: reusing existing release artifacts.'
    }

    Assert-NonEmptyFile -Path $asarPath
    Assert-NonEmptyFile -Path $ffmpegPath
    Assert-NonEmptyFile -Path $nativeAddonPath
    Assert-NonEmptyFile -Path $unpackedExe
    Assert-NonEmptyFile -Path $asarCommand

    $asarEntries = & $asarCommand list $asarPath
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to inspect app.asar: $asarPath"
    }
    foreach ($requiredEntry in @(
        '\dist\index.html',
        '\dist-electron\electron\main.js',
        '\dist-electron\electron\preload.js',
        '\dist-electron\src-server\data\builtinArticles.json',
        '\package.json'
    )) {
        if ($asarEntries -notcontains $requiredEntry) {
            throw "app.asar is missing $requiredEntry"
        }
    }

    $forbiddenEntries = @($asarEntries | Where-Object {
        $_ -match '(?i)(^|\\)\.env(?:\.local)?$' -or
        $_ -match '(?i)(^|\\)beisong\.db(?:-(?:wal|shm|journal))?$'
    })
    if ($forbiddenEntries.Count -gt 0) {
        throw "app.asar contains local secrets or user data: $($forbiddenEntries -join ', ')"
    }

    $artifacts = @($unpackedExe, $asarPath, $ffmpegPath)
    if (-not $DirectoryOnly) {
        $installerName = Resolve-ArtifactName `
            -Template ([string]$package.build.nsis.artifactName) `
            -ProductName ([string]$package.build.productName) `
            -PackageName ([string]$package.name) `
            -Version ([string]$package.version)
        $portableName = Resolve-ArtifactName `
            -Template ([string]$package.build.portable.artifactName) `
            -ProductName ([string]$package.build.productName) `
            -PackageName ([string]$package.name) `
            -Version ([string]$package.version)
        $installerPath = Join-Path $releaseDir $installerName
        $portablePath = Join-Path $releaseDir $portableName
        Assert-NonEmptyFile -Path $installerPath
        Assert-NonEmptyFile -Path $portablePath
        if ((Get-Item -LiteralPath $installerPath).Length -lt 50MB) {
            throw "Installer is unexpectedly small: $installerPath"
        }
        if ((Get-Item -LiteralPath $portablePath).Length -lt 50MB) {
            throw "Portable package is unexpectedly small: $portablePath"
        }

        $sevenZipCommand = & $nodeCommand -e "process.stdout.write(require('7zip-bin').path7za)"
        if ($LASTEXITCODE -ne 0) {
            throw 'Unable to resolve the electron-builder 7-Zip executable.'
        }
        Assert-NonEmptyFile -Path $sevenZipCommand
        $portableListing = [string[]](& $sevenZipCommand l -slt $portablePath 2>&1)
        if ($LASTEXITCODE -notin @(0, 1)) {
            throw "Unable to inspect portable package: $portablePath"
        }

        $portableAsar = Get-ArchiveEntryInfo -Lines $portableListing -EntryPath 'resources\app.asar'
        $null = Get-ArchiveEntryInfo -Lines $portableListing -EntryPath 'ffmpeg.dll'
        $null = Get-ArchiveEntryInfo `
            -Lines $portableListing `
            -EntryPath 'resources\app.asar.unpacked\node_modules\better-sqlite3\build\Release\better_sqlite3.node'

        $unpackedAsar = Get-Item -LiteralPath $asarPath
        if ($portableAsar.Size -ne $unpackedAsar.Length) {
            throw 'Portable app.asar size does not match win-unpacked app.asar.'
        }
        $crcOutput = [string[]](& $sevenZipCommand h -scrcCRC32 $asarPath)
        if ($LASTEXITCODE -ne 0) {
            throw "Unable to calculate app.asar CRC32: $asarPath"
        }
        $crcLine = $crcOutput | Where-Object {
            $_ -match '^CRC32\s+for data:\s+([0-9A-F]+)$'
        } | Select-Object -Last 1
        if (-not $crcLine) {
            throw "Unable to parse app.asar CRC32: $asarPath"
        }
        $null = $crcLine -match '^CRC32\s+for data:\s+([0-9A-F]+)$'
        $unpackedAsarCrc = $Matches[1]
        if ($portableAsar.CRC -ne $unpackedAsarCrc) {
            throw 'Portable app.asar CRC does not match win-unpacked app.asar.'
        }

        $artifacts = @($installerPath, $portablePath) + $artifacts
    }

    if (-not $SkipTests) {
        $electronSmoke = Join-Path $resolvedProject 'scripts\smoke-electron-builtin-articles.cjs'
        if ((Test-Path -LiteralPath $electronSmoke -PathType Leaf) -and
            (Test-Path -LiteralPath $electronCommand -PathType Leaf)) {
            Invoke-Checked -FilePath $electronCommand -CommandArgs @('--no-sandbox', $electronSmoke)
        }
    }

    Write-Host '[OK] Package and verification completed.'
    foreach ($artifact in $artifacts) {
        $item = Get-Item -LiteralPath $artifact
        $hash = (Get-FileHash -LiteralPath $artifact -Algorithm SHA256).Hash
        [pscustomobject]@{
            Path = $item.FullName
            SizeMB = [Math]::Round($item.Length / 1MB, 2)
            LastWriteTime = $item.LastWriteTime
            SHA256 = $hash
        } | Format-List
    }
} finally {
    Set-Location -LiteralPath $originalLocation
}
