# 개인 AI 개발팀 플러그인/스킬 구성안

이 문서는 역할 문서(`job/*.md`)와 워크플로 문서(`workflow/workflow.md`)를 기반으로 개인용 AI 개발팀 플러그인을 만들 때 어떤 단위로 나눌지, 자동 동작은 어떻게 강제할지, 어떤 코드베이스에서 쓸지를 정리한다.

> 이 판은 3관점 검토(역할 완성도 / 워크플로 빈틈 / 플러그인 의의)를 반영해 **v1 범위를 "없을 때와 결과가 실제로 달라지는 것"으로 좁힌** 버전이다. 핵심 결론: 결과를 진짜 바꾸는 것은 ① 강제력 있는 **hook**(PII·시크릿·운영DML 차단), ② 세션을 넘는 **피드백 누적·반영 파이프라인** 둘이며, 역할 스킬의 가치는 "품질"이 아니라 **"산출물 형식(템플릿) 고정"**이다.

## 1. 기본 방향

처음부터 여러 플러그인으로 나누기보다 하나의 개인용 플러그인으로 시작한다.

```text
personal-ai-dev-team
```

이 플러그인 안에 워크플로, 역할별 작업 기준, 피드백 파이프라인, 문서화 기능을 **구성 요소(스킬 / 슬래시 명령 / hook / reference)** 단위로 넣는다. 반복 호출 가치가 있고 작업 결과가 실제로 달라지는 단위만 분리한다.

### 구성 요소 4종 (먼저 구분)

| 종류 | 발동 방식 | 쓰는 경우 |
| --- | --- | --- |
| 슬래시 명령 (`commands/`) | 사용자가 `/이름`으로 직접 호출 | 의도적으로 부르는 작업: 워크플로 라우팅, 문서화, 피드백 정리 |
| 스킬 (`skills/`) | 모델이 `description`을 읽고 자동 판단, 또는 `/이름` | 맥락 보고 알아서 떠야 하는 역할 지침 |
| hook (`hooks/`) | harness가 특정 이벤트에서 **강제 실행** | "항상 ~할 때마다" 자동 동작: PII 차단, 피드백 누락 알림, 완료 점검 |
| reference (`references/`) | 스킬/명령이 필요할 때 Read | 상세 본문(템플릿·원칙) |

이 구분이 중요한 이유: **"오류가 난 그 순간 반드시" 같은 자동 동작은 스킬로 보장되지 않는다.** 스킬은 모델이 필요하다고 판단할 때만 뜨기 때문이다. 그런 강제 동작은 hook이라야 한다. (그래서 피드백 감지는 스킬이 아니라 hook이다 — §9 참고.)

## 2. 구성 요소 후보

| 구성 요소 | 종류 | 역할 | 주요 산출물 |
| --- | --- | --- | --- |
| `workflow` | 슬래시 명령 | 작업 유형·필요 역할·진행 순서 결정 | 작업 진입 요약, 역할 선택표, 진행상황 |
| `docs` | 슬래시 명령 | Markdown 정리 + HTML 대시보드 | 문서 인덱스, HTML 대시보드 |
| `feedback-review` | 슬래시 명령 | 누적 피드백 로그를 주기적으로 롤업해 문서에 반영 | 사람용 요약, 문서 수정안(diff) |
| `docs-refine` | 슬래시 명령 | 플러그인/md 문서를 재검토해 다시 쓰기 | 비평 + 수정안(승인 시 반영) |
| `squash` | 슬래시 명령 | 본인이 작업한 관련 커밋을 합치기(스쿼시) | 스쿼시 미리보기 → 승인 후 실행 |
| `peer-review` | 슬래시 명령 | 현재 작업을 외부 AI(현재 Codex)에 검토 위임 | 외부 검토 의견(민감정보 차단 후 전달) |
| `planner` | 스킬 | 아이디어·요구사항을 기획 문서로 정리 | **확정 기획서 템플릿** 채움 |
| `backend-developer` | 스킬 | API·DB·정책·트랜잭션·테스트 설계/구현 | **백엔드 설계서·API 명세 템플릿** 채움 |
| `frontend-developer` | 스킬 | 화면·컴포넌트·상태·API 연동 구현 | **프론트 설계서 템플릿** 채움 |
| `ui-ux-designer` | 스킬(좁은 범위) | **신규 화면 디자인안 비교**에 한정 | 디자인안 비교표, 추천안 |
| PII·시크릿 차단 | hook | 운영DML·시크릿·인프라 명령 차단 | (강제 동작) |
| 완료 점검 | hook | 위험·큰 작업 완료 게이트 점검 | (강제 동작) |
| 피드백 누락 알림 | hook | 교정 신호 포착 → 로그 기록 리마인드 | (강제 동작) |

