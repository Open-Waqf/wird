param(
    [string]$ProjectRoot = "$PSScriptRoot/..",
    [string]$EmulatorSerial = "emulator-5554",
    [string]$PackageName = "org.openwaqf.wird",
    [string]$MainActivity = ".MainActivity",
    [int]$CaptureSeconds = 8,
    [object]$AutoTapSample = $false,
    [int]$SampleTapDelaySeconds = 6,
    [int]$SampleTapX = 540,
    [int]$SampleTapY = 1580,
    [int]$SampleTapAttempts = 4,
    [int]$SampleTapStepY = 90,
    [object]$RunMaestro = $false,
    [object]$MaestroContinueOnFailure = $false,
    [int]$MaestroMaxFlowSeconds = 120,
    [string]$MaestroFlow = "$PSScriptRoot/../maestro/android/full-e2e.yaml",
    [object]$AssertSampleFlow = $false,
    [object]$AssembleApk = $true,
    [object]$InstallApk = $true,
    [string]$JavaHome = ""
)

$ErrorActionPreference = 'Stop'
$scriptStartedAt = Get-Date

function Step($msg) {
    Write-Host "`n==> $msg" -ForegroundColor Cyan
}

function Format-Duration([TimeSpan]$ts) {
    return "{0:00}:{1:00}:{2:00}" -f [int]$ts.TotalHours, $ts.Minutes, $ts.Seconds
}

function Invoke-MaestroFlow([string]$maestroPath, [string]$serial, [string]$flowPath, [int]$timeoutSeconds, [string]$appendFilePath) {
    $tmpOut = Join-Path $env:TEMP ("owq-maestro-out-" + [guid]::NewGuid().ToString("N") + ".log")
    $tmpErr = Join-Path $env:TEMP ("owq-maestro-err-" + [guid]::NewGuid().ToString("N") + ".log")
    $args = @("test", "--device", $serial, $flowPath)
    $proc = Start-Process -FilePath $maestroPath -ArgumentList $args -NoNewWindow -PassThru -RedirectStandardOutput $tmpOut -RedirectStandardError $tmpErr
    $timedOut = $false

    if (-not $proc.WaitForExit($timeoutSeconds * 1000)) {
        $timedOut = $true
        try {
            Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
        } catch {}
        try {
            $proc.WaitForExit()
        } catch {}
    }

    $stdout = if (Test-Path $tmpOut) { Get-Content -Path $tmpOut -Raw } else { "" }
    $stderr = if (Test-Path $tmpErr) { Get-Content -Path $tmpErr -Raw } else { "" }
    $combined = "$stdout`n$stderr"
    if ($combined) {
        $combined | Out-File -FilePath $appendFilePath -Encoding utf8 -Append
    }
    if (Test-Path $tmpOut) { Remove-Item -Force $tmpOut -ErrorAction SilentlyContinue }
    if (Test-Path $tmpErr) { Remove-Item -Force $tmpErr -ErrorAction SilentlyContinue }

    return [PSCustomObject]@{
        Output = $combined
        ExitCode = if ($timedOut) { 124 } else { $proc.ExitCode }
        TimedOut = $timedOut
    }
}

function To-Bool([object]$value) {
    if ($value -is [bool]) { return $value }
    $text = "$value".Trim().ToLowerInvariant()
    if ($text -in @("1", "true", "$true", "yes", "y", "on")) { return $true }
    if ($text -in @("0", "false", "$false", "no", "n", "off", "")) { return $false }
    throw "Invalid boolean value '$value'. Use true/false or 1/0."
}

function Resolve-Tool($toolName, $fallback) {
    $cmd = Get-Command $toolName -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Path }
    return $fallback
}

function Resolve-AndroidSdkPath() {
    $candidates = @()
    if ($env:ANDROID_HOME) { $candidates += $env:ANDROID_HOME }
    if ($env:ANDROID_SDK_ROOT) { $candidates += $env:ANDROID_SDK_ROOT }
    if ($env:LOCALAPPDATA) { $candidates += (Join-Path $env:LOCALAPPDATA "Android\Sdk") }
    $candidates += "C:\Android\Sdk"
    foreach ($sdk in ($candidates | Select-Object -Unique)) {
        if (-not $sdk) { continue }
        if (Test-Path (Join-Path $sdk "platform-tools")) {
            return $sdk
        }
    }
    return $null
}

function Ensure-DeviceReady([string]$adbPath, [string]$serial, [int]$timeoutSeconds = 45) {
    & $adbPath start-server | Out-Null
    $deadline = (Get-Date).AddSeconds($timeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        $state = (& $adbPath -s $serial get-state 2>$null | Out-String).Trim().ToLowerInvariant()
        if ($state -eq "device") { return }
        if ($state -eq "offline") {
            & $adbPath reconnect offline | Out-Null
        }
        Start-Sleep -Seconds 2
    }
    throw "ADB device '$serial' is not ready (state is not 'device')."
}

