# UserPromptSubmit 피드백 누락 알림 hook
# 사용자 프롬프트에 교정 신호가 보이면, 오류·교정을 feedback-log 에 기록하라고 컨텍스트에 주입한다.
# stdout 은 UserPromptSubmit 에서 모델 컨텍스트로 추가된다. 오류 시 통과(exit 0).

try {
    $raw = [Console]::In.ReadToEnd()
    if ([string]::IsNullOrWhiteSpace($raw)) { exit 0 }
    $hook = $raw | ConvertFrom-Json -ErrorAction Stop
} catch { exit 0 }

$p = [string]$hook.prompt
if ([string]::IsNullOrWhiteSpace($p)) { exit 0 }

if ($p -match '아니|그게 아니|잘못|다시|틀렸|되돌|롤백|왜 이렇') {
    Write-Output "[feedback-reminder] 교정 신호가 감지되었습니다. 이번 오류·교정을 feedback/feedback-log.md 에 references/feedback.md §7 형식으로 기록했는지 확인하세요. '사용자 지시 오해'인지 'AI 실행 오류'인지 대상을 구분해 남기세요."
}

exit 0