`feedback-discipline`을 별도 스킬로 두지 않는다(아래 §9 참고). `reviewer`, `test-verifier`, `html-visualizer`도 처음부터 분리하지 않는다.

## 3. 1차로 만들 구성 요소

**슬래시 명령** — `/workflow`(라우팅), `/docs`(문서·HTML), `/feedback-review`(피드백 롤업), `/docs-refine`(문서 재검토·재작성), `/squash`(커밋 정리), `/peer-review`(외부 AI 검토). 뒤 세 개는 유틸리티 명령으로, 상세 동작·안전장치는 §15에 정의한다.

**스킬(자동 발동)** — `planner`, `backend-developer`, `frontend-developer` 3종. 각 스킬의 핵심 가치는 "산출물 템플릿 고정"이다(§8).

**스킬(좁은 범위)** — `ui-ux-designer`는 "신규 화면 디자인안 비교"에서만 발동하도록 description을 좁힌다. 기존 화면 내 UI 추가·상태 처리는 `frontend-developer`가 담당한다(중복 60% 해소).

**hook** — PII·시크릿·운영DML 차단(PreToolUse), 완료 점검(Stop, 위험 작업 한정), 피드백 누락 알림(Stop/UserPromptSubmit).

> `feedback-discipline`은 스킬 목록에서 제외했다. 피드백 "감지"는 hook(강제)과 메인 루프가, "형식"은 reference(`feedback.md` §7)가 담당한다.

## 4. HTML 문서화 방향

Markdown 문서는 작업 기준을 담고, HTML은 사람이 전체 구조를 빠르게 확인하는 대시보드 역할을 한다. HTML 문서화는 `/docs` 명령 안에 포함한다.

`/docs`의 역할:

- 현재 디렉토리의 `.md` 목록 확인, 각 문서 목적 요약, 문서 간 관계 정리
- 중복·누락·충돌 내용 찾기 (텍스트 산출물)
- 역할별 변경 이력을 모아 보여주기(작업 단위 통합 추적 보조)
- 확인용 HTML 대시보드 생성
- 플러그인 구조로 옮기기 적합한지 판단

> HTML 대시보드는 유지하되, 문서가 바뀌면 stale해지므로 **원본 md가 진실의 원천**이고 HTML은 보조 뷰임을 전제한다. 시각화 요구가 커지면 `html-visualizer`를 별도 분리한다.

## 5. HTML 대시보드 구성

```text
1. Overview — 문서 묶음의 목적, 포함 문서 목록
2. Workflow Map — 요청 → 작업유형 판단 → 역할 선택 → 구현 → 검증 → 피드백
3. Role Cards — 기획자 / UI·UX / 백엔드 / 프론트엔드
4. Document Relationships — workflow=라우터, 역할문서=세부기준, feedback=개선루프
5. Completion Checklist — 공통 완료 기준, 검증 기준, 남은 리스크
6. Plugin Readiness — 어떤 파일이 skill/command/reference로 갈 수 있는지
```

