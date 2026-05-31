# personal-ai-dev-team

1인 개발자를 위한 "AI 개발팀" 플러그인. 작업 유형을 판단해 역할(기획/백엔드/프론트/UIUX)로 라우팅하고, 산출물 형식을 고정하며, 오류·교정을 누적해 문서에 반영하고, PII·시크릿·운영 위험을 hook으로 차단한다.

설계 배경과 의사결정은 상위 `../plugin-skill-plan.md` 참고.

---

## 1. 설치 / 로드

이 디렉토리(`personal-ai-dev-team/`)가 플러그인 루트다. Claude Code에 **로컬 플러그인**으로 추가해서 쓴다.

대략의 순서(정확한 명령은 Claude Code 버전에 따라 다르므로 **공식 플러그인 문서로 확인**):

1. Claude Code에서 `/plugin` 으로 플러그인 관리 화면을 연다.
2. 이 디렉토리를 로컬 마켓플레이스/플러그인 경로로 추가한다.
3. `personal-ai-dev-team` 을 설치(활성화)한다.
4. 활성화되면 `/help` 또는 `/` 입력 시 `/workflow`, `/docs`, `/squash` 등이 보인다.

> hook은 **Node.js(`node`)로 실행**된다(크로스플랫폼 — Windows/macOS/Linux 동일). Claude Code 자체가 Node 기반이라 `node`는 사실상 항상 PATH에 있다. 별도 런타임 설치가 필요 없다.

---

## 2. 구성 요소 한눈에

| 종류 | 이름 | 용도 |
|---|---|---|
| 명령 | `/workflow` | 작업 유형·역할·순서 결정(라우터). **여기서 시작** |
| 명령 | `/docs` | md 인덱스·중복 점검·HTML 대시보드(현황 파악) |
| 명령 | `/docs-refine` | 문서 재검토 후 다시 쓰기(승인 시 반영) |
| 명령 | `/feedback-review` | 누적 피드백 롤업 → 요약 + 문서 수정안 |
| 명령 | `/squash` | 본인 커밋 합치기(안전장치 4종) |
| 명령 | `/peer-review` | 외부 AI(Codex)에 검토 위임(민감정보 차단 후) |
| 스킬 | `planner` `backend-developer` `frontend-developer` | 역할 지침 + 산출물 템플릿(자동/명시 발동) |
| 스킬 | `ui-ux-designer` | 신규 화면 디자인안 비교에 한정 |
| hook | pii-guard / completion-check / feedback-reminder | 시크릿 차단 / 완료 점검 / 피드백 알림(강제) |

---

## 3. 기본 사용 흐름

작업이 들어오면 **`/workflow`로 시작**한다.

```
/workflow 회원 알림 설정 화면에 '야간 방해금지' 토글 추가
```

→ 작업 유형(레거시 추가) 판단 → 진입 요약(영향 영역·필요 역할·미정·검증) → 역할 순서 제시. 이후 각 역할 스킬이 그 안에서 호출된다(라우팅 전에 역할 스킬을 먼저 띄우지 않음).

역할 스킬은 두 가지로 발동한다.
- **명시**: `planner`, `backend-developer` 처럼 직접 부르거나 `/workflow`가 호출.
- **자동**: 단발성 단순 작업에서 description으로 발동. 예: "이 API 에러 응답 좀 봐줘" → `backend-developer`.

각 역할 스킬은 **정해진 산출물 템플릿을 채워서** 낸다(이게 스킬의 핵심 가치). 상세 원칙은 `references/`의 해당 문서를 읽는다.

---

## 4. 명령 상세 사용법

### `/workflow <요청>`
작업을 어떻게 진행할지 모를 때 가장 먼저. 작업 유형(신규/레거시추가/버그 5-1~5-4/디자인/리팩터링/성능/외부연동)을 판단하고 역할 순서를 제시한다. 대상 레포의 `CLAUDE.md`를 먼저 읽어 분석 대상을 잡는다.

### `/docs [디렉토리]`
문서 **현황 파악**. md 목록·목적 요약, 문서 관계, 중복·누락·충돌 보고, (요청 시) HTML 대시보드 생성. 원본을 수정하지 않는다.

