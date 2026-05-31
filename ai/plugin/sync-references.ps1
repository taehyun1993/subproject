# references 동기화 (개발용 빌드 단계, 플러그인 런타임 아님)
#
# 정본 = 최상위 원본 문서(../workflow, ../job).
# 플러그인의 references/ 는 이 스크립트로 덮어쓰는 "생성물"이다 — 손으로 편집하지 말 것.
# 원본을 고친 뒤 이 스크립트를 실행하면 references/ 가 최신으로 맞춰진다.
#
# 사용: pwsh -NoProfile -File sync-references.ps1

$ErrorActionPreference = 'Stop'
$base    = Split-Path -Parent $PSScriptRoot          # ...\ai
$target  = Join-Path $PSScriptRoot 'personal-ai-dev-team\references'

if (-not (Test-Path $target)) { New-Item -ItemType Directory -Force -Path $target | Out-Null }

# 원본 경로 → references 파일명 매핑
$map = @{
    (Join-Path $base 'workflow\workflow.md')         = 'workflow.md'
    (Join-Path $base 'job\planner.md')               = 'planner.md'
    (Join-Path $base 'job\ui_ux_designer.md')        = 'ui_ux_designer.md'
    (Join-Path $base 'job\backend_developer.md')     = 'backend_developer.md'
    (Join-Path $base 'job\frontend_developer.md')    = 'frontend_developer.md'
    (Join-Path $base 'job\feedback.md')              = 'feedback.md'
}

$missing = @()
foreach ($src in $map.Keys) {
    if (-not (Test-Path -LiteralPath $src)) { $missing += $src; continue }
    Copy-Item -LiteralPath $src -Destination (Join-Path $target $map[$src]) -Force
    Write-Output "synced: $($map[$src])"
}

if ($missing.Count -gt 0) {
    Write-Warning ("원본을 찾지 못함: " + ($missing -join ', '))
    exit 1
}
Write-Output "references 동기화 완료 → $target"
