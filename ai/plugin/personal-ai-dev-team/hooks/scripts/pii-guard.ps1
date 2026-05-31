# PreToolUse PII/시크릿 가드 (PII·secret guard)
# stdin 으로 hook JSON 을 받아 tool_input 의 텍스트를 검사한다.
# - 하드 차단(exit 2): 실제 시크릿·금지 명령
# - 경고(exit 0 + stderr): 전화/카드/주민번호 패턴(더미는 통과)
# - 파싱 실패: 침묵 통과하지 않고 stderr 로 경고 후 진행(브릭 방지). pwsh 자체 부재는 OS 레벨 한계.

try {
    $raw = [Console]::In.ReadToEnd()
    if ([string]::IsNullOrWhiteSpace($raw)) { exit 0 }
    $hook = $raw | ConvertFrom-Json -ErrorAction Stop
} catch {
    [Console]::Error.WriteLine("[pii-guard] 입력 파싱 실패 — 검사를 건너뜁니다(침묵 아님). $($_.Exception.Message)")
    exit 0
}

# 검사할 텍스트 수집 (도구별 주요 필드)
$ti = $hook.tool_input
$parts = @()
foreach ($k in 'command','content','new_string','file_text','old_string') {
    if ($ti.$k) { $parts += [string]$ti.$k }
}
$text = ($parts -join "`n")
if ([string]::IsNullOrWhiteSpace($text)) { exit 0 }

# --- 하드 차단 패턴 ---
$hard = @(
    @{ name = 'AWS Access Key';        re = 'AKIA[0-9A-Z]{16}' },
    @{ name = '개인 키 블록';          re = '-----BEGIN [A-Z ]*PRIVATE KEY-----' },
    @{ name = 'terraform apply/destroy'; re = 'terraform\s+(apply|destroy)' },
    @{ name = 'DB 덤프';               re = '\b(mysqldump|mariadb-dump|pg_dump)\b' },
    @{ name = 'DDL(스키마 직접 변경)'; re = '(?im)\b(DROP\s+TABLE|TRUNCATE\s+TABLE|ALTER\s+TABLE)\b' }
)
foreach ($p in $hard) {
    if ($text -match $p.re) {
        [Console]::Error.WriteLine("[pii-guard] 차단: '$($p.name)' 감지. 시크릿/위험 명령을 제거하거나 더미·placeholder로 바꾸세요. 운영 DB/인프라 변경은 마이그레이션·IaC 코드로 작성하고 실행은 담당자가 합니다(조직 정책).")
        exit 2
    }
}

# --- 경고(허용) 패턴: 더미면 통과 ---
$dummyOk = ($text -match 'example\.com') -or ($text -match '010-?0000-?0000') -or ($text -match '홍길동')
$warns = @()
if (($text -match '01[016789]-?\d{3,4}-?\d{4}') -and -not $dummyOk) { $warns += '전화번호' }
if (($text -match '\b\d{4}-\d{4}-\d{4}-\d{4}\b') -and -not $dummyOk) { $warns += '카드번호' }
if ($text -match '\b\d{6}-\d{7}\b') { $warns += '주민등록번호' }
if ($warns.Count -gt 0) {
    [Console]::Error.WriteLine("[pii-guard] 경고: $($warns -join ', ') 형태가 보입니다. 실제 PII면 더미(홍길동, 010-0000-0000, example.com)로 바꾸세요. (진행 허용)")
    exit 0
}

exit 0