## 6. 디자인안 HTML 표시 방식

여러 디자인안은 HTML 카드와 비교표로 보여줄 수 있다(`ui-ux-designer`가 신규 화면 비교를 낼 때).

```text
디자인안 비교 페이지
├── 상단 요약 (화면 목적 / 사용자 행동 / 추천안)
├── A안 / B안 / C안 카드 (구조·장점·단점·적합 상황·구현 난이도)
└── 비교표 (사용성 / 정보량 / 구현 난이도 / 유지보수성 / 추천 여부)
```

포함 요소: 추천안 강조, 장단점 비교표, 사용자 흐름, 상태별 UI 체크리스트, 구현 난이도 배지, 리스크 표시, 기존 패턴 유지/새 구조 구분. (1인 작업에서 단순 비교는 md 표로도 충분하다 — 카드 UI는 비교안이 실제로 여러 개일 때만.)

## 7. 예상 플러그인 구조

`agents/`는 v1에서 제외한다(§12).

```text
personal-ai-dev-team/
├── .claude-plugin/
│   └── plugin.json
├── commands/
│   ├── workflow.md
│   ├── docs.md
│   ├── feedback-review.md
│   ├── docs-refine.md
│   ├── squash.md
│   └── peer-review.md
├── skills/
│   ├── planner/
│   │   └── SKILL.md
│   ├── backend-developer/
│   │   └── SKILL.md
│   ├── frontend-developer/
│   │   └── SKILL.md
│   └── ui-ux-designer/        # 좁은 범위(신규 화면 비교)
│       └── SKILL.md
├── hooks/
│   ├── hooks.json
│   └── scripts/
│       ├── pii-guard.mjs
│       ├── completion-check.mjs
│       └── feedback-reminder.mjs
├── references/
│   ├── workflow.md
│   ├── planner.md
│   ├── ui_ux_designer.md
│   ├── backend_developer.md
│   ├── frontend_developer.md
│   └── feedback.md
└── feedback/
    ├── feedback-log.md      # 누적 원장 (raw)
    └── feedback-report.md   # 사람용 요약 (롤업 산출물)
```

`SKILL.md`와 명령 파일은 짧게(발동 조건 + 채워야 할 템플릿 + "반드시 확인"), 상세 원칙은 `references/`를 읽게 한다. **300~730행짜리 역할 문서를 통째로 reference로 두면 스킬 발동 시 전부 읽혀 컨텍스트가 낭비되므로**, 스캐폴딩 시 각 reference를 "템플릿"과 "원칙"으로 잘게 쪼갠다(§13 다음 작업).

## 8. 스킬 description 작성 가이드 + 명시호출 우선

Claude Code 스킬에는 키워드 매칭 설정 필드가 없다. 스킬은 (1) 사용자가 `/skill-name`으로 명시 호출하거나, (2) 모델이 `SKILL.md`의 `description`을 읽고 자동 판단할 때 뜬다. **트리거의 실체는 `description` 한 줄**이다.

핵심 원칙 두 가지:

1. **"이 스킬이 보장하는 것 = 이 형식의 산출물"** 을 description 전면에 둔다. 역할 스킬의 진짜 가치는 품질이 아니라 산출물 형식 고정이기 때문이다.
2. **명시호출 우선.** 역할 스킬이 description으로 제멋대로 자동 발동하면 `/workflow` 라우팅 전에 backend 스킬이 먼저 떠 순서가 역전된다. 그래서 `/workflow`를 오케스트레이터로 두고 역할은 그 안에서 호출하는 것을 기본으로 하고, 자동 발동은 **단발성 단순 작업**(예: "이 API 에러 응답 좀 봐줘")에만 한정한다.