function Invoke-CmdAt([string]$workingDir, [string]$command) {
    $cmd = "pushd `"$workingDir`" && $command && popd"
    $stdoutFile = Join-Path $env:TEMP ("owq-cmd-out-" + [guid]::NewGuid().ToString("N") + ".log")
    $stderrFile = Join-Path $env:TEMP ("owq-cmd-err-" + [guid]::NewGuid().ToString("N") + ".log")
    try {
        $proc = Start-Process -FilePath "cmd.exe" -ArgumentList @("/d", "/c", $cmd) -NoNewWindow -PassThru -Wait `
            -RedirectStandardOutput $stdoutFile -RedirectStandardError $stderrFile
        $stdout = if (Test-Path $stdoutFile) { Get-Content -Path $stdoutFile -Raw } else { "" }
        $stderr = if (Test-Path $stderrFile) { Get-Content -Path $stderrFile -Raw } else { "" }
        $combined = (($stdout + "`n" + $stderr).Trim())
        if ($proc.ExitCode -ne 0) {
            throw "Command failed (exit $($proc.ExitCode)): $command`n$combined"
        }
        return $combined
    } finally {
        if (Test-Path $stdoutFile) { Remove-Item -Force $stdoutFile -ErrorAction SilentlyContinue }
        if (Test-Path $stderrFile) { Remove-Item -Force $stderrFile -ErrorAction SilentlyContinue }
    }
}

function Write-AdbTextFile([string]$adbPath, [string]$serial, [string]$adbArgs, [string]$outputPath, [string]$cmdWorkingDir) {
    $cmd = "`"$adbPath`" -s $serial $adbArgs > `"$outputPath`""
    Invoke-CmdAt $cmdWorkingDir $cmd
}

function Ensure-AppForeground([string]$adbPath, [string]$serial, [string]$packageName, [string]$launchTarget) {
    Start-Sleep -Milliseconds 700
    $focus = (& $adbPath -s $serial shell dumpsys window windows 2>$null | Out-String)
    if ($focus -notmatch [regex]::Escape($packageName)) {
        Write-Host "App not in foreground yet; relaunching $launchTarget and waiting." -ForegroundColor Yellow
        & $adbPath -s $serial shell am start -W -n $launchTarget | Out-Null
        Start-Sleep -Milliseconds 900
    }
}

function Get-JavaMajorVersion([string]$javaExePath) {
    try {
        $verText = & $javaExePath -version 2>&1 | Out-String
        $m = [regex]::Match($verText, 'version "(\d+)(?:\.\d+)?')
        if ($m.Success) { return [int]$m.Groups[1].Value }
    } catch {}
    return -1
}

