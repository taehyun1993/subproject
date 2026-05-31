#!/usr/bin/env node
// PreToolUse PII/시크릿 가드 (크로스플랫폼, Node)
// stdin 으로 hook JSON 을 받아 검사한다.
// - 시크릿 패턴: 모든 도구의 "새로 들어오는 내용"에서 차단(exit 2)
// - 명령 실행 패턴: Bash/PowerShell 의 command 입력에만 차단(exit 2)
// - 전화/카드/주민번호: 경고(exit 0), 더미는 통과
// - 파싱 실패: stderr 경고 후 exit 0 (비침묵). old_string 은 검사하지 않는다.
import { readFileSync } from 'node:fs';

let hook;
try {
  let raw = '';
  try { raw = readFileSync(0, 'utf8'); } catch { raw = ''; }
  if (!raw.trim()) process.exit(0);
  hook = JSON.parse(raw);
} catch (e) {
  process.stderr.write(`[pii-guard] 입력 파싱 실패 — 검사를 건너뜁니다(침묵 아님). ${e.message}\n`);
  process.exit(0);
}

const tool = hook.tool_name || '';
const ti = hook.tool_input || {};

// 새로 들어오는 내용만 검사 (old_string 제외)
const contentText = [ti.content, ti.new_string, ti.file_text].filter(Boolean).join('\n');
const commandText = [ti.command].filter(Boolean).join('\n');
const allText = [contentText, commandText].filter(Boolean).join('\n');

// --- 시크릿 패턴: 모든 도구에서 차단 ---
const secretPatterns = [
  { name: 'AWS Access Key', re: /AKIA[0-9A-Z]{16}/ },
  { name: '개인 키 블록', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'DB 접속 URL(자격증명 포함)', re: /(mysql|postgres|postgresql|mongodb):\/\/[^\s:@]+:[^\s:@]+@/i },
  { name: '시크릿/비밀번호 하드코딩', re: /(secret|password|passwd|api[_-]?key|access[_-]?token)\s*[:=]\s*['"][^'"]{8,}['"]/i },
];
for (const p of secretPatterns) {
  if (p.re.test(allText)) {
    process.stderr.write(`[pii-guard] 차단: '${p.name}' 감지. 시크릿을 제거하거나 더미·placeholder로 바꾸세요.\n`);
    process.exit(2);
  }
}

// --- 명령 실행 패턴: 셸 도구(command)에만 차단. 문서/코드에서 "언급"만 한 경우는 통과 ---
if (tool === 'Bash' || tool === 'PowerShell') {
  const cmdPatterns = [
    { name: '인프라 적용/파기', re: /terraform\s+(apply|destroy)/ },
    { name: 'DB 덤프', re: /\b(mysqldump|mariadb-dump|pg_dump)\b/ },
    { name: 'DDL(스키마 직접 변경)', re: /\b(DROP|TRUNCATE|ALTER)\s+TABLE\b/i },
  ];
  for (const p of cmdPatterns) {
    if (p.re.test(commandText)) {
      process.stderr.write(`[pii-guard] 차단: '${p.name}' 명령. 운영 DB/인프라 변경은 마이그레이션·IaC 코드로 작성하고 실행은 담당자가 합니다(조직 정책).\n`);
      process.exit(2);
    }
  }
}

// --- 경고(허용): 전화/카드/주민번호. 더미는 통과 ---
const dummyOk = /example\.com|010-?0000-?0000|홍길동/.test(allText);
const warns = [];
if (/01[016789]-?\d{3,4}-?\d{4}/.test(allText) && !dummyOk) warns.push('전화번호');
if (/\b\d{4}-\d{4}-\d{4}-\d{4}\b/.test(allText) && !dummyOk) warns.push('카드번호');
if (/\b\d{6}-\d{7}\b/.test(allText)) warns.push('주민등록번호');
if (warns.length) {
  process.stderr.write(`[pii-guard] 경고: ${warns.join(', ')} 형태가 보입니다. 실제 PII면 더미(홍길동, 010-0000-0000, example.com)로 바꾸세요. (진행 허용)\n`);
  process.exit(0);
}

process.exit(0);
