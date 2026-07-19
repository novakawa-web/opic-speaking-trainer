# 운영 수동 클라우드 백업 준비

이 문서는 GitHub Pages 운영 빌드에서 **수동 업로드 전용** 클라우드 백업을
활성화하기 위한 공개 설정과 안전 조건을 설명한다. 실제 값은 저장소 파일이나
GitHub Actions workflow에 직접 쓰지 않는다.

## 공개 설정을 Repository Variables로 두는 이유

Firebase Web config는 브라우저 번들에 포함되는 공개 식별자다. service account,
private key, access token 같은 서버 비밀정보가 아니므로 GitHub Repository
**Variables**로 전달한다. 이 값만으로 데이터 접근 권한이 생기지는 않는다.
실제 보안 경계는 Firebase Authentication, Security Rules와
`cloudBackupAllowedUsers/{uid}`의 `enabled === true` 조건이다.

다음 값은 절대 Repository Variables에 넣지 않는다.

- service account JSON
- private key
- OAuth access/refresh token
- Firebase CLI token

## 필요한 Repository Variables

GitHub 저장소의 `Settings > Secrets and variables > Actions > Variables`에서 아래
Repository Variables를 등록한다. 이름은 대소문자까지 정확히 일치해야 한다.

| 이름 | 운영 값 정책 |
| --- | --- |
| `VITE_CLOUD_BACKUP_ENABLED` | 활성화 승인 후 `true` |
| `VITE_FIREBASE_USE_EMULATORS` | 운영에서는 반드시 `false` |
| `VITE_FIREBASE_API_KEY` | Firebase Web 앱의 공개 값 |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase Web 앱의 공개 값 |
| `VITE_FIREBASE_PROJECT_ID` | 검증된 Firebase 프로젝트의 공개 값 |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase Web 앱의 공개 값 |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase Web 앱의 공개 값 |
| `VITE_FIREBASE_APP_ID` | Firebase Web 앱의 공개 값 |
| `VITE_FIREBASE_MEASUREMENT_ID` | Firebase Web 앱의 공개 값 |

## 안전한 활성화 조건

클라우드 패널은 다음 조건이 모두 충족될 때만 렌더링된다.

1. `VITE_CLOUD_BACKUP_ENABLED`가 정확히 `true`다.
2. 공개 Firebase Web config 7개가 모두 비어 있지 않다.
3. production 빌드에서 `VITE_FIREBASE_USE_EMULATORS`가 정확히 `false`다.

누락되거나 잘못된 설정이 있으면 클라우드 기능만 비활성화된다. Firebase SDK를
초기화하거나 외부 요청을 보내지 않으며, 기존 로컬 학습 앱은 계속 작동한다.
기능 플래그를 다시 `false`로 배포해도 같은 OFF 경로를 사용한다.

## 현재 기능 범위

- allowlist 허용 계정의 Google 로그인
- 기존 전체 JSON 백업을 사용자가 버튼으로 1회 수동 업로드
- 최근 백업 metadata 목록 조회
- Storage 성공 후 Firestore 실패 시 업로드 파일 정리

다음 기능은 포함하지 않는다.

- 자동 업로드 또는 자동 동기화
- 다운로드, 복원, 병합, 삭제
- localStorage/sessionStorage 갱신
- 자동 재시도

localStorage는 계속 유일한 학습 데이터 원본이다.

## 운영 첫 검증 순서

운영 변수를 등록한 뒤에도 첫 업로드는 실제 학습 데이터가 아닌 격리된 합성
데이터로 정확히 한 번만 수행한다.

1. main 배포 전에 production build와 OFF/ON/누락 설정 검증을 실행한다.
2. PC Chrome에서 Google 로그인, allowlist, 목록 조회까지만 먼저 확인한다.
3. 사용자 확인 후 합성 백업 1건을 수동 업로드한다.
4. 업로드 전후 localStorage raw snapshot이 동일한지 확인한다.
5. Galaxy Chrome/PWA에서 로그인 복귀 경로, 로그인 유지, allowlist와 목록 조회를
   확인한 뒤 합성 백업을 한 번만 수행한다.
6. 오류가 나면 자동 재시도하지 않고 원인을 먼저 확인한다.

GitHub Pages 운영 배포는 main push에서만 실행한다. `workflow_dispatch`나 feature
브랜치에서는 Pages build/deploy job을 실행하지 않는다.
