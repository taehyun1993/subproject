# Golf Reservation Operations Guide

## 1. 운영 목표

이 문서는 예약 동시성 제어를 운영할 때 확인해야 할 타임아웃, 장애 전환, 모니터링 지표를 정의한다.

목표:

- Redis 장애가 예약 API 전체 장애로 번지지 않게 한다.
- 같은 타석의 중복 예약을 방지한다.
- 장애 상황에서 실패 원인을 관측 가능하게 만든다.
- 락 대기와 트랜잭션 시간이 비정상적으로 길어지지 않게 한다.

## 2. Timeout Policy

초기값은 운영 지표를 기반으로 조정한다.

| 항목 | 의미 | 초기 권장값 |
| --- | --- | --- |
| Redis command timeout | Redis 명령 1회의 최대 응답 대기 시간 | 50ms ~ 200ms |
| Redis lock wait timeout | Redis가 정상일 때 락 획득을 재시도하는 최대 시간 | 10s |
| Redis lock TTL | 락 소유 서버 장애 시 자동 해제 시간 | P99 처리 시간 + 여유 |
| DB lock wait timeout | `SELECT FOR UPDATE` row lock 대기 시간 | 3s |
| Reservation transaction timeout | 예약 트랜잭션 최대 수행 시간 | 1s ~ 3s |

주의:

```text
Redis command timeout != Redis lock wait timeout != Redis lock TTL
```

Redis command timeout은 Redis 장애를 빠르게 감지하기 위한 값이다. Redis lock wait timeout은 Redis가 정상일 때 다른 요청의 락 해제를 기다리는 값이다.

## 3. Circuit Breaker Policy

Circuit breaker는 Redis 접근 실패가 반복될 때 OPEN 상태로 전환한다.

초기 정책 예시:

```text
Failure condition:
- Redis command timeout
- Redis connection failure
- Redis command execution failure

Open condition:
- 최근 N초 동안 실패율이 임계치 초과
- 또는 연속 실패 횟수가 임계치 초과

Open duration:
- 5s ~ 30s

Half-open trial:
- 제한된 요청만 Redis lock 시도
- 성공하면 CLOSED
- 실패하면 OPEN 유지
```

정확한 수치는 실제 트래픽과 Redis 운영 환경에 맞춰 조정한다.

## 4. Failure Responses

예약 API는 실패 원인에 따라 응답을 구분해야 한다.

| 상황 | 의미 | 권장 응답 |
| --- | --- | --- |
| 예약 시간 충돌 | 이미 겹치는 예약 존재 | conflict |
| Redis lock wait timeout | 같은 타석 예약 요청이 길게 대기 중 | retryable failure |
| Redis 장애 + DB fallback 성공 | 장애 중이지만 예약 성공 | success |
| DB lock wait timeout | DB fallback에서도 같은 타석 경합 지속 | retryable failure |
| DB transaction failure | DB 오류 | failure |

응답 메시지는 사용자에게 내부 구현을 노출하지 않는다. 예를 들어 "예약 요청이 많아 처리하지 못했습니다. 잠시 후 다시 시도해주세요." 정도로 표현한다.

## 5. Required Metrics

필수 지표:

```text
reservation.request.count
reservation.success.count
reservation.conflict.count
reservation.failure.count
reservation.latency

redis.lock.acquire.success.count
redis.lock.acquire.timeout.count
redis.lock.acquire.latency
redis.lock.command.failure.count
redis.lock.unlock.failure.count

circuit.redis.state
circuit.redis.open.count
circuit.redis.half_open.success.count
circuit.redis.half_open.failure.count

db.fallback.count
db.lock.wait.latency
db.lock.timeout.count
db.transaction.latency
```

## 6. Required Logs

예약 실패나 fallback 발생 시 다음 정보는 구조화 로그로 남긴다.

```text
- request_id
- bay_id
- start_at
- end_at
- redis_circuit_state
- redis_lock_acquired
- redis_error_type
- fallback_used
- db_lock_wait_ms
- reservation_result
```

주의:

- 개인정보는 남기지 않는다.
- lock token은 원칙적으로 로그에 남기지 않는다.
- 장애 분석에 필요한 correlation id는 반드시 포함한다.

## 7. Alerts

알림 조건 예시:

```text
- Redis circuit OPEN 상태가 일정 시간 이상 지속
- Redis command failure 급증
- Redis lock wait timeout 급증
- DB fallback 사용량 급증
- DB lock wait timeout 발생
- reservation conflict 비율 급증
- reservation latency P95/P99 급증
```

## 8. Runbook

### 8.1 Redis circuit OPEN 알림 발생

확인 순서:

1. Redis 인스턴스 상태를 확인한다.
2. API 서버에서 Redis command timeout이 증가했는지 확인한다.
3. DB fallback count와 DB lock wait latency를 확인한다.
4. 예약 성공률이 유지되는지 확인한다.
5. Redis 복구 후 circuit이 CLOSED로 복귀하는지 확인한다.

### 8.2 DB lock timeout 증가

확인 순서:

1. 특정 `bay_id`에 요청이 몰리는지 확인한다.
2. 예약 트랜잭션 시간이 증가했는지 확인한다.
3. 트랜잭션 안에 외부 API 호출이나 느린 작업이 들어갔는지 확인한다.
4. DB slow query와 lock wait event를 확인한다.

### 8.3 중복 예약 의심

확인 순서:

1. 중복으로 보이는 예약의 `bay_id`, `start_at`, `end_at`, `status`를 확인한다.
2. 해당 시점의 Redis circuit state를 확인한다.
3. 예약 생성 API 외 다른 경로에서 reservation insert가 있었는지 확인한다.
4. unlock 실패, TTL 만료, DB fallback 사용 여부를 확인한다.
5. 재현 가능한 테스트 케이스를 만든 뒤 동시성 테스트에 추가한다.