function Resolve-Java21Home([string]$requestedJavaHome) {
    $candidates = @()
    if ($requestedJavaHome) {
        $explicitJava = Join-Path $requestedJavaHome "bin\java.exe"
        if (Test-Path $explicitJava) {
            return $requestedJavaHome
        }
    }
    if ($requestedJavaHome) { $candidates += $requestedJavaHome }
    if ($env:JDK21_HOME) { $candidates += $env:JDK21_HOME }
    if ($env:GRADLE_LOCAL_JAVA_HOME) { $candidates += $env:GRADLE_LOCAL_JAVA_HOME }
    if ($env:ORG_GRADLE_JAVA_HOME) { $candidates += $env:ORG_GRADLE_JAVA_HOME }
    if ($env:JAVA_HOME) { $candidates += $env:JAVA_HOME }
    # Scan env vars for other java home hints (e.g. JAVA21_HOME, JDK_HOME)
    foreach ($entry in Get-ChildItem Env:) {
        if ($entry.Name -match 'JAVA.*HOME|JDK.*HOME|GRADLE.*JAVA.*HOME') {
            if ($entry.Value) { $candidates += $entry.Value }
        }
    }
    $candidates += @(
        "C:\Program Files\Android\Android Studio\jbr",
        "C:\Program Files\Java\jdk-21",
        "C:\Program Files\Eclipse Adoptium\jdk-21.0.6.7-hotspot",
        "C:\Program Files\Microsoft\jdk-21.0.7.6-hotspot"
    )

    # Scan common installation roots for JDK 21+ folders (handles patch-version drift).
    $scanRoots = @(
        "C:\Program Files\Microsoft",
        "C:\Program Files\Java",
        "C:\Program Files\Eclipse Adoptium",
        "C:\Program Files\Zulu",
        "C:\Program Files\Amazon Corretto",
        "C:\Program Files\BellSoft",
        "C:\Users\$env:USERNAME\.jdks"
    )
    foreach ($root in $scanRoots | Select-Object -Unique) {
        if (-not (Test-Path $root)) { continue }
        try {
            $dirs = Get-ChildItem -Path $root -Directory -ErrorAction SilentlyContinue
            foreach ($dir in $dirs) {
                $name = $dir.Name
                if ($name -match '^jdk-([0-9]+)' -or $name -match 'jbr-?([0-9]+)') {
                    $major = [int]$Matches[1]
                    if ($major -ge 21) {
                        $candidates += $dir.FullName
                    }
                }
            }
        } catch {}
    }

    foreach ($jdkHome in $candidates | Select-Object -Unique) {
        $javaExe = Join-Path $jdkHome "bin\java.exe"
        if (Test-Path $javaExe) {
            $major = Get-JavaMajorVersion $javaExe
            if ($major -ge 21) {
                return $jdkHome
            }
        }
    }

    # Fallback: resolve java from PATH (useful when -NoProfile omits JAVA_HOME).
    try {
        $javaPathCandidates = @()
        $javaCmds = @(Get-Command java -CommandType Application -ErrorAction SilentlyContinue)
        foreach ($cmd in $javaCmds) {
            if ($cmd.Path) {
                $javaPathCandidates += "$($cmd.Path)".Trim()
            } elseif ($cmd.Source) {
                $javaPathCandidates += "$($cmd.Source)".Trim()
            }
        }
        foreach ($line in @(& where.exe java 2>$null)) {
            $candidate = "$line".Trim()
            if ($candidate) {
                $javaPathCandidates += $candidate
            }
        }

        foreach ($javaExePath in ($javaPathCandidates | Where-Object { $_ } | Select-Object -Unique)) {
            if (-not (Test-Path $javaExePath)) { continue }
            $major = Get-JavaMajorVersion $javaExePath
            if ($major -lt 21) { continue }

            $javaProps = (& $javaExePath -XshowSettings:properties -version 2>&1 | Out-String)
            $javaHomeMatch = [regex]::Match($javaProps, '(?m)^\s*java\.home\s*=\s*(.+?)\s*$')
            $javaHome = if ($javaHomeMatch.Success) { $javaHomeMatch.Groups[1].Value.Trim() } else { "" }

            if (-not $javaHome) {
                $binDir = Split-Path $javaExePath -Parent
                $javaHome = Split-Path $binDir -Parent
            }
            if ($javaHome -match '\\jre$') {
                $javaHome = Split-Path $javaHome -Parent
            }

            $homeJavaExe = Join-Path $javaHome "bin\java.exe"
            if (Test-Path $homeJavaExe) {
                return $javaHome
            }
        }
    } catch {}

    return $null
}

$resolvedRoot = [System.IO.Path]::GetFullPath((Convert-Path $ProjectRoot))
$isUncRoot = $resolvedRoot.StartsWith("\\")
if ($isUncRoot) {
    # Keep a local Windows cwd so cmd.exe/batch calls don't start from UNC.
    Set-Location $env:TEMP
} else {
    Set-Location $resolvedRoot
}

$adb = Resolve-Tool "adb" "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
if (-not (Test-Path $adb)) {
    throw "adb not found. Checked PATH and '$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe'."
}

$AutoTapSample = To-Bool $AutoTapSample
$RunMaestro = To-Bool $RunMaestro
$MaestroContinueOnFailure = To-Bool $MaestroContinueOnFailure
$AssertSampleFlow = To-Bool $AssertSampleFlow
$AssembleApk = To-Bool $AssembleApk
$InstallApk = To-Bool $InstallApk

if ($AssembleApk) {
    $resolvedJavaHome = Resolve-Java21Home $JavaHome
    if (-not $resolvedJavaHome) {
        throw "Java 21 not found. Pass -JavaHome '<jdk21 path>' or set JAVA_HOME to JDK 21."
    }
    $env:JAVA_HOME = $resolvedJavaHome
    $env:Path = "$resolvedJavaHome\bin;$env:Path"
}

Step "Checking emulator/device connection"
& $adb devices -l
$devices = (& $adb devices) -split "`n" | Where-Object { $_ -match "\sdevice$" }
if (-not ($devices -match "^$EmulatorSerial\s")) {
    throw "Device '$EmulatorSerial' not connected. Start emulator and retry."
}
Ensure-DeviceReady $adb $EmulatorSerial