| 구성 요소 | description 예시 (frontmatter) |
| --- | --- |
| `planner` | 아이디어·요구사항을 **확정 기획서 템플릿**으로 정리할 때. 기능 우선순위, 정책, 비기능 요구. "기획" 요청 시. |
| `backend-developer` | API·DB·상태/정책·트랜잭션·테스트를 **백엔드 설계서·API 명세 템플릿**으로 낼 때. "백엔드/서버", 주문·결제·정산·권한, DB 스키마·마이그레이션 논의 시. |
| `frontend-developer` | 화면·컴포넌트·상태·API 연동을 **프론트 설계서 템플릿**으로 낼 때. "프론트/화면", 로딩·에러·빈 상태, 반응형·접근성. |
| `ui-ux-designer` | **신규 화면의 디자인안을 2~3개 비교**할 때만. 기존 화면 내 UI 추가·상태 처리는 frontend가 담당(자동 발동 최소화). |

**한국어 구어체 검증 필요**: 실제 호출은 "서버 쪽 좀", "API 만들어줘", "화면 깨졌어" 같은 구어체로 들어온다. description이 이런 변형까지 커버하는지 스캐폴딩 후 실제 요청으로 테스트한다(§13).

## 9. 피드백 누적·반영 파이프라인 ★

`feedback.md`의 목표는 "오류·교정이 자동으로 감지·누적되고 주기적으로 문서에 반영되는 것"이다. 4계층 파이프라인으로 운영한다. 대상 오류는 ① 사용자가 잘못 전달해 AI가 오류로 처리한 경우, ② AI가 잘못 처리해 오류가 난 경우 둘 다.

```text
(A) 감지        (B) 누적            (C) 주기적 롤업          (D) 반영
AI + hook 알림 → feedback-log.md  →  /feedback-review     →  승인 후
                 (raw 원장)           ├ feedback-report.md     역할·워크플로 md 수정
                                     └ md 수정안(diff)         (사용자 승인분만)
```

- **(A) 감지** — 감지는 **스킬이 아니다**(오류 낸 모델은 자기 오류를 모를 때가 많아, 정작 필요한 순간에 스킬이 안 뜬다). 메인 루프가 인식하면 기록하고, **hook(Stop/UserPromptSubmit)이 교정 신호("아니", "그게 아니라", "잘못", "다시", 되돌림·재작업)를 포착해 "feedback-log에 기록했는가"를 강제로 리마인드**한다. 기록 형식은 reference(`feedback.md` §7).
- **(B) 누적** — 모든 오류·교정을 `feedback/feedback-log.md`에 §7 형식으로 한 줄씩 쌓는다.
- **(C) 주기적 롤업** — `feedback.md` §8 시점(5개↑/2회 반복/큰 작업 종료/요청)에 `/feedback-review`로 로그를 정리해 사람용 `feedback-report.md`와 AI용 수정안(diff)을 만든다.
- **(D) 반영** — 수정안은 **사용자가 승인한 것만** 역할·워크플로 md에 반영하고, 반영 항목은 상태를 `반영`으로 갱신한다. 매핑 근거는 `feedback.md` §10.

`feedback.md`는 이미 §7·§11에 이 파이프라인을 갖추고 있어 추가 개정이 필요 없다.

## 10. Hooks 설계

`hooks/hooks.json`을 플러그인 루트에 두고 스크립트는 `hooks/scripts/`에 `.mjs`로 두며 `${CLAUDE_PLUGIN_ROOT}`로 참조한다. **실행은 Node(`node`)** — Claude Code가 Node 기반이라 어느 OS(Windows/macOS/Linux)든 동작하고, UTF-8을 기본 처리해 한글 출력이 깨지지 않는다. (이전 PowerShell 판은 OS 종속·인코딩 문제로 폐기.)

### PII·시크릿 차단 hook (PreToolUse) — 검사 범위 분리

대상 도구: `Bash`/`PowerShell`, `Write`, `Edit`. **패턴을 둘로 나눠 검사 범위를 다르게 둔다.**

