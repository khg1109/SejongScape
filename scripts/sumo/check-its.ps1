param(
    [double]$MinX = 127.252,
    [double]$MaxX = 127.286,
    [double]$MinY = 36.489,
    [double]$MaxY = 36.513
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$cacheDirectory = Join-Path $projectRoot 'scripts/.cache'
$secretPath = Join-Path $cacheDirectory 'its-secrets.json'
if (-not (Test-Path -LiteralPath $secretPath)) { throw 'Missing ignored scripts/.cache/its-secrets.json' }
if ($MinX -ge $MaxX -or $MinY -ge $MaxY) { throw 'Invalid bounding box' }
$credential = Get-Content -LiteralPath $secretPath -Raw | ConvertFrom-Json
if (-not $credential.apiKey) { throw 'ITS API key is missing' }
$culture = [Globalization.CultureInfo]::InvariantCulture
$query = 'apiKey=' + [Uri]::EscapeDataString($credential.apiKey) + '&type=all&getType=json' +
    '&minX=' + $MinX.ToString($culture) + '&maxX=' + $MaxX.ToString($culture) +
    '&minY=' + $MinY.ToString($culture) + '&maxY=' + $MaxY.ToString($culture)
try {
    # Fixed official endpoint prevents a local configuration from sending the key elsewhere.
    $response = Invoke-WebRequest -Uri ('https://openapi.its.go.kr:9443/trafficInfo?' + $query) -UseBasicParsing -TimeoutSec 45
    $payload = $response.Content | ConvertFrom-Json
    if ($null -eq $payload.header.resultCode -or [string]$payload.header.resultCode -ne '0') {
        throw 'ITS API did not return a success result'
    }
    $items = @($payload.body.items)
    if ($items.Count -ne [int]$payload.body.totalCount) { throw 'ITS response count mismatch' }
    $response.Content | Set-Content -LiteralPath (Join-Path $cacheDirectory 'its-sejong-pilot-response.json') -Encoding UTF8
    $summary = [ordered]@{
        checkedAt = (Get-Date).ToUniversalTime().ToString('o')
        boundingBox = @($MinX, $MinY, $MaxX, $MaxY)
        totalCount = $items.Count
        uniqueLinks = @($items.linkId | Sort-Object -Unique).Count
        roadNameValues = @($items.roadName | Sort-Object -Unique).Count
        observationTimes = @($items.createdDate | Sort-Object -Unique)
        zeroSpeedCount = @($items | Where-Object { [double]$_.speed -eq 0 }).Count
        geographicMatchingVerified = $false
    }
    $summary | ConvertTo-Json -Depth 4 | Tee-Object -FilePath (Join-Path $cacheDirectory 'its-sejong-check.json')
} catch {
    # Never print request URLs or exception details that may contain the key.
    throw 'ITS check failed. Inspect connectivity, API approval and quota; credentials were not printed.'
}