### `/docs-refine <문서경로>`
문서 **품질 개선**. 비평 → 수정안(diff) 제시 → **승인 시에만 반영**(원본 즉시 덮어쓰지 않음). 큰 구조 변경이면 `/docs`로 현황 먼저 파악 후 진행.

### `/feedback-review`
`feedback/feedback-log.md`를 롤업. 반복 패턴 추출 → 사람용 `feedback-report.md` + 역할/워크플로 문서 수정안(diff). **승인분만 반영**, 반영 항목은 상태 `반영`으로 갱신. (트리거 시점: 5개↑ / 같은 문제 2회↑ / 큰 작업 종료 / 요청 시)

### `/squash <시작커밋>`
본인이 작업한 커밋을 합친다. **안전장치(모두 필수)**:
1. 시작 지점을 지시하지 않으면 진행하지 않음(범위 추측 금지)
2. `git config user.email`로 현재 작성자를 읽어 **본인 커밋만** 대상(타인 커밋 섞이면 중단)
3. 합칠 커밋 목록 + 새 메시지를 **미리보기**로 보여주고 승인 후 실행
4. `origin/<base>`보다 앞선(미공유) 커밋만 / main·master 금지 / 비대화식(`reset --soft`) / 푸시는 별도 확인

예: `/squash a1b2c3d` → `a1b2c3d..HEAD` 를 미리보기 후 합침.

### `/peer-review [대상]`
현재 작업을 외부 AI(현재 Codex)에 검토 위임. **민감정보 차단이 전제**: PII·시크릿·자격증명·핵심 비즈니스 로직을 sanitize한 뒤 일반 코드·구조·설계 위주로만 전달. 가려야 할 부분이 검토의 핵심이면 외부 위임을 멈추고 내부 검토(`/docs-refine`)로 돌린다. 무엇을 보내는지 먼저 요약해 동의받고 전송. 결과 반영 여부는 사용자가 판단.

---

## 5. 역할 스킬 사용법

| 스킬 | 부르는 상황 | 보장 산출물 |
|---|---|---|
| `planner` | 아이디어→기획, 우선순위, 정책, 비기능 요구 | 확정 기획서 템플릿 |
| `backend-developer` | API·DB·상태/정책·트랜잭션·테스트 | 백엔드 설계서·API 명세 템플릿 |
| `frontend-developer` | 화면·컴포넌트·상태·API 연동, "화면 깨졌어" | 프론트 설계서 템플릿 |
| `ui-ux-designer` | **신규 화면** 디자인안 2~3개 비교 | 디자인안 비교표·추천 |

각 스킬은 시작 시 **입력 수신 점검**(핵심 상태값·권한·완료조건 미정이면 구현 전 반려)을 하고, **상태 책임 분담**(권한·코드=백엔드 / 화면·문구=UIUX / 구현=프론트)을 따른다.

---

## 6. hook 동작 (강제)

| hook | 이벤트 | 동작 |
|---|---|---|
| `pii-guard` | PreToolUse(Bash/Write/Edit 등) | 시크릿(AWS키·개인키·terraform apply·destroy·DB덤프·DDL) **차단(exit 2)**. 전화/카드/주민번호 패턴은 **경고+허용**(더미 `010-0000-0000`·`example.com`·`홍길동`은 통과) |
| `completion-check` | Stop | 위험 신호(배포·DB변경·삭제·결제·권한·개인정보)가 있으면 1회 블록하고 완료 보고+피드백 점검 주입. 재진입(`stop_hook_active`) 시 통과(루프 방지) |
| `feedback-reminder` | UserPromptSubmit | 교정 신호("아니/그게 아니라/잘못/다시/되돌") 감지 시 feedback-log 기록 리마인드 |

- pii-guard는 **fail-soft하지 않게** 설계: 입력을 파싱 못 하면 침묵 통과하지 않고 stderr로 알린다. 실제 시크릿 탐지는 차단(exit 2)이 확실히 동작한다.
- completion-check는 보안용이 아니라 점검용이므로 오류 시 통과(fail-open).

---

## 7. 피드백 파이프라인 사용법

