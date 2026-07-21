# 수동 클라우드 백업 운영 Runbook

이 문서는 GitHub Pages 운영 앱의 Firebase 수동 전체 백업을 점검하고 장애에 대응하는 절차다. 제품 소개와 로컬 실행은 [README.md](README.md), 내부 코드·저장 구조는 [CODEX_CONTEXT.md](CODEX_CONTEXT.md)를 참고한다.

실제 Firebase 설정값, 사용자 식별자, 백업 ID·경로·전체 해시와 백업 내용은 이 문서나 저장소에 기록하지 않는다.

## 1. 현재 운영 범위

구현된 범위:

- Google Authentication 로그인·로그아웃
- `cloudBackupAllowedUsers/{uid}` 문서의 `enabled === true` allowlist 확인
- 사용자가 버튼을 한 번 누르는 수동 AppBackupV1 JSON 업로드
- 사용자별 Firebase Storage JSON
- Firestore 백업 metadata
- 업로드 전후 byteSize·SHA-256·schema version 검증
- Storage 성공 후 후속 단계 실패 시 업로드 파일 cleanup
- 최근 백업 metadata 목록 최신순 조회
- 진행 단계와 실패 지점 진단

구현하지 않은 범위:

- 클라우드 파일 다운로드
- 클라우드 복원과 로컬 적용
- 기기 데이터 병합
- 백업 삭제 UI
- 자동 업로드와 자동 재시도
- 자동 동기화

localStorage는 계속 유일한 학습 데이터 원본이다. 클라우드 파일은 사용자가 명시적으로 만든 복사본이며 앱에 자동 적용되지 않는다.

## 2. 정상 운영 절차

1. 운영 Pages의 관리 및 백업에서 Google로 로그인한다.
2. 계정 카드에 로그인 정보가 표시되고 권한 없음 안내가 없는지 확인한다.
3. allowlist 확인이 끝나 수동 백업 버튼이 활성화됐는지 확인한다.
4. 필요하면 식별 가능한 기기 이름을 입력한다. 개인정보는 넣지 않는다.
5. 현재 최근 백업 건수를 기록한다.
6. **백업 버튼을 정확히 한 번** 누른다. 진행 중 다시 누르지 않는다.
7. 준비, SHA 계산, Storage 업로드, Storage 검증, Firestore metadata 기록, 목록 갱신 순서를 확인한다.
8. 성공 문구와 최근 목록이 정확히 한 건 증가했는지 확인한다.
9. 읽기 전용 점검으로 Firestore metadata와 Storage JSON이 한 쌍인지 확인한다.
10. 업로드 전후 로컬 학습 데이터가 바뀌지 않았는지 확인한다.

성공 여부가 불명확하면 추가 업로드를 하지 않고 진단 정보와 Firebase의 현재 건수부터 확인한다.

## 3. 업로드 파이프라인과 진단 단계

| 단계 | 의미 | 실패 시 우선 확인 |
| --- | --- | --- |
| `backup-preparation` | 현재 AppBackupV1 생성·검증 | JSON 생성, 10MB 제한, 브라우저 메모리 |
| `sha-calculation` | byteSize와 SHA-256 계산 | Web Crypto 지원과 중단 여부 |
| `storage-upload` | 새 JSON object 업로드 | 로그인, allowlist, Storage Rules, bucket, 네트워크 |
| `storage-verification` | Storage metadata의 크기·SHA·schema 확인 | custom metadata와 실제 object |
| `firestore-metadata-write` | 최근 목록용 metadata 생성 | Firestore Rules, 필드 검증, 로그인 |
| `storage-cleanup` | 후속 실패 후 생성 파일 제거 | 삭제 권한과 고아 파일 여부 |
| `list-refresh` | 최근 목록 한 번 갱신 | Firestore 목록 권한과 네트워크 |
| `success` | 업로드와 metadata 기록 완료 | 목록·Storage 짝 무결성 확인 |

진단 정보는 현재 컴포넌트 메모리에만 유지한다. UID, 이메일, 전체 backup ID·Storage 경로·SHA-256, Firebase 설정값, 토큰과 백업 본문을 로그나 복사 텍스트에 넣지 않는다.

## 4. 오류 대응과 재시도 정책

### Backup preparation

- 백업 검증 또는 10MB 제한 실패를 먼저 해결한다.
- 같은 데이터를 즉시 다시 올리지 않는다.
- 로컬 JSON 전체 백업이 정상 생성되는지 별도로 확인한다.

