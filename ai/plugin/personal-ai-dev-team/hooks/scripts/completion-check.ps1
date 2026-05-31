# Stop 완료 점검 hook (위험·큰 작업 한정)
# transcript 에 위험 신호가 있으면 1회 block 하고 완료 보고 + 피드백 점검을 주입한다.
# stop_hook_active 가드로 무한 루프를 막는다. 보안용이 아니므로 오류 시 fail-open(exit 0).

try {
    $raw = [Console]::In.ReadToEnd()
    if ([string]::IsNullOrWhiteSpace($raw)) { exit 0 }
    $hook = $raw | ConvertFrom-Json -ErrorAction Stop
} catch { exit 0 }

# 재진입(블록으로 다시 돌게 된 경우)이면 통과 — 루프 방지
if ($hook.stop_hook_active -eq $true) { exit 0 }

$tp = $hook.transcript_path
if (-not $tp -or -not (Test-Path -LiteralPath $tp)) { exit 0 }
try { $content = Get-Content -Raw -LiteralPath $tp -ErrorAction Stop } catch { exit 0 }
if ([string]::IsNullOrWhiteSpace($content)) { exit 0 }

# 최근 부분만 검사 (성능)
if ($content.Length -gt 40000) { $content = $content.Substring($content.Length - 40000) }

$risk = 'git commit|git push|배포|deploy|DROP TABLE|TRUNCATE|DELETE FROM|ALTER TABLE|Remove-Item|rm -rf|결제|정산|권한|개인정보|migration|마이그레이션'
if ($content -match $risk) {
    $reason = @'
이번 작업에 위험 신호(배포·DB변경·삭제·결제·권한·개인정보 등)가 보입니다. 종료 전 완료 점검을 수행하세요.
- 완료 보고: 작업 유형 / 처리 범위 / 생략 역할·근거 / 주요 변경 / 검증(수행·미수행+이유) / 남은 리스크
- 피드백 점검(6): 요청을 정확히 이해? 범위를 안 벗어남? 필요한 역할 생략 없음? 검증 안 한 것을 완료라 말하지 않음? 미정·리스크를 숨기지 않음? 다음부터 바꿀 규칙은?
- 오류·교정이 있었으면 feedback/feedback-log.md 에 (references/feedback.md §7 형식으로) 기록(없으면 "특이 피드백 없음").
'@
    $out = @{ decision = 'block'; reason = $reason } | ConvertTo-Json -Compress
    Write-Output $out
    exit 0
}

exit 0
