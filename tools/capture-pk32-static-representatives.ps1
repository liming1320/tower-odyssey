param(
    [string]$GroupsFile = 'output\pk32-reference\static-migration-groups.json',
    [string]$OutputDirectory = 'output\pk32-reference\runtime-representative-captures',
    [int]$FromGroup = 1,
    [int]$ToGroup = 0,
    [int]$GameWaitMs = 1200,
    [int]$MaxDeltaMiB = 64,
    [switch]$Run,
    [switch]$AllowDesktopInput
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot

if ($GroupsFile -match '^\d+$' -and $OutputDirectory -match '^\d+$') {
    $FromGroup = [int]$GroupsFile
    $ToGroup = [int]$OutputDirectory
    $GroupsFile = 'output\pk32-reference\static-migration-groups.json'
    $OutputDirectory = 'output\pk32-reference\runtime-representative-captures'
}

function Resolve-ProjectPath([string]$Value) {
    if ([IO.Path]::IsPathRooted($Value)) { return [IO.Path]::GetFullPath($Value) }
    return [IO.Path]::GetFullPath((Join-Path $projectRoot $Value))
}

$fullGroupsFile = Resolve-ProjectPath $GroupsFile
if (-not (Test-Path -LiteralPath $fullGroupsFile)) { throw "Static group file not found: $fullGroupsFile. Run npm run pk32:static-groups first." }
$groups = ([IO.File]::ReadAllText($fullGroupsFile, [Text.Encoding]::UTF8) | ConvertFrom-Json).groups
if ($groups.Count -eq 0) { throw 'The static group file contains no groups.' }
if ($ToGroup -eq 0) { $ToGroup = $groups.Count }
if ($FromGroup -lt 1 -or $ToGroup -gt $groups.Count -or $ToGroup -lt $FromGroup) { throw "Group range must be within 1..$($groups.Count)." }
if (-not $Run) {
    $groups | Select-Object -Skip ($FromGroup - 1) -First ($ToGroup - $FromGroup + 1) | ForEach-Object {
        [PSCustomObject]@{ group = $_.id; representative = $_.representative; runtimeSamplePolicy = $_.runtimeSamplePolicy }
    } | ConvertTo-Json -Depth 5
    exit 0
}
if (-not $AllowDesktopInput) { throw 'This collector sends foreground mouse input. Pass -AllowDesktopInput only while the desktop is free.' }

$catalogScript = Join-Path $PSScriptRoot 'capture-pk32-runtime-catalog.ps1'
$selected = @($groups | Select-Object -Skip ($FromGroup - 1) -First ($ToGroup - $FromGroup + 1))
$runs = @()
foreach ($group in $selected) {
    $index = [int]$group.representative.index
    $startedAt = [DateTime]::UtcNow.ToString('o')
    & $catalogScript -Run -AllowDesktopInput -FromCatalog $index -ToCatalog $index -OutputDirectory $OutputDirectory -GameWaitMs $GameWaitMs -MaxDeltaMiB $MaxDeltaMiB
    if (-not $?) { throw "Representative capture failed for $($group.id), catalog index $index." }
    $runs += [ordered]@{
        group = $group.id
        representative = $group.representative
        catalogIndex = $index
        startedAt = $startedAt
        finishedAt = [DateTime]::UtcNow.ToString('o')
    }
}

$summary = [ordered]@{
    version = 1
    generatedAt = [DateTime]::UtcNow.ToString('o')
    groupsFile = $GroupsFile
    requestedGroupRange = "$FromGroup..$ToGroup"
    policy = [ordered]@{
        staticGroupsAreTheUnitOfSampling = $true
        oneRepresentativePerGroup = $true
        noPerGameRuntimeRequirement = $true
        migrationStatusUnchanged = $true
    }
    runs = $runs
}
$fullOutput = Resolve-ProjectPath $OutputDirectory
New-Item -ItemType Directory -Force -Path $fullOutput | Out-Null
$summary | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $fullOutput 'representative-capture-summary.json') -Encoding utf8
$summary | ConvertTo-Json -Depth 5
