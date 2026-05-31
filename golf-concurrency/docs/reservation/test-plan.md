# Golf Reservation Concurrency Test Plan

## 1. 테스트 목표

동시 요청, Redis 장애, DB fallback 상황에서도 동일 타석의 겹치는 예약이 생성되지 않는지 검증한다.

## 2. 테스트 분류

- Unit test: 시간 구간 충돌 조건, Redis lock component, circuit breaker 정책
- Integration test: Redis, MariaDB를 포함한 예약 흐름
- Concurrency test: 같은 타석에 대한 동시 요청
- Failure test: Redis 장애, timeout, transaction rollback

## 3. Time Overlap Test

기존 예약:

```text
bay_id = 1
start_at = 10:00
end_at = 11:00
```

테스트 케이스:

| 요청 구간 | 기대 결과 |
| --- | --- |
| 09:00 ~ 10:00 | success |
| 10:00 ~ 10:30 | conflict |
| 10:30 ~ 11:30 | conflict |
| 10:59 ~ 11:30 | conflict |
| 11:00 ~ 12:00 | success |

검증 포인트:

```text
existing.start_at < new_end_at
AND existing.end_at > new_start_at
```

## 4. Redis Lock Test

### 4.1 락 획득 성공

조건:

```text
lock key 없음
```

기대:

```text
SET key token NX PX ttl 성공
예약 로직 진입
```

### 4.2 락 획득 실패 후 재시도

조건:

```text
다른 요청이 같은 bay_id lock 보유
```

기대:

```text
lock wait timeout 전까지 재시도
락 획득 시 예약 로직 진입
```

### 4.3 lock wait timeout

조건:

```text
같은 bay_id lock이 계속 유지됨
```

기대:

```text
최대 10초 대기 후 retryable failure
예약 insert 없음
```

### 4.4 token 기반 unlock

조건:

```text
현재 Redis key value != 내 token
```

기대:

```text
Lua unlock 결과 0
다른 요청의 lock 삭제 안 됨
```

## 5. Normal Concurrency Test

### 5.1 같은 타석 같은 시간 동시 예약

조건:

```text
N개 요청이 같은 bay_id, 같은 시간 구간으로 동시에 예약 요청
Redis 정상
```

기대:

```text
성공 1건
나머지 conflict 또는 retryable failure
중복 예약 없음
```

### 5.2 같은 타석 일부 겹치는 시간 동시 예약

조건:

```text
T1: 10:00 ~ 11:00
T2: 10:30 ~ 11:30
```

기대:

```text
둘 중 하나만 성공
다른 하나는 conflict
```

### 5.3 같은 타석 인접 시간 동시 예약

조건:

```text
T1: 10:00 ~ 11:00
T2: 11:00 ~ 12:00
```

기대:

```text
둘 다 성공 가능
```

### 5.4 다른 타석 같은 시간 동시 예약

조건:

```text
T1: bay_id = 1, 10:00 ~ 11:00
T2: bay_id = 2, 10:00 ~ 11:00
```

기대:

```text
둘 다 성공 가능
서로 다른 lock key 사용
```

## 6. Redis Failure Test

### 6.1 Redis command timeout

조건:

```text
Redis command timeout 발생
```

기대:

```text
circuit failure count 증가
임계치 초과 시 OPEN
DB fallback 진입
```

### 6.2 Circuit OPEN 상태

조건:

```text
circuit state = OPEN
```

기대:

```text
Redis lock 시도 없음
MariaDB SELECT FOR UPDATE fallback 사용
```

### 6.3 Fallback 동시 예약

조건:

```text
Redis 장애
N개 요청이 같은 bay_id, 같은 시간 구간으로 동시에 예약 요청
```

기대:

```text
bay_lock SELECT FOR UPDATE로 직렬화
성공 1건
나머지 conflict
중복 예약 없음
```

## 7. DB Fallback Test

### 7.1 SELECT FOR UPDATE lock wait

조건:

```text
T1이 bay_lock row lock 보유
T2가 같은 bay_id로 fallback 진입
```

기대:

```text
T2는 T1 commit/rollback까지 대기
T1 commit 후 T2가 overlap check 수행
```

### 7.2 DB lock wait timeout

조건:

```text
T1이 lock을 오래 보유
T2의 innodb_lock_wait_timeout 초과
```

기대:

```text
T2 실패
예약 insert 없음
retryable failure
```

### 7.3 transaction rollback

조건:

```text
overlap check 후 insert 중 예외 발생
```

기대:

```text
ROLLBACK
bay_lock row lock 자동 해제
reservation insert 없음
```

## 8. Regression Criteria

릴리즈 전 최소 통과 기준:

```text
- 동일 bay_id 겹치는 시간 동시 예약에서 중복 예약 0건
- 다른 bay_id 같은 시간 예약은 동시에 성공 가능
- Redis 장애 시 DB fallback으로 중복 예약 0건
- token mismatch unlock이 다른 락을 삭제하지 않음
- DB lock wait timeout에서 예약 insert가 발생하지 않음
```