### Storage upload

- `permission-denied`, `unauthorized`, forbidden 계열이면 추가 업로드를 중단한다.
- Auth 로그인, allowlist, Web config bucket, 활성 Storage Rules와 교차 서비스 IAM을 확인한다.
- Storage object가 생기지 않았다면 cleanup은 필요 없다.

### Storage verification

- 업로드된 파일의 byteSize, SHA-256, content type과 schema custom metadata 불일치다.
- 자동 재시도하지 않는다.
- cleanup 성공 여부와 고아 파일을 확인한 뒤 구현·설정 원인을 조사한다.

### Firestore metadata

- Storage object는 만들어졌지만 metadata 생성이 실패한 상태일 수 있다.
- 앱은 Storage 파일 cleanup을 시도한다.
- cleanup 결과를 확인하기 전 추가 업로드를 금지한다.

### Cleanup

- cleanup 성공이면 생성된 Storage 파일이 제거됐는지 읽기 전용으로 확인한다.
- cleanup 실패면 고아 파일 가능성이 있으므로 추가 업로드를 중단하고 관리자 확인을 진행한다.
- 삭제가 필요해도 원인과 대상을 확인한 사용자가 Firebase Console에서 명시적으로 처리한다.

### Network

- Storage 또는 Firestore의 명확한 네트워크 계열 오류만 사용자 버튼으로 재시도할 수 있다.
- 인터넷 연결과 로그인 상태를 확인한 뒤 한 번만 재시도한다.
- 자동 재시도는 없다.

### Permission denied / unauthorized

- 재시도 버튼을 제공하지 않는 차단 오류다.
- allowlist, Rules, IAM, bucket과 Auth 상태를 먼저 확인한다.

### Abort

- 화면 이탈, 로그아웃 또는 명시적 중단으로 처리한다.
- 자동으로 이어서 실행하지 않는다.
- Storage 생성 여부와 cleanup 결과가 불명확하면 Firebase 건수를 먼저 확인한다.

## 5. 백업 무결성 점검

백업 내용을 열지 않고 다음 metadata만 비교한다.

| 검사 | 정상 기준 |
| --- | --- |
| backup ID | Firestore document와 Storage custom metadata가 같은 항목을 가리킴 |
| 경로 | Firestore `storagePath`와 실제 object 위치가 일치 |
| byteSize | Firestore 값과 Storage object 크기가 일치 |
| SHA-256 | Firestore와 Storage custom metadata가 일치 |
| schemaVersion | 양쪽이 AppBackupV1 schema 1로 일치 |
| 생성 시각 | Storage 생성 시각과 Firestore 업로드 시각이 합리적으로 가까움 |
| exportedAt | 업로드 시각보다 늦지 않음 |
| summary | 카드·메모·지문 개수가 음수가 아니며 현재 데이터 규모에서 합리적임 |
| 고아·중복 | metadata 없는 object, object 없는 metadata, 동일 ID 중복이 없음 |

2026-07-21 수동 운영 검증에서는 한 쌍의 metadata와 JSON에 대해 ID·경로·크기·SHA-256·schema·시각 관계가 일치했고 고아·중복이 없었다. 실제 식별자와 JSON 내용은 열람하거나 문서화하지 않았다.

## 6. 보안 경계

### Repository Variables

Firebase Web config는 브라우저 번들에 포함되는 공개 식별자이므로 GitHub Repository Variables에서 production build로 전달한다. 실제 값은 소스, workflow와 문서에 하드코딩하지 않는다.

Repository Variables는 GitHub 저장소의 `Settings > Secrets and variables > Actions > Variables`에서 관리한다.

필요한 변수 이름:

