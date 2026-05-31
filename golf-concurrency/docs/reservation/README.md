# Golf Reservation Concurrency Documents

이 디렉터리는 골프 타석 예약의 동시성 제어를 리뷰하고, 구현하고, 운영하기 위한 문서 모음이다.

## 문서 구성

- [problem.md](./problem.md): 해결해야 하는 비즈니스 문제와 동시성 위험을 정의한다.
- [design.md](./design.md): Redis 락, MariaDB fallback, circuit breaker를 포함한 설계를 설명한다.
- [operations.md](./operations.md): 장애, 타임아웃, 모니터링, 운영 정책을 정리한다.
- [test-plan.md](./test-plan.md): 동시성 및 장애 시나리오 테스트 계획을 정의한다.
- [implementation-plan.md](./implementation-plan.md): 개발 작업을 구현 단위로 분해한다.

아키텍처 의사결정은 [ADR 문서](../adr/0001-golf-reservation-concurrency-control.md)에 별도로 남긴다.

## 리뷰 순서

1. [problem.md](./problem.md)로 문제와 요구사항을 합의한다.
2. [design.md](./design.md)로 정상 흐름과 장애 흐름을 검토한다.
3. [ADR](../adr/0001-golf-reservation-concurrency-control.md)에서 대안과 결정 사유를 확인한다.
4. [test-plan.md](./test-plan.md)으로 정합성 검증 방법을 합의한다.
5. [operations.md](./operations.md)로 장애 대응과 관측 지표를 합의한다.
6. [implementation-plan.md](./implementation-plan.md)으로 개발 태스크를 생성한다.

