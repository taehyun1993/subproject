---
description: 현재 디렉토리의 md 문서를 정리하고 인덱스·중복점검·HTML 대시보드를 만든다(현황 파악).
argument-hint: [대상 디렉토리(생략 시 현재)]
---

대상: $ARGUMENTS (생략 시 현재 디렉토리)

문서 **현황 파악**을 한다. 비평 후 재작성이 목적이면 `/docs-refine`을 쓴다.

1. `.md` 목록과 각 문서의 목적을 요약한다.
2. 문서 간 관계를 정리한다(라우터/세부기준/개선루프 등).
3. 중복·누락·충돌 내용을 찾아 텍스트로 보고한다.
4. 역할별 변경 이력을 모아 작업 단위 추적을 보조한다.
5. 요청 시 확인용 HTML 대시보드를 생성한다(Overview / Workflow Map / Role Cards / Document Relationships / Completion Checklist / Plugin Readiness).

**원본 md가 진실의 원천**이고 HTML은 보조 뷰다(stale 가능). 원본을 수정하지 않는다.
