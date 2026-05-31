---
description: 누적된 feedback-log.md를 주기적으로 롤업해 사람용 요약과 문서 수정안을 만든다.
---

`feedback/feedback-log.md`를 읽어 누적 피드백을 롤업한다(`references/feedback.md` §8·§11 기준).

1. 반복 패턴을 추출한다(같은 문제 2회 이상, 5개 이상 누적 등).
2. **사람용 요약**: `feedback/feedback-report.md`를 생성/갱신한다 — 무엇이 반복되는지, 권장 개선.
3. **AI용 수정안**: `references/workflow.md` / 역할 문서 / SKILL.md 에 대한 수정안(diff)을 제시한다. 어느 문제를 어느 문서에 반영할지는 `references/feedback.md` §10 표를 근거로 한다.
4. 수정안은 **사용자가 승인한 것만 반영**한다. 기준 문서를 말없이 바꾸지 않는다.
5. 반영된 로그 항목은 상태를 `반영`으로 갱신한다.

일회성 이슈는 보류로 두고, 문서 반영이 부적절하면 사용자 작업 방식 개선 제안으로 남긴다.
