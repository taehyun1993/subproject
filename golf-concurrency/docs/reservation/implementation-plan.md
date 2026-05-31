# Golf Reservation Implementation Plan

## 1. 개발 원칙

- 정상 경로는 Redis 락으로 단순하게 유지한다.
- Redis 장애 경로는 MariaDB `SELECT FOR UPDATE` fallback으로 분리한다.
- 중복 예약 검사는 모든 경로에서 동일한 쿼리 또는 동일한 repository 메서드를 사용한다.
- 예약 생성 경로가 락 정책을 우회하지 않도록 application service 경계를 명확히 한다.

## 2. Data Model

### 2.1 reservation

기존 예약 테이블이 없다면 최소 컬럼은 다음과 같다.

```sql
CREATE TABLE reservation (
    id BIGINT NOT NULL PRIMARY KEY,
    bay_id BIGINT NOT NULL,
    start_at DATETIME(6) NOT NULL,
    end_at DATETIME(6) NOT NULL,
    status VARCHAR(30) NOT NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL
);
```

권장 인덱스:

```sql
CREATE INDEX idx_reservation_bay_time
ON reservation (bay_id, start_at, end_at);
```

상태 조건까지 자주 사용한다면 다음 인덱스도 검토한다.

```sql
CREATE INDEX idx_reservation_bay_status_time
ON reservation (bay_id, status, start_at, end_at);
```

### 2.2 bay_lock

```sql
CREATE TABLE bay_lock (
    bay_id BIGINT NOT NULL PRIMARY KEY,
    updated_at DATETIME(6) NOT NULL
);
```

타석 생성 시 `bay_lock` row도 함께 생성한다.

## 3. Components

### 3.1 ReservationApplicationService

역할:

```text
- 예약 요청의 전체 use case 조율
- circuit state에 따라 normal path 또는 fallback path 선택
- 사용자에게 반환할 결과 결정
```

### 3.2 RedisBayLock

역할:

```text
- SET NX PX 기반 lock acquire
- lock wait timeout까지 retry
- token 기반 Lua unlock
- Redis command timeout 예외를 상위로 전달
```

### 3.3 RedisCircuitBreaker

역할:

```text
- Redis 실패율 또는 연속 실패 횟수 기록
- CLOSED, OPEN, HALF_OPEN 상태 관리
- OPEN 상태에서 Redis 접근 차단
```

라이브러리 후보:

```text
- Resilience4j CircuitBreaker
- 직접 구현
```

운영 가시성과 검증 편의성을 고려하면 Resilience4j를 우선 검토한다.

### 3.4 ReservationRepository

역할:

```text
- overlap check
- reservation insert
```

중복 검사 조건:

```sql
WHERE bay_id = :bay_id
  AND status IN ('RESERVED', 'PAID')
  AND start_at < :new_end_at
  AND end_at > :new_start_at
```

### 3.5 BayLockRepository

역할:

```text
- fallback transaction에서 bay_lock row SELECT FOR UPDATE
```

예시:

```sql
SELECT bay_id
FROM bay_lock
WHERE bay_id = :bay_id
FOR UPDATE;
```

## 4. Normal Path Pseudocode

```java
ReservationResult reserve(ReservationCommand command) {
    if (redisCircuitBreaker.isOpen()) {
        return reserveWithDbFallback(command);
    }

    LockToken token = null;

    try {
        token = redisBayLock.tryAcquire(
            command.bayId(),
            lockWaitTimeout,
            lockTtl
        );

        if (token == null) {
            return ReservationResult.retryableFailure();
        }

        return createReservationWithoutDbLock(command);
    } catch (RedisAccessException e) {
        redisCircuitBreaker.recordFailure(e);
        return reserveWithDbFallback(command);
    } finally {
        if (token != null) {
            redisBayLock.unlock(command.bayId(), token);
        }
    }
}
```

주의:

- `createReservationWithoutDbLock`은 Redis lock을 이미 획득한 상태에서만 호출한다.
- method visibility를 제한하거나 package boundary를 둬서 우회 호출을 막는다.

## 5. DB Fallback Pseudocode

```java
@Transactional
ReservationResult reserveWithDbFallback(ReservationCommand command) {
    bayLockRepository.selectForUpdate(command.bayId());

    boolean exists = reservationRepository.existsOverlapping(
        command.bayId(),
        command.startAt(),
        command.endAt()
    );

    if (exists) {
        return ReservationResult.conflict();
    }

    reservationRepository.insert(command);
    return ReservationResult.success();
}
```

DB fallback transaction에는 Redis 접근이나 외부 API 호출을 넣지 않는다.

## 6. Implementation Tasks

1. 예약 시간 구간 value object 구현
2. overlap check repository 구현
3. Redis lock component 구현
4. token 기반 Lua unlock 구현
5. Redis timeout 설정 추가
6. circuit breaker 적용
7. `bay_lock` migration 추가
8. 타석 생성 시 `bay_lock` row 생성
9. DB fallback transaction 구현
10. 정상 경로와 fallback 경로 통합
11. 동시성 테스트 추가
12. Redis 장애 테스트 추가
13. metrics/logging 추가
14. 운영 알림 기준 추가

## 7. Review Checklist

- [ ] 같은 `bay_id`에 대한 lock key가 일관적인가?
- [ ] lock token이 매 요청마다 충분히 랜덤한가?
- [ ] unlock이 Lua script로 token 검증 후 삭제하는가?
- [ ] Redis command timeout과 lock wait timeout이 분리되어 있는가?
- [ ] circuit OPEN 상태에서 Redis 접근을 생략하는가?
- [ ] DB fallback이 하나의 transaction 안에서 수행되는가?
- [ ] `SELECT FOR UPDATE` 이후 overlap check와 insert가 실행되는가?
- [ ] transaction 안에 외부 API 호출이 없는가?
- [ ] 모든 예약 생성 경로가 application service를 통과하는가?
- [ ] 동시성 테스트가 실패를 재현할 수 있는가?