- **시크릿 패턴 → 모든 도구의 새 내용에서 하드 차단(exit 2)**: 키(`AKIA…`), 개인키 헤더, DB 접속 URL(자격증명 포함), 시크릿/비밀번호 하드코딩. (`old_string`은 검사하지 않음.)
- **명령 실행 패턴 → Bash/PowerShell의 `command`에만 하드 차단**: 인프라 적용·파기, DB 덤프, DDL 류. 문서·코드에서 단어를 "언급"만 한 경우(Write/Edit)는 막지 않는다 → 문서·plan 편집 자기차단 방지.
- **경고만(진행 허용 + 마스킹 안내)** — 전화·카드·주민번호 "패턴". 더미 화이트리스트(`010-0000-0000` 류, `example.com`, `홍길동`)는 통과.

이 hook은 조직 정책의 **강제 계층**이고, §12의 문서 지침은 **권고 계층**이다.

### 완료 점검 hook (Stop, 위험·큰 작업 한정)

작업 종료 시 transcript에 **행위 형태** 위험 신호(`git commit/push`, `git reset --hard`, DDL, `DELETE FROM`, `Remove-Item`, `rm -rf`)가 있으면 1회 block 하고 `workflow.md` §9 완료 보고 형식 + `feedback.md` §6 점검 6질문을 주입한다. 느슨한 명사(배포·결제·권한 등) 단순 언급으로는 발동하지 않는다(과발동 방지). 위험 신호가 없으면 통과. `stop_hook_active` 가드로 무한 루프 차단.

**책임 경계**: 정상 경로에서는 `/workflow`가 완료 보고를 생성한다. 이 hook은 그게 누락됐을 때를 위한 **강제 fallback**이다(중복 점검이 아니라 안전망).

### 피드백 누락 알림 hook

§9 (A)의 교정 신호 알림. 완료 점검 hook에 함께 얹어도 된다.

