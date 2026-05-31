#!/usr/bin/env node
// Stop 완료 점검 hook (크로스플랫폼, Node) — 위험·큰 작업 한정
// transcript 에 "행위 형태" 위험 신호가 있으면 1회 block 하고 완료 보고 + 피드백 점검을 주입한다.
// stop_hook_active 가드로 무한 루프를 막는다. 보안용이 아니므로 오류 시 fail-open(exit 0).
import { readFileSync } from 'node:fs';

let hook;
try {
  let raw = '';
  try { raw = readFileSync(0, 'utf8'); } catch { raw = ''; }
  if (!raw.trim()) process.exit(0);
  hook = JSON.parse(raw);
} catch { process.exit(0); }

// 재진입(블록으로 다시 돌게 된 경우)이면 통과 — 루프 방지
if (hook.stop_hook_active === true) process.exit(0);

const tp = hook.transcript_path;
if (!tp) process.exit(0);
let content = '';
try { content = readFileSync(tp, 'utf8'); } catch { process.exit(0); }
if (!content.trim()) process.exit(0);
if (content.length > 40000) content = content.slice(-40000); // 최근 부분만

// "행위 형태" 신호만 검사 (느슨한 명사 제외 → 단순 언급으로는 발동 안 함)
const risk = /git commit|git push|git reset --hard|\b(DROP|TRUNCATE|ALTER)\s+TABLE\b|DELETE\s+FROM|Remove-Item|rm -rf/i;
if (risk.test(content)) {
  const reason = [
    '이번 작업에 위험 신호(커밋·푸시·DB 변경·삭제 등)가 보입니다. 종료 전 완료 점검을 수행하세요.',
    '- 완료 보고: 작업 유형 / 처리 범위 / 생략 역할·근거 / 주요 변경 / 검증(수행·미수행+이유) / 남은 리스크',
    '- 피드백 점검(6): 요청을 정확히 이해? 범위를 안 벗어남? 필요한 역할 생략 없음? 검증 안 한 것을 완료라 말하지 않음? 미정·리스크를 숨기지 않음? 다음부터 바꿀 규칙은?',
    '- 오류·교정이 있었으면 feedback/feedback-log.md 에 기록(없으면 "특이 피드백 없음").',
  ].join('\n');
  process.stdout.write(JSON.stringify({ decision: 'block', reason }));
  process.exit(0);
}

process.exit(0);