```
(A) 감지            (B) 누적              (C) 롤업                (D) 반영
메인 루프 + hook  → feedback/             → /feedback-review     → 승인분만
교정신호 알림        feedback-log.md         ├ feedback-report.md    역할/워크플로
                    (§7 형식 한 줄씩)        └ 문서 수정안(diff)     문서에 반영
```

- 오류·교정이 생기면 `feedback/feedback-log.md`에 `references/feedback.md` §7 형식으로 한 줄 추가(대상: 사용자 지시 / AI 실행 등).
- 주기적으로 `/feedback-review` 실행 → 사람용 요약 + 문서 수정안 → **승인분만** 반영.
- `feedback-log.md`에는 민감 내용이 섞일 수 있어 기본 `.gitignore` 권장(아래 9 참고).

---

## 8. 문서 유지 규칙 (references는 생성물)

**정본은 최상위 원본**: `../../workflow/workflow.md`, `../../job/*.md`.
이 플러그인의 `references/`는 그 **복사본(생성물)**이다 — **손으로 편집하지 말 것.**

- 기준을 고칠 때는 **원본만** 편집한다.
- 그 뒤 동기화: `node ../sync-references.mjs` 실행 → `references/`가 최신으로 덮어써진다.
- 이 규칙을 지키면 "두 벌 갈라짐"이 생기지 않는다. (문서가 안정되면 추후 references를 정본으로 합치는 선택지도 있음.)

---

## 9. 조직 정책 주의

- 운영 DB의 DML/DDL·마이그레이션·인프라 변경은 **작성·리뷰까지만**, 실행은 담당자(코드·plan·검증쿼리 형태로 산출). pii-guard는 이런 위험 명령(인프라 적용·파기, DB 덤프, DDL)을 **셸 실행(Bash/PowerShell)에서만** 차단하고, 문서·코드에서 단어를 언급하는 것은 막지 않는다. 시크릿(키·자격증명)은 모든 도구에서 차단한다.
- PII/시크릿은 출력 금지 — 예시는 더미(`홍길동`, `010-0000-0000`, `test@example.com`)·마스킹.
- `/peer-review`(Codex)는 외부 서비스라 sanitize 후에만, 민감 작업은 내부 검토로.

---

## 10. 테스트 체크리스트 (설치 후)

한국어 구어체로 발동·동작을 확인한다.

- [ ] `/workflow 주문 취소 기능 추가` → 작업 유형·역할 순서가 나오는가
- [ ] "API 만들어줘" / "화면 깨졌어" 같은 구어체로 backend/frontend 스킬이 적절히 발동하는가
- [ ] 시크릿(예: `AKIA...`) 포함 Write 시 pii-guard가 **차단**하는가
- [ ] 더미 전화번호(`010-0000-0000`)는 통과하는가
- [ ] 위험 작업(예: DB 변경) 후 종료 시 completion-check가 완료 점검을 띄우는가
- [ ] "아니 그게 아니라…" 입력 시 feedback-reminder가 기록을 상기시키는가
- [ ] `/squash`가 시작 커밋 없이 부르면 진행을 멈추고 되묻는가, 미리보기를 보여주는가
- [ ] 오류 기록 누적 후 `/feedback-review`가 요약·수정안을 만드는가

---

## 11. 트러블슈팅

- **hook이 안 뜬다** → `node`가 PATH에 있는지 확인(`node -v`). Claude Code가 Node 기반이라 보통 항상 있다. hook 명령은 `node ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/*.mjs` 형식.
- **스킬이 자동으로 안 뜬다** → 스킬은 description 기반이라 항상 뜨지 않는다. 의도적으로 쓰려면 명시 호출하거나 `/workflow`로 시작.
- **pii-guard가 정상 작업을 막는다** → 더미 화이트리스트(`0000`·`example.com`·`홍길동`)를 쓰거나, 차단 패턴 조정은 `hooks/scripts/pii-guard.mjs`에서. (보안 기준은 신중히)
- **references가 원본과 다르다** → 손으로 references를 고친 경우다. 원본을 정본으로 두고 `node ../sync-references.mjs`를 다시 실행.
