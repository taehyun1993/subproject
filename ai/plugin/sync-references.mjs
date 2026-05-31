#!/usr/bin/env node
// references 동기화 (개발용, 크로스플랫폼 Node — 플러그인 런타임 아님)
//
// 정본 = 최상위 원본 문서(../workflow, ../job).
// 플러그인의 references/ 는 이 스크립트로 덮어쓰는 "생성물"이다 — 손으로 편집하지 말 것.
// 원본을 고친 뒤 실행: node sync-references.mjs
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)); // .../ai/plugin
const base = dirname(here);                            // .../ai
const target = join(here, 'personal-ai-dev-team', 'references');
mkdirSync(target, { recursive: true });

// 원본(상대경로) → references 파일명
const map = {
  'workflow/workflow.md': 'workflow.md',
  'job/planner.md': 'planner.md',
  'job/ui_ux_designer.md': 'ui_ux_designer.md',
  'job/backend_developer.md': 'backend_developer.md',
  'job/frontend_developer.md': 'frontend_developer.md',
  'job/feedback.md': 'feedback.md',
};

const missing = [];
for (const [src, dst] of Object.entries(map)) {
  const from = join(base, src);
  if (!existsSync(from)) { missing.push(src); continue; }
  copyFileSync(from, join(target, dst));
  console.log('synced: ' + dst);
}

if (missing.length) {
  console.error('원본을 찾지 못함: ' + missing.join(', '));
  process.exit(1);
}
console.log('references 동기화 완료 → ' + target);
