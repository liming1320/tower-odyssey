param(
    [string]$OutputDirectory = 'output\pk32-reference\runtime-catalog-captures',
    [int]$FromCatalog = 1,
    [int]$ToCatalog = 213,
    [int]$GameWaitMs = 1200,
    [int]$MaxDeltaMiB = 64,
    [switch]$Run,
    [switch]$AllowDesktopInput
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot

if ($FromCatalog -lt 1 -or $ToCatalog -gt 213 -or $ToCatalog -lt $FromCatalog) { throw 'Catalog range must be within 1..213.' }
if (-not $Run) {
    Write-Output 'Dry run only. Pass -Run -AllowDesktopInput to capture the mapped PK32 catalog range.'
    exit 0
}
if (-not $AllowDesktopInput) { throw 'This collector uses verified mouse coordinates. Pass -AllowDesktopInput only while the desktop is free.' }

$pagePlans = @(
    [PSCustomObject]@{ page = 1; firstCatalog = 1; lastCatalog = 66; firstSlot = 2; slotOffset = -1 },
    [PSCustomObject]@{ page = 2; firstCatalog = 67; lastCatalog = 82; firstSlot = 1; slotOffset = 66 },
    [PSCustomObject]@{ page = 3; firstCatalog = 83; lastCatalog = 147; firstSlot = 1; slotOffset = 82 },
    [PSCustomObject]@{ page = 4; firstCatalog = 148; lastCatalog = 211; firstSlot = 2; slotOffset = 146 },
    [PSCustomObject]@{ page = 5; firstCatalog = 212; lastCatalog = 213; firstSlot = 1; slotOffset = 211 }
)

$batchScript = Join-Path $PSScriptRoot 'capture-pk32-mouse-batch.ps1'
if (-not (Test-Path -LiteralPath $batchScript)) { throw "Mouse batch script not found: $batchScript" }
$runs = @()
foreach ($plan in $pagePlans) {
    $first = [Math]::Max($FromCatalog, $plan.firstCatalog)
    $last = [Math]::Min($ToCatalog, $plan.lastCatalog)
    if ($first -gt $last) { continue }
    $fromSlot = $plan.firstSlot + ($first - $plan.firstCatalog)
    $toSlot = $plan.firstSlot + ($last - $plan.firstCatalog)
    $startedAt = [DateTime]::UtcNow.ToString('o')
    & $batchScript -Run -AllowDesktopInput -CaptureRuntimeDelta -PageNumber $plan.page -From $fromSlot -To $toSlot -PositionOffset $plan.slotOffset -OutputDirectory $OutputDirectory -GameWaitMs $GameWaitMs -MaxDeltaMiB $MaxDeltaMiB
    if (-not $?) { throw "Page $($plan.page) capture failed for catalog range $first..$last." }
    $runs += [ordered]@{ page = $plan.page; catalogRange = "$first..$last"; slotRange = "$fromSlot..$toSlot"; startedAt = $startedAt; finishedAt = [DateTime]::UtcNow.ToString('o') }
}

$summary = [ordered]@{
    version = 1
    generatedAt = [DateTime]::UtcNow.ToString('o')
    requestedCatalogRange = "$FromCatalog..$ToCatalog"
    outputDirectory = $OutputDirectory
    policy = [ordered]@{
        skipsExtraFirstPageSlot = $true
        skipsDuplicateFourthPageSlot = $true
        recordsRemainUnverified = $true
        doesNotChangeMigrationStatus = $true
    }
    runs = $runs
}
$summary | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path (Join-Path $projectRoot $OutputDirectory) 'catalog-capture-summary.json') -Encoding utf8
$summary | ConvertTo-Json -Depth 4