$sourceAndroidDir = Join-Path $resolvedRoot "android"
$androidDir = $sourceAndroidDir
$stagedRoot = $null
$cmdWorkingDir = if ($isUncRoot) { $env:TEMP } else { $resolvedRoot }
if ($isUncRoot) {
    $stagedRoot = Join-Path $env:TEMP "owq-wird-build"
    $androidDir = Join-Path $stagedRoot "android"
    Step "Staging Android + Capacitor plugin modules to local Windows path for Gradle build"
    if (Test-Path $stagedRoot) {
        Remove-Item -Recurse -Force $stagedRoot
    }
    New-Item -ItemType Directory -Path $androidDir -Force | Out-Null
    robocopy $sourceAndroidDir $androidDir /MIR /NFL /NDL /NJH /NJS /NC /NS | Out-Null

    $pluginPaths = @(
        "node_modules\@capacitor\android",
        "node_modules\@capacitor\app",
        "node_modules\@capacitor\browser",
        "node_modules\@capacitor\filesystem",
        "node_modules\@capacitor\haptics",
        "node_modules\@capacitor\local-notifications",
        "node_modules\@capacitor\preferences",
        "node_modules\@capacitor\share",
        "node_modules\@capacitor\status-bar",
        "node_modules\@capacitor-mlkit\barcode-scanning"
    )
    foreach ($rel in $pluginPaths) {
        $src = Join-Path $resolvedRoot $rel
        if (Test-Path $src) {
            $dst = Join-Path $stagedRoot $rel
            New-Item -ItemType Directory -Path $dst -Force | Out-Null
            robocopy $src $dst /MIR /NFL /NDL /NJH /NJS /NC /NS | Out-Null
        }
    }

    # Ensure staged Gradle build has an SDK path when running from UNC/WSL staging.
    $sdkPath = Resolve-AndroidSdkPath
    if ($sdkPath) {
        $localProps = Join-Path $androidDir "local.properties"
        "sdk.dir=$($sdkPath -replace '\\','\\\\')" | Out-File -FilePath $localProps -Encoding ascii
    } else {
        Write-Host "Android SDK path could not be auto-detected for staged build. Set ANDROID_HOME or ANDROID_SDK_ROOT." -ForegroundColor Yellow
    }
}

$apkPath = Join-Path $androidDir "app\build\outputs\apk\debug\app-debug.apk"

if ($AssembleApk) {
    Step "Assembling debug APK (Windows Gradle wrapper)"
    Write-Host "Using JAVA_HOME=$env:JAVA_HOME" -ForegroundColor DarkGray
    $gradleCmd = "pushd `"$androidDir`" && gradlew.bat assembleDebug && popd"
    Invoke-CmdAt $cmdWorkingDir $gradleCmd
}

# Resolve APK path dynamically because AGP output filenames can vary.
$apkDir = Join-Path $androidDir "app\build\outputs\apk\debug"
$apkCandidates = @()
if (Test-Path $apkDir) {
    $apkCandidates = Get-ChildItem -Path $apkDir -Filter "*.apk" -Recurse -ErrorAction SilentlyContinue
}
if ($apkCandidates -and $apkCandidates.Count -gt 0) {
    $apkPath = ($apkCandidates | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
}

if ($InstallApk) {
    if (-not (Test-Path $apkPath)) {
        throw "APK not found at '$apkPath'. Build failed or output path changed. Checked '$apkDir'."
    }
    Step "Installing APK on $EmulatorSerial"
    Ensure-DeviceReady $adb $EmulatorSerial
    $installSource = $apkPath
    if ($installSource.StartsWith("\\")) {
        $staged = Join-Path $env:TEMP "owq-app-debug.apk"
        Copy-Item -Force $installSource $staged
        $installSource = $staged
    }
    $installOut = (& $adb -s $EmulatorSerial install -r $installSource 2>&1 | Out-String)
    if ($installOut -notmatch "Success") {
        throw "APK install failed for '$installSource'. adb output: $installOut"
    }
}

$outDir = Join-Path $resolvedRoot "test-results\android-smoke"
New-Item -ItemType Directory -Path $outDir -Force | Out-Null

Step "Checking app installation"
Ensure-DeviceReady $adb $EmulatorSerial
$installed = & $adb -s $EmulatorSerial shell pm list packages $PackageName
if (-not ($installed -match "package:$PackageName")) {
    $candidates = (& $adb -s $EmulatorSerial shell pm list packages) `
        | Where-Object { $_ -match "package:.*wird" }
    if ($candidates -and $candidates.Count -gt 0) {
        $detected = ($candidates[0] -replace "^package:", "").Trim()
        Write-Host "Package '$PackageName' not found. Using detected package '$detected'." -ForegroundColor Yellow
        $PackageName = $detected
    } else {
        throw "Package '$PackageName' is not installed on $EmulatorSerial. Install APK first."
    }
}