### hooks.json 예시 스니펫

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Bash|PowerShell|Write|Edit|NotebookEdit",
        "hooks": [ { "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/pii-guard.mjs" } ] }
    ],
    "Stop": [
      { "hooks": [ { "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/completion-check.mjs" } ] }
    ]
  }
}
```

규약: `exit 2`면 동작 차단(stderr가 모델에 전달), JSON `{"decision":"block","reason":"..."}`면 그 사유가 모델에 주입된다.

### feedback-log 운영 주의

`feedback/feedback-log.md`는 세션을 넘어 누적되는 상태 파일이다. ① git 추적 여부를 정한다(피드백에 민감 내용이 섞일 수 있으므로 기본은 `.gitignore` 권장), ② PII 차단 hook이 이 파일 Write를 막지 않도록 경로를 화이트리스트에 둔다.

## 11. 대상 코드베이스 연동 (여러 레포 범용)

이 플러그인은 특정 레포에 매이지 않고 **여러 레포에서 범용으로** 쓴다. 그런데 역할 문서 전체가 "기존 코드/DB/디자인 시스템을 먼저 파악"을 전제하므로(특히 "레거시 추가"가 핵심 흐름), **분석 대상을 어떻게 잡는지** 기준이 없으면 모든 흐름이 공중에 뜬다.

따라서 플러그인은 작업 시작 시 다음 순서로 **분석 대상 핸들**을 잡는다.

1. 설치된 레포의 `CLAUDE.md`(또는 구조 인덱스)를 먼저 읽어 프로젝트 구조·컨벤션·도메인을 파악한다.
2. 요청과 관련된 **관련 파일·테이블·디자인 시스템**을 검색으로 좁힌다(레거시 흐름의 백엔드 분석 진입점).
3. `CLAUDE.md`가 없으면 "대상 파악 불충분"을 미정 사항으로 남기고, 추정 대신 사용자에게 범위를 확인한다.

즉 **레포별 `CLAUDE.md` 존재가 이 플러그인의 전제**다. 이게 없으면 레거시 분석 중심 흐름의 가치가 크게 줄어든다.

## 12. 구성 요소 경계 + 조직 가드레일

| 종류 | 정의 | 이 플러그인의 예 |
| --- | --- | --- |
| `commands/` | 사용자가 부르는 슬래시 명령 | `/workflow`, `/docs`, `/feedback-review` |
| `skills/` | 맥락 자동 발동 역할 지침(얇게, 템플릿 고정) | planner, backend-developer, frontend-developer, (좁은) ui-ux-designer |
| `references/` | 상세 본문(템플릿·원칙), 필요 시 Read | workflow.md, 역할 문서 5종 |
| `agents/` | 격리된 병렬 컨텍스트 | **v1 제외** |

**v1은 commands + skills + references로 시작하고 `agents/`는 제외**한다. 역할을 격리·병렬로 돌려야 할 실제 필요가 생기면 2차 도입한다.

### 조직 정책 가드레일 (권고 계층 — §10 hook의 짝)

`references/backend_developer.md`(§15·§17)에 명문화:

- 운영 DB는 직접 DML/DDL/마이그레이션을 실행하지 않는다 — **작성·리뷰까지가 AI 범위**, 실행은 담당자. 배포·롤백·마이그레이션은 절차서/순서/검증쿼리 형태로 산출한다.
- 인프라 변경은 Terraform 코드/diff/plan만 제시하고 apply는 담당자가 한다.
- 예시·로그의 PII는 더미 데이터/마스킹을 사용한다.

## 13. 플러그인 존재 의의 판단 기준

플러그인이 의미 있으려면 답할 수 있어야 한다.

```text
이 플러그인이 없을 때와 있을 때 AI의 작업 결과가 실제로 달라지는가?
```

이 기준을 **자기 자신에 적용한 결과**가 이번 v1 축소다. 통과하는 것: ① 강제력 있는 hook(PII·시크릿·운영DML 차단), ② 세션 넘는 피드백 파이프라인, ③ 산출물 형식 고정(역할 스킬의 템플릿). 약한 것: 좋은 프롬프트의 텍스트화(역할 원칙 본문), 자주 자동발동해 겹치는 스킬, 독자 1명짜리 HTML 부채.

의미 있는 조건: 반복 지시 감소 / 작업 기준 고정 / 필요 순간에만 세부 읽기(컨텍스트 절약) / 실수·피드백 누적 반영 / 산출물 형식 일관 / 역할·검증 생략 근거 남김.

실격 신호: 좋은 말만 / 발동 조건 불명확 / 너무 자주 자동발동 / 역할 겹침 / 길지만 결과 못 바꿈 / 유지보수 안 해 어긋남.

## 14. 다음 작업 후보

1. 플러그인 이름 확정(`personal-ai-dev-team`)
2. 1차 목록 확정: 명령 6 / 스킬 3(+좁은 ui-ux) / hook 3
3. 각 스킬 `description`(템플릿 보장 전면화) + 각 명령 절차 작성
4. **reference 분할**: 역할 문서를 "템플릿"과 "원칙"으로 잘게 쪼개 컨텍스트 절약
5. **스캐폴딩**: `plugin.json` + SKILL.md(템플릿 중심) + `commands/{workflow,docs,feedback-review,docs-refine,squash,peer-review}.md` + `hooks/hooks.json` + 스크립트(fail-closed) + `feedback/feedback-log.md` 생성
6. **검증**: 한국어 구어체 요청("서버 쪽 좀", "화면 깨졌어")으로 스킬·명령·hook 발동 테스트, 특히 PII 차단·feedback-log 기록 → `/feedback-review` 롤업 흐름과 `/workflow`↔자동발동 순서 확인. `/squash`는 미리보기→승인 흐름, `/peer-review`는 민감정보 차단 동작을 함께 검증
7. 대상 레포의 `CLAUDE.md` 연동 전제 점검(§11)

## 15. 유틸리티 명령 상세 (`/docs-refine`, `/squash`, `/peer-review`)

세 명령 모두 **사용자가 직접 부르는 슬래시 명령**이며, 비가역·외부 영향이 있어 안전장치를 명령 정의에 박는다.

### `/docs-refine` — 문서 재검토·재작성

- **대상**: 플러그인 문서, 역할/워크플로 md 등 지정한 문서.
- **동작**: ① 현황·문제점 비평(중복·누락·모순·낡음) → ② 수정안(diff)을 보여줌 → ③ **사용자 승인 시에만 반영**. 원본을 바로 덮어쓰지 않는다.
- **`/docs`와의 차이**: `/docs`는 인덱스·중복점검·HTML(현황 파악), `/docs-refine`은 비평 후 다시 쓰기(품질 개선). 큰 구조 변경이면 `/docs`로 현황을 먼저 파악한 뒤 `/docs-refine`으로 고친다.

### `/squash` — 본인 커밋 정리

안전장치 4종(모두 필수):

1. **본인 작업만** — 대상은 **실행 시점의 `git config user.email`(현재 설정된 작성자)와 작성자가 일치하는 커밋**으로 한정. 이메일을 문서에 하드코딩하지 않고 런타임에 읽는다. 다른 사람이 작성한 커밋은 절대 포함하지 않는다.
2. **시작 지점 명시 필수** — "어느 커밋부터"를 사용자가 지시하지 않으면 **진행하지 않는다**. 범위를 임의로 추측하지 않는다. (범위는 `<시작 커밋>..HEAD` 형태)
3. **미리보기 먼저** — 합쳐질 커밋 목록과 합쳐진 뒤의 커밋 메시지(안)를 **예시로 보여주고**, 승인 후에만 실행한다.
4. **이미 공유된 커밋 제외** — `origin/<base>..HEAD`처럼 base/업스트림보다 앞선(아직 안 합쳐진) 커밋만 대상. base에 이미 올라간 커밋은 건드리지 않는다.

기술·정책 제약:
- 이 환경은 `git rebase -i`(대화식) 미지원 → **비대화식**(`git reset --soft <시작 커밋>~1` 후 재커밋)으로 합친다.
- **main/master 금지**(조직 정책: main 직접 푸시 금지). feature 브랜치에서만.
- 히스토리 재작성은 비가역 → **푸시는 사용자 확인 후**, force-push는 본인 feature 브랜치에서 명시 승인 시에만. 푸시 전 누군가 브랜치에 푸시했는지 확인.

### `/peer-review` — 외부 AI(Codex) 검토 위임

조직 정책 #5(사내 코드·아키텍처·비즈니스 로직의 외부 서비스 공유 제한)와 직접 관련되므로 **민감정보 차단을 전제로만** 동작한다.

- **sanitize 후 전달** — 전달 전 PII·시크릿·자격증명·DB 접속정보·핵심 비즈니스 로직을 §10 PII hook 기준으로 차단/마스킹한다. 차단 대상이 검토 핵심이면 전달을 중단하고 사용자에게 알린다.
- **전달 범위** — 일반 코드·구조·설계 위주. 운영 DB·고객 데이터·실제 자격증명은 전달하지 않는다.
- **백엔드(현재 Codex) 추상화** — "외부 AI 검토"라는 일반 기능으로 두고, 현재 백엔드는 Codex(로컬 CLI 우선)로 둔다. 다른 AI로 교체 가능하게 설계.
- **결과 처리** — 외부 검토 의견을 받아 요약하고, 반영 여부는 사용자가 판단한다(자동 반영 안 함).
- **주의** — Codex는 OpenAI 외부 서비스다. sanitize로도 가릴 수 없는 민감 작업은 `/peer-review` 대신 내부 검토(`/docs-refine`, 내부 code-review)로 처리한다.
