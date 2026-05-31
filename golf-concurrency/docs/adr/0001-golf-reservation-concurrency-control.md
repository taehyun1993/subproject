# ADR-0001: Golf Reservation Concurrency Control

## Status

Proposed

## Date

2026-06-01

## Context

골프 예약 서비스는 여러 골프존과 여러 타석을 가진다. 각 타석은 고유 ID를 가지며, 예약은 1분 단위로 가능하다.

핵심 제약은 동일 타석의 예약 시간이 절대 겹치면 안 된다는 것이다. 서로 다른 타석은 같은 시간대 예약이 가능하다.

단순히 `reservation` 테이블에서 중복 예약을 조회한 뒤 insert하는 방식은 동시성 안전하지 않다.

```text
T1: 중복 없음 확인
T2: 중복 없음 확인
T1: insert
T2: insert
```

따라서 같은 타석의 예약 생성 흐름을 직렬화해야 한다.

현재 예약 처리 시간은 약 67ms이며, 서버 6대 기준 단순 계산으로 약 90 TPS 수준을 기대한다. 현재 예약 경쟁은 매우 심하지 않은 것으로 본다.

## Decision

정상 상황에서는 Redis 기반 타석 단위 락을 사용한다.

Redis 장애가 감지되면 circuit breaker를 OPEN하고, Redis 접근을 생략한 뒤 MariaDB `bay_lock` row에 `SELECT ... FOR UPDATE`를 사용하는 fallback 경로로 전환한다.

정상 상황에서 Redis 락과 MariaDB 락을 항상 함께 사용하지는 않는다.

결정 사항:

```text
- Lock granularity: bay_id
- Normal path: Redis SET NX PX + token unlock
- Redis failure path: MariaDB bay_lock SELECT FOR UPDATE
- Redis failure detection: circuit breaker
- Slot-per-minute table: not selected
- Normal path double lock: not selected
```

## Rationale

### Redis lock을 정상 경로로 사용하는 이유

- 분산된 6대 서버 사이에서 같은 타석 요청을 빠르게 직렬화할 수 있다.
- 예약 경쟁이 심하지 않은 현재 상황에서 구현과 성능의 균형이 좋다.
- 정상 상황에서 DB row lock 대기를 줄일 수 있다.

### MariaDB fallback을 두는 이유

- Redis 장애가 예약 기능 전체 중단으로 이어지지 않게 한다.
- Redis 접근 실패 시에도 같은 타석 예약 생성 흐름을 DB transaction으로 직렬화할 수 있다.
- `SELECT FOR UPDATE`는 `COMMIT` 또는 `ROLLBACK` 시 자동으로 락을 해제하므로 장애 해석이 단순하다.

### Circuit breaker를 사용하는 이유

- Redis가 장애인 상황에서 매 요청마다 Redis 락 획득을 오래 시도하면 API 지연이 커진다.
- Redis command timeout과 lock wait timeout을 분리해 장애를 빠르게 감지한다.
- OPEN 상태에서는 Redis 접근을 생략하고 DB fallback으로 바로 진입한다.

## Alternatives Considered

### 1. Reservation slot table

1분 단위로 예약 slot row를 생성하고 `UNIQUE (bay_id, reserved_minute)`로 정합성을 보장하는 방식이다.

장점:

- DB 제약으로 중복 예약을 강하게 막을 수 있다.
- 정합성 설명이 명확하다.

단점:

- 2시간 예약이면 120개 row가 생성된다.
- write amplification이 크다.
- 현재 경쟁 수준에는 과한 설계로 판단된다.

결론:

```text
채택하지 않는다.
```

### 2. Redis lock only

정상/장애 상황 모두 Redis 락만 사용하는 방식이다.

장점:

- 단순하고 빠르다.
- DB 락이 필요 없다.

단점:

- Redis 장애 시 예약 기능을 유지하기 어렵다.
- Redis 장애가 곧 정합성 또는 가용성 문제로 이어질 수 있다.

결론:

```text
부분 채택한다.
정상 경로에서는 Redis lock을 사용하지만, 장애 fallback은 MariaDB로 둔다.
```

### 3. Redis lock + MariaDB SELECT FOR UPDATE always

모든 정상 요청에서 Redis 락과 DB row lock을 모두 사용하는 방식이다.

장점:

- 정합성 설명이 가장 강하다.
- Redis 락이 깨지는 예외 상황에서도 DB가 최종 방어선이 된다.

단점:

- 중복 락 구조가 된다.
- 정상 상황에서도 DB lock 비용이 발생한다.
- 현재 경쟁 수준에서는 과할 수 있다.

결론:

```text
채택하지 않는다.
```

### 4. MariaDB SELECT FOR UPDATE only

Redis 없이 DB row lock만 사용하는 방식이다.

장점:

- 구조가 단순하다.
- 트랜잭션이 락 생명주기를 관리한다.

단점:

- 모든 예약 요청이 DB lock 경합으로 바로 들어간다.
- 분산 서버 앞단에서 경합을 줄일 수 없다.

결론:

```text
fallback 경로로만 채택한다.
```

### 5. Redisson RLock

Redisson의 고수준 분산락 API를 사용하는 방식이다.

장점:

- `tryLock`, lease time, watchdog 등 락 기능을 제공한다.
- 직접 Lua unlock과 TTL 갱신을 구현하는 부담이 줄어든다.

단점:

- 추상화가 두꺼워 장애 동작을 정확히 이해해야 한다.
- 현재 설계는 Redis command timeout, token unlock, circuit breaker, DB fallback을 명시적으로 통제하는 쪽을 우선한다.

결론:

```text
초기 구현에서는 채택하지 않는다.
필요 시 대안으로 재검토한다.
```

## Consequences

긍정적 결과:

- 정상 경로가 빠르고 단순하다.
- Redis 장애 시에도 DB fallback으로 예약 기능을 유지할 수 있다.
- lock 단위가 `bay_id`라 서로 다른 타석 예약은 병렬 처리 가능하다.
- circuit breaker로 Redis 장애가 API 지연으로 전파되는 것을 줄인다.

비용:

- 정상 경로와 fallback 경로가 나뉘므로 테스트 범위가 늘어난다.
- circuit breaker 상태 관리가 필요하다.
- 모든 예약 생성 경로가 반드시 이 정책을 통과하도록 코드 경계를 관리해야 한다.
- Redis lock TTL, command timeout, DB lock wait timeout의 운영 튜닝이 필요하다.

## Follow-up Work

- 실제 트래픽 기반으로 Redis lock TTL과 timeout 조정
- 동시성 테스트 자동화
- Redis 장애 주입 테스트
- DB fallback 부하 테스트
- 운영 지표와 알림 구성