Step "Launching app"
$launchLog = Join-Path $resolvedRoot "test-results\android-smoke\launch.txt"
New-Item -ItemType Directory -Path (Split-Path -Parent $launchLog) -Force | Out-Null
& $adb -s $EmulatorSerial logcat -c
$resolvedActivity = (& $adb -s $EmulatorSerial shell cmd package resolve-activity --brief $PackageName 2>$null | Select-Object -Last 1).Trim()
$launchTarget = if ($resolvedActivity -match "^$PackageName\/") { $resolvedActivity } else { "$PackageName/$MainActivity" }
$launchOut = & $adb -s $EmulatorSerial shell am start -W -n $launchTarget 2>&1
$launchText = ($launchOut | Out-String)
$launchText | Out-File -FilePath $launchLog -Encoding utf8
if ($launchText -match "Error type\s+\d+" -or $launchText -match "does not exist") {
    throw "Failed to launch activity '$launchTarget'. adb output: $launchText"
}
Ensure-AppForeground $adb $EmulatorSerial $PackageName $launchTarget

Step "Collecting diagnostics and logs into $outDir"

$deviceInfo = Join-Path $outDir "device-info.txt"
$dumpsysMem = Join-Path $outDir "meminfo.txt"
$dumpsysActivity = Join-Path $outDir "activity-top.txt"
$uiDump = Join-Path $outDir "window-dump.xml"
$screenPng = Join-Path $outDir "screenshot.png"
$logcatDump = Join-Path $outDir "logcat.txt"

Write-AdbTextFile $adb $EmulatorSerial "shell getprop" $deviceInfo $cmdWorkingDir
Write-AdbTextFile $adb $EmulatorSerial "shell dumpsys meminfo $PackageName" $dumpsysMem $cmdWorkingDir
Write-AdbTextFile $adb $EmulatorSerial "shell dumpsys activity top" $dumpsysActivity $cmdWorkingDir
& $adb -s $EmulatorSerial shell uiautomator dump /sdcard/window_dump.xml | Out-Null
& $adb -s $EmulatorSerial pull /sdcard/window_dump.xml $uiDump | Out-Null
$screenCmd = "`"$adb`" -s $EmulatorSerial exec-out screencap -p > `"$screenPng`""
Invoke-CmdAt $cmdWorkingDir $screenCmd