- `VITE_CLOUD_BACKUP_ENABLED`
- `VITE_FIREBASE_USE_EMULATORS`
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_MEASUREMENT_ID`

`.env.local`은 Git에서 제외한다. service account JSON, private key, OAuth access/refresh token과 Firebase CLI token은 Repository Variables에도 넣지 않는다.

### Authentication과 allowlist

- 사용자는 Google Authentication으로 로그인한다.
- 클라이언트는 자신의 `cloudBackupAllowedUsers/{uid}` 단건만 읽을 수 있다.
- `enabled`가 boolean `true`인 사용자만 자신의 백업 목록과 Storage 경로를 사용할 수 있다.
- allowlist 문서의 list·client write는 거부한다.

### Firestore와 Storage Rules

- Firestore는 자기 사용자 경로의 create/get/제한된 list만 허용하고 update·delete를 거부한다.
- Storage는 자기 사용자 경로의 새 JSON만 허용하며 content type, 10MB, ID, schema와 SHA 형식을 검사한다.
- 더 넓은 fallback 경로는 모두 거부한다.
- Storage Rules의 `firestore.exists/get`은 `(default)` database의 allowlist를 조회한다.
- Firebase Storage service agent에는 기본 `Firebase Storage Service Agent` 역할과 `Firebase Rules Firestore Service Agent` 역할이 함께 필요하다. principal 전체 주소나 project number는 문서화하지 않는다.

Rules 변경 전에는 Firestore·Storage Emulator를 실행하고 다음을 별도로 수행한다.

```powershell
npm.cmd run test:cloud-rules
```

현재 Rules 검증은 22개이며 인증 전 거부, 자기 경로 허용, 다른 사용자 경로 거부, allowlist, content type, 10MB와 허용 외 경로 거부를 포함한다.

## 7. 설정 누락과 기능 OFF

클라우드 패널은 다음 조건을 모두 충족해야 활성화된다.

1. `VITE_CLOUD_BACKUP_ENABLED=true`
2. Firebase Web config 7개가 모두 존재
3. production에서 `VITE_FIREBASE_USE_EMULATORS=false`

production 빌드에서 `VITE_FIREBASE_USE_EMULATORS`가 정확히 `false`여야 하며, 다른 값이거나 누락되면 클라우드 기능을 활성화하지 않는다.

설정이 누락되거나 production Emulator 값이 안전 조건과 다르면 클라우드 기능만 비활성화된다. Firebase SDK 초기화와 외부 요청 없이 기존 학습 앱은 계속 작동해야 한다.

### 긴급 비활성화

1. GitHub Repository Variable `VITE_CLOUD_BACKUP_ENABLED`를 `false`로 바꾼다.
2. 변수 변경만으로는 Pages가 다시 빌드되지 않으므로 승인된 새 `main` build/deploy를 실행한다.
3. Actions의 테스트, build와 PWA 검증 성공을 확인한다.
4. 운영 앱의 service worker 업데이트를 적용한다.
5. 계정 및 클라우드 백업 패널이 보이지 않는지 확인한다.
6. Firebase 초기화와 관련 외부 네트워크 요청이 0건인지 확인한다.
7. 기존 로컬 카드·학습·TSV·JSON 기능이 정상인지 확인한다.

비활성화는 Firebase 데이터나 Rules를 삭제하지 않는다.

## 8. 배포 전후 점검

배포 전:

- `npm.cmd run test:all`
- 필요 시 실행 중인 Emulator에서 `npm.cmd run test:cloud-rules`
- `npm.cmd run build`
- `npm.cmd run test:pwa`
- `git diff --check`
- production Emulator가 꺼져 있는지 확인
- 실제 설정값과 사용자 식별자가 diff·산출물 보고에 노출되지 않는지 확인

배포 후:

- Pages와 manifest, service worker, `404.html` HTTP 200
- 새 service worker 업데이트 적용
- 로그인·로그아웃과 allowlist
- 최근 목록 조회
- 업로드 중 중복 클릭 방지
- 진행·실패 진단 UI
- 성공 후 목록 갱신 정확히 한 번
- localStorage/sessionStorage 불변
- 콘솔 오류·경고와 불필요한 Firebase 쓰기 없음

실제 업로드 검증은 사전에 승인된 계정과 데이터로 정확히 한 번 수행한다. 성공·실패와 관계없이 반복 클릭하지 않는다.

## 9. 아직 결정하지 않은 운영 정책

- 사용자별 백업 보존 개수
- 백업 보존 기간과 자동 만료
- 사용자의 백업 삭제 요청 절차
- 계정 탈퇴와 Firebase 데이터 삭제 절차
- App Check 도입과 enforcement 시점
- 클라우드 다운로드·복원 UX
- 기기 간 수동 병합과 충돌 해결
- 비용 증가 시 경고와 업로드 제한 정책

이 항목은 구현 전에 데이터 보존·복구·비용 정책을 먼저 결정한다. 자동 동기화는 충분한 수동 복원과 충돌 검증 이후의 별도 단계다.
