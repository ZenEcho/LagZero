[CmdletBinding()]
param(
  [ValidateSet('auto', 'system_proxy', 'tun')]
  [string]$Mode = 'auto',

  [string]$UserDataDir = '',
  [string]$AppRoot = '',
  [string]$OutDir = '',

  [int]$DurationSec = 90,
  [int]$IntervalSec = 2,
  [int]$LogTailLines = 200,

  [string]$TunInterfaceName = 'LagZero',
  [string[]]$TestHosts = @('www.gstatic.com', 'www.cloudflare.com'),

  [switch]$NoPrompt
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Section {
  param([string]$Text)
  Write-Host ''
  Write-Host "== $Text ==" -ForegroundColor Cyan
}

function Convert-ToJsonText {
  param(
    [Parameter(Mandatory = $true)][object]$InputObject,
    [int]$Depth = 12
  )

  return ($InputObject | ConvertTo-Json -Depth $Depth -Compress)
}

function Get-Utf8NoBomEncoding {
  return New-Object System.Text.UTF8Encoding($false)
}

function Write-Info {
  param([string]$Text)
  Write-Host "[INFO] $Text" -ForegroundColor Gray
}

function Write-WarnLine {
  param([string]$Text)
  Write-Host "[WARN] $Text" -ForegroundColor Yellow
}

function Resolve-FullPath {
  param([string]$Path)
  if ([string]::IsNullOrWhiteSpace($Path)) {
    return ''
  }
  return [System.IO.Path]::GetFullPath($Path)
}

function Resolve-RepoRoot {
  return [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
}

function Initialize-NetworkModules {
  foreach ($moduleName in @('NetTCPIP', 'NetAdapter')) {
    try {
      if (-not (Get-Module -Name $moduleName)) {
        Import-Module $moduleName -ErrorAction Stop | Out-Null
      }
    } catch {
      Write-WarnLine "failed to import module ${moduleName}: $($_.Exception.Message)"
    }
  }
}

function Get-ObjectPropertyValue {
  param(
    [AllowNull()][object]$InputObject,
    [string]$PropertyName,
    $DefaultValue = $null
  )

  if ($null -eq $InputObject) {
    return $DefaultValue
  }

  $prop = $InputObject.PSObject.Properties[$PropertyName]
  if ($null -eq $prop) {
    return $DefaultValue
  }

  return $prop.Value
}

function Get-LagZeroProcessCandidates {
  $items = @()

  try {
    $items += Get-CimInstance Win32_Process -Filter "Name='LagZero.exe'" -ErrorAction Stop
  } catch {
  }

  try {
    $items += Get-CimInstance Win32_Process -Filter "Name='electron.exe'" -ErrorAction Stop |
      Where-Object {
        $cmd = [string]($_.CommandLine)
        $exe = [string]($_.ExecutablePath)
        $cmd -match 'LagZero' -or $exe -match 'LagZero'
      }
  } catch {
  }

  return @($items | Where-Object { $_ } | Sort-Object ProcessId -Unique)
}

function Resolve-LagZeroUserDataDir {
  param(
    [string]$ExplicitUserDataDir,
    [string]$ExplicitAppRoot
  )

  $candidates = New-Object System.Collections.Generic.List[string]

  if ($ExplicitUserDataDir) {
    $candidates.Add((Resolve-FullPath $ExplicitUserDataDir))
  }

  if ($ExplicitAppRoot) {
    $root = Resolve-FullPath $ExplicitAppRoot
    $candidates.Add((Join-Path $root 'data'))
    $candidates.Add((Join-Path $root '.lagzero-dev'))
  }

  $repoRoot = Resolve-RepoRoot
  $candidates.Add((Join-Path $repoRoot '.lagzero-dev'))

  foreach ($proc in (Get-LagZeroProcessCandidates)) {
    $exePath = [string]$proc.ExecutablePath
    if ([string]::IsNullOrWhiteSpace($exePath)) {
      continue
    }
    $exeDir = Split-Path -Parent $exePath
    $candidates.Add((Join-Path $exeDir 'data'))
  }

  try {
    $appData = [Environment]::GetFolderPath('ApplicationData')
    foreach ($name in @('LagZero', 'lagzero')) {
      $candidates.Add((Join-Path $appData $name))
    }
  } catch {
  }

  $seen = New-Object System.Collections.Generic.HashSet[string]([System.StringComparer]::OrdinalIgnoreCase)
  foreach ($candidate in $candidates) {
    if ([string]::IsNullOrWhiteSpace($candidate)) {
      continue
    }
    $full = Resolve-FullPath $candidate
    if (-not $seen.Add($full)) {
      continue
    }
    if (Test-Path $full) {
      return $full
    }
  }

  if ($ExplicitUserDataDir) {
    return (Resolve-FullPath $ExplicitUserDataDir)
  }

  return (Join-Path $repoRoot '.lagzero-dev')
}

function Get-SystemProxyState {
  $path = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings'
  try {
    $state = Get-ItemProperty -Path $path -ErrorAction Stop
    return [pscustomobject][ordered]@{
      ok = $true
      ProxyEnable = [int](Get-ObjectPropertyValue -InputObject $state -PropertyName 'ProxyEnable' -DefaultValue 0)
      ProxyServer = [string](Get-ObjectPropertyValue -InputObject $state -PropertyName 'ProxyServer' -DefaultValue '')
      ProxyOverride = [string](Get-ObjectPropertyValue -InputObject $state -PropertyName 'ProxyOverride' -DefaultValue '')
      AutoConfigURL = [string](Get-ObjectPropertyValue -InputObject $state -PropertyName 'AutoConfigURL' -DefaultValue '')
      AutoDetect = [int](Get-ObjectPropertyValue -InputObject $state -PropertyName 'AutoDetect' -DefaultValue 0)
    }
  } catch {
    return [pscustomobject][ordered]@{
      ok = $false
      error = $_.Exception.Message
    }
  }
}

function Read-JsonFile {
  param([string]$Path)
  if (-not (Test-Path $Path)) {
    return $null
  }

  try {
    $raw = Get-Content $Path -Raw -Encoding UTF8 -ErrorAction Stop
    $convertCmd = Get-Command ConvertFrom-Json -ErrorAction Stop
    if ($convertCmd.Parameters.ContainsKey('Depth')) {
      return ($raw | ConvertFrom-Json -Depth 100)
    }
    return ($raw | ConvertFrom-Json)
  } catch {
    return $null
  }
}

function Get-ConfigSummary {
  param([object]$Config)

  if (-not $Config) {
    return [pscustomobject][ordered]@{
      exists = $false
      inferredMode = 'unknown'
      routeFinal = ''
      dnsFinal = ''
      tunInterfaceName = ''
      tunAddress = @()
      systemProxyPort = 0
      localHttpPort = 0
      localSocksPort = 0
      clashApiController = ''
      clashApiSecret = ''
      processScopedRouteRuleCount = 0
      processScopedDnsRuleCount = 0
      inboundTags = @()
    }
  }

  $inbounds = @((Get-ObjectPropertyValue -InputObject $Config -PropertyName 'inbounds' -DefaultValue @()))
  $route = Get-ObjectPropertyValue -InputObject $Config -PropertyName 'route'
  $dns = Get-ObjectPropertyValue -InputObject $Config -PropertyName 'dns'
  $experimental = Get-ObjectPropertyValue -InputObject $Config -PropertyName 'experimental'
  $routeRules = @((Get-ObjectPropertyValue -InputObject $route -PropertyName 'rules' -DefaultValue @()))
  $dnsRules = @((Get-ObjectPropertyValue -InputObject $dns -PropertyName 'rules' -DefaultValue @()))
  $tunInbound = $inbounds | Where-Object { (Get-ObjectPropertyValue -InputObject $_ -PropertyName 'tag' -DefaultValue '') -eq 'tun-in' } | Select-Object -First 1
  $systemHttpInbound = $inbounds | Where-Object { (Get-ObjectPropertyValue -InputObject $_ -PropertyName 'tag' -DefaultValue '') -eq 'system-http-in' } | Select-Object -First 1
  $localHttpInbound = $inbounds | Where-Object { (Get-ObjectPropertyValue -InputObject $_ -PropertyName 'tag' -DefaultValue '') -eq 'http-in' } | Select-Object -First 1
  $localSocksInbound = $inbounds | Where-Object { (Get-ObjectPropertyValue -InputObject $_ -PropertyName 'tag' -DefaultValue '') -eq 'socks-in' } | Select-Object -First 1
  $clashApi = Get-ObjectPropertyValue -InputObject $experimental -PropertyName 'clash_api'

  $mode = 'unknown'
  if ($systemHttpInbound) {
    $mode = 'system_proxy'
  } elseif ($tunInbound) {
    $mode = 'tun'
  }

  return [pscustomobject][ordered]@{
    exists = $true
    inferredMode = $mode
    routeFinal = [string](Get-ObjectPropertyValue -InputObject $route -PropertyName 'final' -DefaultValue '')
    dnsFinal = [string](Get-ObjectPropertyValue -InputObject $dns -PropertyName 'final' -DefaultValue '')
    tunInterfaceName = [string](Get-ObjectPropertyValue -InputObject $tunInbound -PropertyName 'interface_name' -DefaultValue '')
    tunAddress = @((Get-ObjectPropertyValue -InputObject $tunInbound -PropertyName 'address' -DefaultValue @()))
    systemProxyPort = if ($systemHttpInbound) { [int](Get-ObjectPropertyValue -InputObject $systemHttpInbound -PropertyName 'listen_port' -DefaultValue 0) } else { 0 }
    localHttpPort = if ($localHttpInbound) { [int](Get-ObjectPropertyValue -InputObject $localHttpInbound -PropertyName 'listen_port' -DefaultValue 0) } else { 0 }
    localSocksPort = if ($localSocksInbound) { [int](Get-ObjectPropertyValue -InputObject $localSocksInbound -PropertyName 'listen_port' -DefaultValue 0) } else { 0 }
    clashApiController = [string](Get-ObjectPropertyValue -InputObject $clashApi -PropertyName 'external_controller' -DefaultValue '')
    clashApiSecret = [string](Get-ObjectPropertyValue -InputObject $clashApi -PropertyName 'secret' -DefaultValue '')
    processScopedRouteRuleCount = @($routeRules | Where-Object { $null -ne (Get-ObjectPropertyValue -InputObject $_ -PropertyName 'process_name') }).Count
    processScopedDnsRuleCount = @($dnsRules | Where-Object { $null -ne (Get-ObjectPropertyValue -InputObject $_ -PropertyName 'process_name') }).Count
    inboundTags = @($inbounds | ForEach-Object { [string](Get-ObjectPropertyValue -InputObject $_ -PropertyName 'tag' -DefaultValue '') })
  }
}

function Get-ListeningPortState {
  param([int[]]$Ports)

  $results = @()
  foreach ($port in @($Ports | Where-Object { $_ -gt 0 } | Sort-Object -Unique)) {
    $entry = [ordered]@{
      port = $port
      listening = $false
      pid = $null
      processName = ''
    }

    try {
      $conn = Get-NetTCPConnection -State Listen -LocalAddress 127.0.0.1 -LocalPort $port -ErrorAction Stop |
        Select-Object -First 1
      if ($conn) {
        $entry.listening = $true
        $entry.pid = [int]$conn.OwningProcess
        try {
          $proc = Get-Process -Id $entry.pid -ErrorAction Stop
          $entry.processName = [string]$proc.ProcessName
        } catch {
        }
      }
    } catch {
      try {
        $conn = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction Stop | Select-Object -First 1
        if ($conn) {
          $entry.listening = $true
          $entry.pid = [int]$conn.OwningProcess
          try {
            $proc = Get-Process -Id $entry.pid -ErrorAction Stop
            $entry.processName = [string]$proc.ProcessName
          } catch {
          }
        }
      } catch {
      }
    }

    $results += [pscustomobject]$entry
  }

  return $results
}

function Test-HttpProxyConnect {
  param(
    [int]$ProxyPort,
    [string]$TargetHost,
    [int]$TargetPort = 443,
    [int]$TimeoutMs = 5000
  )

  $result = [ordered]@{
    ok = $false
    proxyPort = $ProxyPort
    target = "${TargetHost}:${TargetPort}"
    statusLine = ''
    error = ''
  }

  if ($ProxyPort -le 0) {
    $result.error = 'invalid-proxy-port'
    return [pscustomobject]$result
  }

  $client = $null
  $stream = $null
  try {
    $client = New-Object System.Net.Sockets.TcpClient
    $async = $client.BeginConnect('127.0.0.1', $ProxyPort, $null, $null)
    if (-not $async.AsyncWaitHandle.WaitOne($TimeoutMs)) {
      throw "connect-timeout"
    }
    $client.EndConnect($async)
    $client.ReceiveTimeout = $TimeoutMs
    $client.SendTimeout = $TimeoutMs
    $stream = $client.GetStream()

    $request = "CONNECT ${TargetHost}:${TargetPort} HTTP/1.1`r`nHost: ${TargetHost}:${TargetPort}`r`nProxy-Connection: Keep-Alive`r`n`r`n"
    $bytes = [System.Text.Encoding]::ASCII.GetBytes($request)
    $stream.Write($bytes, 0, $bytes.Length)
    $stream.Flush()

    $buffer = New-Object byte[] 4096
    $builder = New-Object System.Text.StringBuilder
    while ($builder.ToString().IndexOf("`r`n`r`n", [System.StringComparison]::Ordinal) -lt 0) {
      $read = $stream.Read($buffer, 0, $buffer.Length)
      if ($read -le 0) {
        break
      }
      [void]$builder.Append([System.Text.Encoding]::ASCII.GetString($buffer, 0, $read))
      if ($builder.Length -gt 8192) {
        break
      }
    }

    $response = $builder.ToString()
    $statusLine = ($response -split "`r`n")[0].Trim()
    $result.statusLine = $statusLine
    $result.ok = $statusLine -match '^HTTP/1\.[01]\s+200\b'
    if (-not $result.ok -and -not $result.error) {
      $result.error = 'connect-not-200'
    }
  } catch {
    $result.error = $_.Exception.Message
  } finally {
    if ($stream) {
      $stream.Dispose()
    }
    if ($client) {
      $client.Dispose()
    }
  }

  return [pscustomobject]$result
}

function New-ProxyCheckFailure {
  param(
    [int]$ProxyPort,
    [string]$TargetHost,
    [int]$TargetPort = 443,
    [string]$Error = 'proxy-port-not-listening'
  )

  return [pscustomobject][ordered]@{
    ok = $false
    proxyPort = $ProxyPort
    target = "${TargetHost}:${TargetPort}"
    statusLine = ''
    error = $Error
  }
}

function Get-TunAdapterState {
  param([string]$ExpectedName)

  $items = @()
  try {
    $items = Get-NetAdapter -ErrorAction Stop | Where-Object {
      $name = [string]$_.Name
      $desc = [string]$_.InterfaceDescription
      $name -like "*$ExpectedName*" -or
      $desc -match 'Wintun|TUN|sing-box|LagZero'
    }
  } catch {
    return @()
  }

  $result = @()
  foreach ($item in $items) {
    $entry = [ordered]@{
      name = [string]$item.Name
      interfaceDescription = [string]$item.InterfaceDescription
      status = [string]$item.Status
      macAddress = [string]$item.MacAddress
      linkSpeed = [string]$item.LinkSpeed
      interfaceIndex = [int]$item.ifIndex
      ipv4 = @()
    }

    try {
      $ipv4 = Get-NetIPAddress -InterfaceIndex $item.ifIndex -AddressFamily IPv4 -ErrorAction Stop |
        Select-Object -ExpandProperty IPAddress
      $entry.ipv4 = @($ipv4)
    } catch {
    }

    $result += [pscustomobject]$entry
  }

  return $result
}

function Get-ProcessState {
  $targets = @('LagZero', 'sing-box', 'sing_box', 'electron')
  $result = @()
  foreach ($name in $targets) {
    try {
      $items = Get-Process -Name $name -ErrorAction Stop
      foreach ($item in $items) {
        $result += [pscustomobject]@{
          name = [string]$item.ProcessName
          pid = [int]$item.Id
          hasMainWindow = ($item.MainWindowHandle -ne 0)
          path = [string]$item.Path
        }
      }
    } catch {
    }
  }
  return @($result | Sort-Object name, pid -Unique)
}

function Get-ClashApiState {
  param([object]$ConfigSummary)

  $controller = [string]$ConfigSummary.clashApiController
  if ([string]::IsNullOrWhiteSpace($controller)) {
    return [pscustomobject][ordered]@{
      ok = $false
      error = 'missing-controller'
    }
  }

  $uri = if ($controller -match '^https?://') { "$controller/connections" } else { "http://$controller/connections" }
  $headers = @{}
  $secret = [string]$ConfigSummary.clashApiSecret
  if ($secret) {
    $headers['Authorization'] = "Bearer $secret"
  }

  $targetUri = [Uri]$uri
  $client = $null
  $stream = $null
  try {
    $client = New-Object System.Net.Sockets.TcpClient
    $async = $client.BeginConnect($targetUri.Host, $targetUri.Port, $null, $null)
    if (-not $async.AsyncWaitHandle.WaitOne(2000)) {
      throw 'connect-timeout'
    }
    $client.EndConnect($async)
    $client.ReceiveTimeout = 2000
    $client.SendTimeout = 2000
    $stream = $client.GetStream()

    $headerLines = @(
      "GET $($targetUri.PathAndQuery) HTTP/1.1",
      "Host: $($targetUri.Authority)",
      'Connection: close'
    )
    foreach ($entry in $headers.GetEnumerator()) {
      $headerLines += ("{0}: {1}" -f [string]$entry.Key, [string]$entry.Value)
    }
    $requestText = ($headerLines + '', '') -join "`r`n"
    $requestBytes = [System.Text.Encoding]::ASCII.GetBytes($requestText)
    $stream.Write($requestBytes, 0, $requestBytes.Length)
    $stream.Flush()

    $buffer = New-Object byte[] 32768
    $builder = New-Object System.Text.StringBuilder
    while ($true) {
      $read = $stream.Read($buffer, 0, $buffer.Length)
      if ($read -le 0) {
        break
      }
      [void]$builder.Append([System.Text.Encoding]::UTF8.GetString($buffer, 0, $read))
      if ($builder.Length -ge 1048576) {
        break
      }
    }

    $rawResponse = $builder.ToString()
    $parts = $rawResponse -split "`r`n`r`n", 2
    $statusLine = (($parts[0] -split "`r`n")[0]).Trim()
    if ($statusLine -notmatch '^HTTP/1\.[01]\s+2\d\d\b') {
      throw ("unexpected-status: " + $statusLine)
    }

    $body = if ($parts.Count -ge 2) { $parts[1] } else { '' }
    $payload = if ((Get-Command ConvertFrom-Json).Parameters.ContainsKey('Depth')) {
      $body | ConvertFrom-Json -Depth 100
    } else {
      $body | ConvertFrom-Json
    }

    return [pscustomobject][ordered]@{
      ok = $true
      uploadTotal = [double](Get-ObjectPropertyValue -InputObject $payload -PropertyName 'uploadTotal' -DefaultValue 0)
      downloadTotal = [double](Get-ObjectPropertyValue -InputObject $payload -PropertyName 'downloadTotal' -DefaultValue 0)
      memory = [double](Get-ObjectPropertyValue -InputObject $payload -PropertyName 'memory' -DefaultValue 0)
      connectionCount = @((Get-ObjectPropertyValue -InputObject $payload -PropertyName 'connections' -DefaultValue @())).Count
    }
  } catch {
    return [pscustomobject][ordered]@{
      ok = $false
      error = $_.Exception.Message
    }
  } finally {
    if ($stream) {
      $stream.Dispose()
    }
    if ($client) {
      $client.Dispose()
    }
  }
}

function Get-LatestLogFile {
  param([string]$LogDir)
  if (-not (Test-Path $LogDir)) {
    return ''
  }

  $file = Get-ChildItem -Path $LogDir -File -Filter *.log -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTimeUtc -Descending |
    Select-Object -First 1
  if (-not $file) {
    return ''
  }
  return $file.FullName
}

function Get-RelevantLogLines {
  param(
    [string]$LogFile,
    [int]$TailLines
  )

  if ([string]::IsNullOrWhiteSpace($LogFile) -or -not (Test-Path $LogFile)) {
    return @()
  }

  $patterns = @(
    'SystemProxy',
    'LocalProxy',
    'SingBox',
    'GeoBypass',
    'proxy',
    'tun',
    'error',
    'fail'
  )

  $tail = Get-Content -Path $LogFile -Tail $TailLines -Encoding UTF8 -ErrorAction SilentlyContinue
  if (-not $tail) {
    return @()
  }

  return @(
    $tail | Where-Object {
      $line = [string]$_
      foreach ($pattern in $patterns) {
        if ($line -match [Regex]::Escape($pattern)) {
          return $true
        }
      }
      return $false
    }
  )
}

function New-Snapshot {
  param(
    [string]$UserDataDirPath,
    [string]$RequestedMode,
    [string]$TunName,
    [string[]]$Hosts,
    [int]$TailLines
  )

  $configPath = Join-Path $UserDataDirPath 'config.json'
  $logDir = Join-Path $UserDataDirPath 'logs'
  Write-Verbose "snapshot: read config from $configPath"
  $config = Read-JsonFile -Path $configPath
  $configSummary = Get-ConfigSummary -Config $config

  $effectiveTunName = if ($configSummary.tunInterfaceName) { [string]$configSummary.tunInterfaceName } else { $TunName }
  $ports = @($configSummary.systemProxyPort, $configSummary.localHttpPort, $configSummary.localSocksPort)
  Write-Verbose "snapshot: collect process state"
  $processState = Get-ProcessState
  Write-Verbose "snapshot: read system proxy state"
  $systemProxyState = Get-SystemProxyState
  Write-Verbose "snapshot: check listening ports"
  $listenState = Get-ListeningPortState -Ports $ports

  $proxyChecks = @()
  $proxyPort = if ($configSummary.systemProxyPort -gt 0) { [int]$configSummary.systemProxyPort } else { [int]$configSummary.localHttpPort }
  if ($proxyPort -gt 0) {
    $proxyPortState = $listenState | Where-Object { $_.port -eq $proxyPort } | Select-Object -First 1
    if ($proxyPortState -and $proxyPortState.listening) {
      Write-Verbose "snapshot: run proxy CONNECT checks on port $proxyPort"
      foreach ($targetHostName in $Hosts) {
        $proxyChecks += Test-HttpProxyConnect -ProxyPort $proxyPort -TargetHost $targetHostName
      }
    } else {
      Write-Verbose "snapshot: skip proxy CONNECT checks because port $proxyPort is not listening"
      foreach ($targetHostName in $Hosts) {
        $proxyChecks += New-ProxyCheckFailure -ProxyPort $proxyPort -TargetHost $targetHostName
      }
    }
  }

  Write-Verbose "snapshot: inspect latest log file under $logDir"
  $latestLogFile = Get-LatestLogFile -LogDir $logDir
  $logLines = Get-RelevantLogLines -LogFile $latestLogFile -TailLines $TailLines
  Write-Verbose "snapshot: inspect tun adapters"
  $tunAdapters = Get-TunAdapterState -ExpectedName $effectiveTunName
  Write-Verbose "snapshot: inspect clash api"
  $clashApi = Get-ClashApiState -ConfigSummary $configSummary

  $snapshot = [ordered]@{
    timestamp = (Get-Date).ToString('o')
    requestedMode = $RequestedMode
    userDataDir = $UserDataDirPath
    configPath = $configPath
    logDir = $logDir
    latestLogFile = $latestLogFile
    processState = $processState
    systemProxyState = $systemProxyState
    configSummary = $configSummary
    listeningPorts = $listenState
    proxyChecks = $proxyChecks
    tunAdapters = $tunAdapters
    clashApi = $clashApi
    relevantLogLines = $logLines
  }

  return [pscustomobject]$snapshot
}

function Get-SnapshotWarnings {
  param([pscustomobject]$Snapshot)

  $warnings = New-Object System.Collections.Generic.List[string]
  $config = $Snapshot.configSummary
  $proxyState = $Snapshot.systemProxyState
  $tunAdapters = @($Snapshot.tunAdapters)
  $proxyChecks = @($Snapshot.proxyChecks)
  $listenState = @($Snapshot.listeningPorts)
  $processState = @($Snapshot.processState)
  $mode = if ($Mode -eq 'auto' -and $config.exists) { [string]$config.inferredMode } else { $Mode }

  if (@($processState | Where-Object { $_.name -eq 'sing-box' }).Count -eq 0) {
    $warnings.Add('sing-box process is not running')
  }

  if (-not $config.exists) {
    $warnings.Add('config.json was not found')
    return $warnings
  }

  if ($mode -eq 'system_proxy' -or $config.inferredMode -eq 'system_proxy') {
    $expectedServer = if ($config.systemProxyPort -gt 0) { "127.0.0.1:$($config.systemProxyPort)" } else { '' }
    if (-not $proxyState.ok) {
      $warnings.Add('failed to read Windows system proxy registry state')
    } elseif ([int]$proxyState.ProxyEnable -ne 1) {
      $warnings.Add('Windows system proxy is disabled')
    } elseif ($expectedServer -and [string]$proxyState.ProxyServer -ne $expectedServer) {
      $warnings.Add("Windows system proxy server mismatch: expected $expectedServer, got $($proxyState.ProxyServer)")
    }

    $portEntry = $listenState | Where-Object { $_.port -eq $config.systemProxyPort } | Select-Object -First 1
    if ($config.systemProxyPort -gt 0 -and (-not $portEntry -or -not $portEntry.listening)) {
      $warnings.Add("system proxy port $($config.systemProxyPort) is not listening")
    }

    if ($proxyChecks.Count -gt 0 -and @($proxyChecks | Where-Object { -not $_.ok }).Count -gt 0) {
      $warnings.Add('local HTTP proxy CONNECT checks contain failures')
    }
  }

  if ($mode -eq 'tun' -or $config.inferredMode -eq 'tun') {
    $expectedTunName = if ([string]::IsNullOrWhiteSpace([string]$config.tunInterfaceName)) {
      $TunInterfaceName
    } else {
      [string]$config.tunInterfaceName
    }
    if ($tunAdapters.Count -eq 0) {
      $warnings.Add("no TUN adapter matched interface name '$expectedTunName'")
    } elseif (@($tunAdapters | Where-Object { $_.status -eq 'Up' }).Count -eq 0) {
      $warnings.Add('matched TUN adapter exists but none is Up')
    }
  }

  if ($Snapshot.clashApi.ok -eq $false) {
    $warnings.Add("clash api unavailable: $($Snapshot.clashApi.error)")
  }

  return $warnings
}

function Write-SnapshotLine {
  param([pscustomobject]$Snapshot)

  $time = (Get-Date $Snapshot.timestamp).ToString('HH:mm:ss')
  $config = $Snapshot.configSummary
  $proxyState = $Snapshot.systemProxyState
  $clash = $Snapshot.clashApi
  $proxyOk = if (@($Snapshot.proxyChecks).Count -gt 0) {
    if (@($Snapshot.proxyChecks | Where-Object { $_.ok }).Count -eq @($Snapshot.proxyChecks).Count) { 'ok' } else { 'fail' }
  } else {
    '-'
  }
  $tunUp = if (@($Snapshot.tunAdapters | Where-Object { $_.status -eq 'Up' }).Count -gt 0) { 'up' } else { '-' }
  $proxyEnabled = if ($proxyState.ok) { [string]$proxyState.ProxyEnable } else { 'err' }
  $clashConn = if ($clash.ok) { [string]$clash.connectionCount } else { 'err' }

  Write-Host ("[{0}] mode={1} singbox={2} proxyEnable={3} proxyCheck={4} tun={5} clashConn={6}" -f `
      $time, `
      $config.inferredMode, `
      (@($Snapshot.processState | Where-Object { $_.name -eq 'sing-box' }).Count -gt 0), `
      $proxyEnabled, `
      $proxyOk, `
      $tunUp, `
      $clashConn)
}

function Convert-SnapshotToPersistedRecord {
  param([pscustomobject]$Snapshot)

  $config = $Snapshot.configSummary
  $proxy = $Snapshot.systemProxyState
  $clash = $Snapshot.clashApi

  return [ordered]@{
    timestamp = [string]$Snapshot.timestamp
    requestedMode = [string]$Snapshot.requestedMode
    userDataDir = [string]$Snapshot.userDataDir
    configPath = [string]$Snapshot.configPath
    latestLogFile = [string]$Snapshot.latestLogFile
    configSummary = [ordered]@{
      exists = [bool]$config.exists
      inferredMode = [string]$config.inferredMode
      routeFinal = [string]$config.routeFinal
      dnsFinal = [string]$config.dnsFinal
      tunInterfaceName = [string]$config.tunInterfaceName
      tunAddress = @($config.tunAddress | ForEach-Object { [string]$_ })
      systemProxyPort = [int]$config.systemProxyPort
      localHttpPort = [int]$config.localHttpPort
      localSocksPort = [int]$config.localSocksPort
      clashApiController = [string]$config.clashApiController
      processScopedRouteRuleCount = [int]$config.processScopedRouteRuleCount
      processScopedDnsRuleCount = [int]$config.processScopedDnsRuleCount
      inboundTags = @($config.inboundTags | ForEach-Object { [string]$_ })
    }
    systemProxyState = [ordered]@{
      ok = [bool]$proxy.ok
      ProxyEnable = if ($proxy.ok) { [int]$proxy.ProxyEnable } else { $null }
      ProxyServer = [string](Get-ObjectPropertyValue -InputObject $proxy -PropertyName 'ProxyServer' -DefaultValue '')
      ProxyOverride = [string](Get-ObjectPropertyValue -InputObject $proxy -PropertyName 'ProxyOverride' -DefaultValue '')
      AutoConfigURL = [string](Get-ObjectPropertyValue -InputObject $proxy -PropertyName 'AutoConfigURL' -DefaultValue '')
      AutoDetect = if ($proxy.ok) { [int](Get-ObjectPropertyValue -InputObject $proxy -PropertyName 'AutoDetect' -DefaultValue 0) } else { $null }
      error = [string](Get-ObjectPropertyValue -InputObject $proxy -PropertyName 'error' -DefaultValue '')
    }
    processState = @($Snapshot.processState | ForEach-Object {
        [ordered]@{
          name = [string]$_.name
          pid = [int]$_.pid
          hasMainWindow = [bool]$_.hasMainWindow
          path = [string]$_.path
        }
      })
    listeningPorts = @($Snapshot.listeningPorts | ForEach-Object {
        [ordered]@{
          port = [int]$_.port
          listening = [bool]$_.listening
          pid = if ($null -ne $_.pid) { [int]$_.pid } else { $null }
          processName = [string]$_.processName
        }
      })
    proxyChecks = @($Snapshot.proxyChecks | ForEach-Object {
        [ordered]@{
          ok = [bool]$_.ok
          proxyPort = [int]$_.proxyPort
          target = [string]$_.target
          statusLine = [string]$_.statusLine
          error = [string]$_.error
        }
      })
    tunAdapters = @($Snapshot.tunAdapters | ForEach-Object {
        [ordered]@{
          name = [string]$_.name
          interfaceDescription = [string]$_.interfaceDescription
          status = [string]$_.status
          macAddress = [string]$_.macAddress
          linkSpeed = [string]$_.linkSpeed
          interfaceIndex = [int]$_.interfaceIndex
          ipv4 = @($_.ipv4 | ForEach-Object { [string]$_ })
        }
      })
    clashApi = [ordered]@{
      ok = [bool]$clash.ok
      uploadTotal = if ($clash.ok) { [double]$clash.uploadTotal } else { 0 }
      downloadTotal = if ($clash.ok) { [double]$clash.downloadTotal } else { 0 }
      memory = if ($clash.ok) { [double]$clash.memory } else { 0 }
      connectionCount = if ($clash.ok) { [int]$clash.connectionCount } else { 0 }
      error = [string](Get-ObjectPropertyValue -InputObject $clash -PropertyName 'error' -DefaultValue '')
    }
    relevantLogLineCount = @($Snapshot.relevantLogLines).Count
  }
}

function Append-JsonLine {
  param(
    [string]$Path,
    [pscustomobject]$Snapshot
  )

  $record = Convert-SnapshotToPersistedRecord -Snapshot $Snapshot
  $jsonLine = (Convert-ToJsonText -InputObject $record -Depth 10) + [Environment]::NewLine
  [System.IO.File]::AppendAllText($Path, $jsonLine, (Get-Utf8NoBomEncoding))
}

function Build-ReportMarkdown {
  param(
    [string]$SessionName,
    [string]$RequestedMode,
    [string]$UserDataDirPath,
    [string]$JsonlPath,
    [string]$LogTailPath,
    [object[]]$Snapshots
  )

  $latest = $Snapshots[-1]
  $warnings = Get-SnapshotWarnings -Snapshot $latest
  $timeline = @()
  foreach ($snapshot in $Snapshots) {
    $proxyChecks = @($snapshot.proxyChecks)
    $proxySummary = if ($proxyChecks.Count -eq 0) {
      '-'
    } elseif (@($proxyChecks | Where-Object { $_.ok }).Count -eq $proxyChecks.Count) {
      'ok'
    } else {
      'fail'
    }
    $timelineProxyEnable = if ($snapshot.systemProxyState.ok) {
      [string]$snapshot.systemProxyState.ProxyEnable
    } else {
      'err'
    }
    $timelineTun = if (@($snapshot.tunAdapters | Where-Object { $_.status -eq 'Up' }).Count -gt 0) {
      'up'
    } else {
      '-'
    }

    $timeline += "| {0} | {1} | {2} | {3} | {4} | {5} |" -f `
      (Get-Date $snapshot.timestamp).ToString('HH:mm:ss'), `
      $snapshot.configSummary.inferredMode, `
      (@($snapshot.processState | Where-Object { $_.name -eq 'sing-box' }).Count -gt 0), `
      $timelineProxyEnable, `
      $proxySummary, `
      $timelineTun
  }

  $latestProxyChecks = @($latest.proxyChecks | ForEach-Object {
    "- $($_.target): ok=$($_.ok) status=$($_.statusLine) error=$($_.error)"
  })
  $latestTun = @($latest.tunAdapters | ForEach-Object {
    "- $($_.name): status=$($_.status) ipv4=$(([string]::Join(',', @($_.ipv4)))) desc=$($_.interfaceDescription)"
  })
  $latestListen = @($latest.listeningPorts | ForEach-Object {
    "- port=$($_.port) listening=$($_.listening) pid=$($_.pid) process=$($_.processName)"
  })
  if ($latestProxyChecks.Count -eq 0) {
    $latestProxyChecks = @('- none')
  }
  if ($latestTun.Count -eq 0) {
    $latestTun = @('- none')
  }
  if ($latestListen.Count -eq 0) {
    $latestListen = @('- none')
  }

  $warningLines = if ($warnings.Count -gt 0) {
    $warnings | ForEach-Object { "- $_" }
  } else {
    @('- none')
  }

  $recentLogLines = if (@($latest.relevantLogLines).Count -gt 0) {
    @($latest.relevantLogLines | Select-Object -Last 60 | ForEach-Object { "- $_" })
  } else {
    @('- none')
  }

  return @(
    "# LagZero accel repro report",
    "",
    "- Session: $SessionName",
    "- Requested mode: $RequestedMode",
    "- User data dir: $UserDataDirPath",
    "- Snapshot file: $JsonlPath",
    "- Log tail file: $LogTailPath",
    "- Snapshot count: $($Snapshots.Count)",
    "",
    "## Latest summary",
    "",
    "- Inferred mode: $($latest.configSummary.inferredMode)",
    "- Config exists: $($latest.configSummary.exists)",
    "- route.final: $($latest.configSummary.routeFinal)",
    "- dns.final: $($latest.configSummary.dnsFinal)",
    "- system proxy port: $($latest.configSummary.systemProxyPort)",
    "- local http port: $($latest.configSummary.localHttpPort)",
    "- tun interface: $($latest.configSummary.tunInterfaceName)",
    "- clash api ok: $($latest.clashApi.ok)",
    "- clash connections: $(if ($latest.clashApi.ok) { $latest.clashApi.connectionCount } else { 'n/a' })",
    "",
    "## Warnings",
    ""
  ) + $warningLines + @(
    "",
    "## Listening ports",
    ""
  ) + $latestListen + @(
    "",
    "## Proxy checks",
    ""
  ) + $latestProxyChecks + @(
    "",
    "## TUN adapters",
    ""
  ) + $latestTun + @(
    "",
    "## Recent relevant log lines",
    ""
  ) + $recentLogLines + @(
    "",
    "## Timeline",
    "",
    "| Time | Mode | sing-box | ProxyEnable | ProxyCheck | TUN |",
    "| --- | --- | --- | --- | --- | --- |"
  ) + $timeline + @(
    ""
  )
}

$DurationSec = [Math]::Max(5, $DurationSec)
$IntervalSec = [Math]::Max(1, $IntervalSec)
$resolvedUserDataDir = Resolve-LagZeroUserDataDir -ExplicitUserDataDir $UserDataDir -ExplicitAppRoot $AppRoot

if ([string]::IsNullOrWhiteSpace($OutDir)) {
  $OutDir = Join-Path (Resolve-RepoRoot) 'repro-output'
}
$OutDir = Resolve-FullPath $OutDir

$sessionName = 'lagzero-repro-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
$sessionDir = Join-Path $OutDir $sessionName
$jsonlPath = Join-Path $sessionDir 'snapshots.jsonl'
$reportPath = Join-Path $sessionDir 'report.md'
$logTailPath = Join-Path $sessionDir 'relevant-log-tail.txt'

New-Item -ItemType Directory -Path $sessionDir -Force | Out-Null

Write-Section 'LagZero accel repro'
Write-Info "Requested mode: $Mode"
Write-Info "Resolved userData dir: $resolvedUserDataDir"
Write-Info "Output dir: $sessionDir"
Initialize-NetworkModules

$baseline = New-Snapshot -UserDataDirPath $resolvedUserDataDir -RequestedMode $Mode -TunName $TunInterfaceName -Hosts $TestHosts -TailLines $LogTailLines
Write-Verbose 'baseline: snapshot collected'
$snapshots = New-Object System.Collections.Generic.List[object]
$snapshots.Add($baseline)
Append-JsonLine -Path $jsonlPath -Snapshot $baseline
Write-Verbose 'baseline: snapshot persisted'

Write-Section 'Baseline'
Write-SnapshotLine -Snapshot $baseline
$baselineWarnings = Get-SnapshotWarnings -Snapshot $baseline
foreach ($item in $baselineWarnings) {
  Write-WarnLine $item
}

if (-not $NoPrompt) {
  Write-Host ''
  Write-Host '1. Open LagZero on the target machine.' -ForegroundColor Green
  Write-Host '2. Switch to the mode you want to reproduce.' -ForegroundColor Green
  Write-Host '3. Start acceleration, then generate real traffic in the game/app.' -ForegroundColor Green
  [void](Read-Host 'Press Enter when ready to start timed sampling')
}

$startedAt = Get-Date
$rounds = [Math]::Ceiling($DurationSec / $IntervalSec)
for ($i = 1; $i -le $rounds; $i += 1) {
  $snapshot = New-Snapshot -UserDataDirPath $resolvedUserDataDir -RequestedMode $Mode -TunName $TunInterfaceName -Hosts $TestHosts -TailLines $LogTailLines
  Write-Verbose ("loop: snapshot {0}/{1} collected" -f $i, $rounds)
  $snapshots.Add($snapshot)
  Append-JsonLine -Path $jsonlPath -Snapshot $snapshot
  Write-Verbose ("loop: snapshot {0}/{1} persisted" -f $i, $rounds)
  Write-SnapshotLine -Snapshot $snapshot

  if ($i -lt $rounds) {
    Start-Sleep -Seconds $IntervalSec
  }
}

$latestSnapshot = $snapshots[$snapshots.Count - 1]
@($latestSnapshot.relevantLogLines) | Set-Content -Path $logTailPath -Encoding UTF8

$report = Build-ReportMarkdown `
  -SessionName $sessionName `
  -RequestedMode $Mode `
  -UserDataDirPath $resolvedUserDataDir `
  -JsonlPath $jsonlPath `
  -LogTailPath $logTailPath `
  -Snapshots ($snapshots.ToArray())

$report | Set-Content -Path $reportPath -Encoding UTF8

Write-Section 'Done'
Write-Info "Started at: $($startedAt.ToString('yyyy-MM-dd HH:mm:ss'))"
Write-Info "Finished at: $((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))"
Write-Info "Report: $reportPath"
Write-Info "Snapshots: $jsonlPath"
Write-Info "Relevant log tail: $logTailPath"