if ($RunMaestro) {
    Step "Running Maestro flow"
    $maestro = Resolve-Tool "maestro" "$env:USERPROFILE\scoop\shims\maestro.cmd"
    if (-not (Test-Path $maestro)) {
        throw "maestro CLI not found. Install with 'scoop install maestro' or add to PATH."
    }

    $flowPath = $MaestroFlow
    if (-not [System.IO.Path]::IsPathRooted($flowPath)) {
        $flowPath = Join-Path $resolvedRoot $flowPath
    }
    $flowPath = [System.IO.Path]::GetFullPath($flowPath)
    if (-not (Test-Path $flowPath)) {
        throw "Maestro flow file not found: $flowPath"
    }

    $flowToRun = $flowPath
    if ($flowToRun.StartsWith("\\")) {
        # Stage the whole maestro/android tree so runFlow relative includes keep working.
        $maestroRoot = Split-Path -Parent $flowPath
        $localMaestroRoot = Join-Path $env:TEMP "owq-maestro"
        if (Test-Path $localMaestroRoot) {
            Remove-Item -Recurse -Force $localMaestroRoot
        }
        New-Item -ItemType Directory -Path $localMaestroRoot -Force | Out-Null
        robocopy $maestroRoot $localMaestroRoot /MIR /NFL /NDL /NJH /NJS /NC /NS | Out-Null
        $flowToRun = Join-Path $localMaestroRoot ([System.IO.Path]::GetFileName($flowPath))
    }

    $maestroOutFile = Join-Path $outDir "maestro-output.txt"
    New-Item -ItemType Directory -Path (Split-Path -Parent $maestroOutFile) -Force | Out-Null
    if (Test-Path $maestroOutFile) {
        Remove-Item -Force $maestroOutFile
    }
    Write-Host "- Maestro target device: $EmulatorSerial" -ForegroundColor DarkGray
    Write-Host "- Maestro max seconds per flow: $MaestroMaxFlowSeconds" -ForegroundColor DarkGray
    Write-Host "- Connected adb devices:" -ForegroundColor DarkGray
    & $adb devices -l

    $maestroStartedAt = Get-Date
    [TimeSpan]$maestroFlowsElapsed = [TimeSpan]::Zero
    $maestroPerFlowDurations = @()
    $maestroOutput = ""
    $expectedFlowCount = 1
    $failedFlows = @()

    if ($MaestroContinueOnFailure) {
        $flowRaw = Get-Content -Path $flowToRun -Raw
        $runFlowMatches = [regex]::Matches($flowRaw, '(?m)^\s*-\s*runFlow\s*:\s*(.+?)\s*$')
        $expectedFlowCount = [Math]::Max(1, $runFlowMatches.Count)

        if ($runFlowMatches.Count -gt 0) {
            $flowBaseDir = Split-Path -Parent $flowToRun
            $outputBuilder = New-Object System.Text.StringBuilder
            [void]$outputBuilder.AppendLine("Running on $EmulatorSerial")
            [void]$outputBuilder.AppendLine(" > Flow $flowToRun")
            $outputBuilder.ToString() | Out-File -FilePath $maestroOutFile -Encoding utf8

            foreach ($m in $runFlowMatches) {
                $flowRel = $m.Groups[1].Value.Trim()
                if (($flowRel.StartsWith('"') -and $flowRel.EndsWith('"')) -or ($flowRel.StartsWith("'") -and $flowRel.EndsWith("'"))) {
                    $flowRel = $flowRel.Substring(1, $flowRel.Length - 2)
                }
                $subFlowPath = if ([System.IO.Path]::IsPathRooted($flowRel)) { $flowRel } else { Join-Path $flowBaseDir $flowRel }
                $subFlowPath = [System.IO.Path]::GetFullPath($subFlowPath)
                $subFlowPathYaml = $subFlowPath.Replace('\', '/')
                $wrapperFlowPath = Join-Path $env:TEMP ("owq-maestro-wrapper-" + [System.IO.Path]::GetFileNameWithoutExtension($subFlowPath) + ".yaml")
                @"
appId: $PackageName
---
- launchApp:
    clearState: true
- waitForAnimationToEnd
- runFlow: $subFlowPathYaml
"@ | Out-File -FilePath $wrapperFlowPath -Encoding utf8

                $runHeader = "Run $flowRel..."
                [void]$outputBuilder.AppendLine($runHeader)
                $runHeader | Out-File -FilePath $maestroOutFile -Encoding utf8 -Append
                $runStartedAt = Get-Date
                $runResult = Invoke-MaestroFlow -maestroPath $maestro -serial $EmulatorSerial -flowPath $wrapperFlowPath -timeoutSeconds $MaestroMaxFlowSeconds -appendFilePath $maestroOutFile
                $runOutput = $runResult.Output
                $runExit = $runResult.ExitCode
                $runElapsed = (Get-Date) - $runStartedAt
                $maestroFlowsElapsed = $maestroFlowsElapsed.Add($runElapsed)
                $maestroPerFlowDurations += [PSCustomObject]@{ Name = $flowRel; Duration = $runElapsed }
                $runTiming = "- Flow duration [$flowRel]: $(Format-Duration $runElapsed)"
                Write-Host $runTiming -ForegroundColor DarkGray
                $runTiming | Out-File -FilePath $maestroOutFile -Encoding utf8 -Append
                if ($runResult.TimedOut) {
                    $timeoutMsg = "Flow timed out after $MaestroMaxFlowSeconds seconds: $flowRel"
                    Write-Host "- $timeoutMsg" -ForegroundColor Yellow
                    $timeoutMsg | Out-File -FilePath $maestroOutFile -Encoding utf8 -Append
                }
                [void]$outputBuilder.Append($runOutput)
                if ($runExit -ne 0) {
                    $failedFlows += $flowRel
                }
            }
            $maestroOutput = $outputBuilder.ToString()
        } else {
            # No runFlow entries found; fallback to single flow execution.
            "Running on $EmulatorSerial" | Out-File -FilePath $maestroOutFile -Encoding utf8
            " > Flow $flowToRun" | Out-File -FilePath $maestroOutFile -Encoding utf8 -Append
            $runStartedAt = Get-Date
            $runResult = Invoke-MaestroFlow -maestroPath $maestro -serial $EmulatorSerial -flowPath $flowToRun -timeoutSeconds $MaestroMaxFlowSeconds -appendFilePath $maestroOutFile
            $maestroOutput = $runResult.Output
            $runElapsed = (Get-Date) - $runStartedAt
            $maestroFlowsElapsed = $maestroFlowsElapsed.Add($runElapsed)
            $maestroPerFlowDurations += [PSCustomObject]@{ Name = [System.IO.Path]::GetFileName($flowToRun); Duration = $runElapsed }
            $runTiming = "- Flow duration [$([System.IO.Path]::GetFileName($flowToRun))]: $(Format-Duration $runElapsed)"
            Write-Host $runTiming -ForegroundColor DarkGray
            $runTiming | Out-File -FilePath $maestroOutFile -Encoding utf8 -Append
            if ($runResult.TimedOut) {
                $timeoutMsg = "Flow timed out after $MaestroMaxFlowSeconds seconds: $flowToRun"
                Write-Host "- $timeoutMsg" -ForegroundColor Yellow
                $timeoutMsg | Out-File -FilePath $maestroOutFile -Encoding utf8 -Append
            }
            if ($runResult.ExitCode -ne 0) {
                $failedFlows += $flowToRun
            }
        }
    } else {
        # Default behavior: execute the aggregate flow and stop on first failure.
        "Running on $EmulatorSerial" | Out-File -FilePath $maestroOutFile -Encoding utf8
        " > Flow $flowToRun" | Out-File -FilePath $maestroOutFile -Encoding utf8 -Append
        $runStartedAt = Get-Date
        $runResult = Invoke-MaestroFlow -maestroPath $maestro -serial $EmulatorSerial -flowPath $flowToRun -timeoutSeconds $MaestroMaxFlowSeconds -appendFilePath $maestroOutFile
        $maestroOutput = $runResult.Output
        $runElapsed = (Get-Date) - $runStartedAt
        $maestroFlowsElapsed = $maestroFlowsElapsed.Add($runElapsed)
        $maestroPerFlowDurations += [PSCustomObject]@{ Name = [System.IO.Path]::GetFileName($flowToRun); Duration = $runElapsed }
        $runTiming = "- Flow duration [$([System.IO.Path]::GetFileName($flowToRun))]: $(Format-Duration $runElapsed)"
        Write-Host $runTiming -ForegroundColor DarkGray
        $runTiming | Out-File -FilePath $maestroOutFile -Encoding utf8 -Append
        if ($runResult.TimedOut) {
            $timeoutMsg = "Flow timed out after $MaestroMaxFlowSeconds seconds: $flowToRun"
            Write-Host "- $timeoutMsg" -ForegroundColor Yellow
            $timeoutMsg | Out-File -FilePath $maestroOutFile -Encoding utf8 -Append
        }
        if (Test-Path $flowToRun) {
            $expectedFlowCount = [Math]::Max(1, ([regex]::Matches((Get-Content -Path $flowToRun -Raw), '^\s*-\s*runFlow\s*:', [System.Text.RegularExpressions.RegexOptions]::Multiline)).Count)
        }
        if ($runResult.ExitCode -ne 0) {
            $failedFlows += $flowToRun
        }
    }

    if (-not (Test-Path $maestroOutFile)) {
        $maestroOutput | Out-File -FilePath $maestroOutFile -Encoding utf8
    }
    $maestroCompleted = ([regex]::Matches($maestroOutput, '\.\.\. COMPLETED')).Count
    $maestroSkipped = ([regex]::Matches($maestroOutput, '\.\.\. SKIPPED')).Count
    $maestroFailed = ([regex]::Matches($maestroOutput, '\.\.\. FAILED')).Count
    $maestroElapsed = (Get-Date) - $maestroStartedAt
    Write-Host "- Maestro flow: $flowToRun" -ForegroundColor DarkGray
    Write-Host "- Maestro expected runFlow count: $expectedFlowCount" -ForegroundColor DarkGray
    Write-Host "- Maestro steps: completed=$maestroCompleted skipped=$maestroSkipped failed=$maestroFailed" -ForegroundColor DarkGray
    Write-Host "- Maestro test time (sum of flows): $(Format-Duration $maestroFlowsElapsed)" -ForegroundColor DarkGray
    Write-Host "- Maestro total wall time: $(Format-Duration $maestroElapsed)" -ForegroundColor DarkGray
    if ($MaestroContinueOnFailure) {
        Write-Host "- Maestro continue-on-failure mode: enabled" -ForegroundColor DarkGray
    }
    Write-Host "- Maestro output: $maestroOutFile" -ForegroundColor DarkGray
    if ($failedFlows.Count -gt 0) {
        $failedList = ($failedFlows | Select-Object -Unique) -join ", "
        throw "Maestro flow failed in $($failedFlows.Count) item(s): $failedList. See $maestroOutFile"
    }
} elseif ($AutoTapSample) {
    Step "Auto tap sample button after ${SampleTapDelaySeconds}s (x=$SampleTapX, y=$SampleTapY, attempts=$SampleTapAttempts, stepY=$SampleTapStepY)"
    Start-Sleep -Seconds $SampleTapDelaySeconds
    $attemptCount = [Math]::Max(1, $SampleTapAttempts)
    for ($i = 0; $i -lt $attemptCount; $i++) {
        $tapY = $SampleTapY + ($i * $SampleTapStepY)
        if ($tapY -gt 2300) { $tapY = 2300 }
        Write-Host "  - tap #$($i + 1): x=$SampleTapX y=$tapY" -ForegroundColor DarkGray
        & $adb -s $EmulatorSerial shell input tap $SampleTapX $tapY | Out-Null
        Start-Sleep -Milliseconds 700
    }
}

Start-Sleep -Seconds $CaptureSeconds
Write-AdbTextFile $adb $EmulatorSerial "logcat -d" $logcatDump $cmdWorkingDir

if ($AssertSampleFlow) {
    Step "Asserting sample-flow markers in logcat"
    $logText = Get-Content -Path $logcatDump -Raw
    $sampleClickIdx = $logText.IndexOf("[OWQ][SAMPLE_CLICK]")
    $sampleLoadedStaticIdx = $logText.IndexOf("[OWQ][SAMPLE_LOADED][STATIC]")
    $sampleLoadedGeneratedIdx = $logText.IndexOf("[OWQ][SAMPLE_LOADED][GENERATED]")
    $workspaceLoadedIdx = $logText.IndexOf("[OWQ][WORKSPACE_LOADED]")
    $workspaceLoadFailedIdx = $logText.IndexOf("[OWQ][WORKSPACE_LOAD_FAILED]")
    $saveStartIdx = $logText.IndexOf("[OWQ][SAVE_START]")
    $saveSuccessIdx = $logText.IndexOf("[OWQ][SAVE_SUCCESS]")
    $saveFailedIdx = $logText.IndexOf("[OWQ][SAVE_FAILED]")
    $openFileIdx = $logText.IndexOf("[OWQ][OPEN_FILE][home-drop]")

    if ($sampleClickIdx -lt 0) {
        $hasOwqMarkers = $logText.IndexOf("[OWQ][") -ge 0
        if (-not $hasOwqMarkers) {
            throw "Sample flow assert failed: no [OWQ] markers found in logcat. Installed APK is likely stale. Re-run with -AssembleApk 1 -InstallApk 1."
        }
        throw "Sample flow assert failed: [OWQ][SAMPLE_CLICK] not found. Tap likely missed coordinates."
    }

    $sampleLoadedIdx = if ($sampleLoadedStaticIdx -ge 0) { $sampleLoadedStaticIdx } else { $sampleLoadedGeneratedIdx }
    if ($sampleLoadedIdx -lt 0) {
        throw "Sample flow assert failed: sample load marker not found after click."
    }

    if ($workspaceLoadFailedIdx -ge 0 -and ($workspaceLoadedIdx -lt 0 -or $workspaceLoadFailedIdx -gt $workspaceLoadedIdx)) {
        throw "Sample flow assert failed: workspace load failed after sample click."
    }
    if ($workspaceLoadedIdx -lt 0) {
        throw "Sample flow assert failed: [OWQ][WORKSPACE_LOADED] not found."
    }

    if ($openFileIdx -ge 0 -and $openFileIdx -gt $sampleClickIdx) {
        throw "Sample flow assert failed: home drop open-file flow triggered after sample click."
    }

    if ($RunMaestro) {
        if ($saveStartIdx -lt 0) {
            throw "Sample flow assert failed: [OWQ][SAVE_START] not found."
        }
        if ($saveFailedIdx -ge 0 -and ($saveSuccessIdx -lt 0 -or $saveFailedIdx -gt $saveSuccessIdx)) {
            throw "Sample flow assert failed: save failed during Maestro flow."
        }
        if ($saveSuccessIdx -lt 0) {
            throw "Sample flow assert failed: [OWQ][SAVE_SUCCESS] not found."
        }
    }

    Write-Host "- Sample flow markers passed" -ForegroundColor Green
}

Step "Smoke summary"
$scriptElapsed = (Get-Date) - $scriptStartedAt
Write-Host "- App launched on $EmulatorSerial" -ForegroundColor Green
Write-Host "- Logs saved to: $outDir" -ForegroundColor Green
if ($RunMaestro) {
    Write-Host "- Maestro summary saved in: $outDir\\maestro-output.txt" -ForegroundColor Green
}
Write-Host "- Total script runtime: $(Format-Duration $scriptElapsed)" -ForegroundColor Green
Write-Host "- Share files from this folder so I can analyze failures/perf: logcat.txt, meminfo.txt, screenshot.png, window-dump.xml, maestro-output.txt" -ForegroundColor Green
