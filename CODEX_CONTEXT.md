# OPIc Speaking Trainer - Codex 인수인계

> 마지막 확인: 2026-07-21 (Asia/Seoul)
>
> 기준 브랜치: `main`
>
> 기준 커밋: `cf1ce51cd19ec2781e229150ab36b2051d030926`

이 문서는 새 Codex 대화에서 가장 먼저 읽는 현재 코드 구조와 작업 규칙의 source of truth다. 프로젝트 소개와 실행 방법은 [README.md](README.md), Firebase 운영 절차는 [CLOUD_BACKUP_OPERATIONS.md](CLOUD_BACKUP_OPERATIONS.md)를 우선한다.

## 1. 프로젝트와 운영 상태

- 개인용 OPIc 말하기 학습 PWA다.
- 기술 스택은 React, TypeScript, Vite, 일반 CSS, Web Speech API, MediaRecorder, Firebase Web SDK다.
- 저장소: <https://github.com/novakawa-web/opic-speaking-trainer>
- 운영 앱: <https://novakawa-web.github.io/opic-speaking-trainer/>
- production Vite base는 `/opic-speaking-trainer/`, 개발 base는 `/`다.
- 기본 카드 소스는 12장이지만 활성 카드 데이터셋은 TSV 사용에 따라 달라진다. 운영 카드 수를 코드 상수처럼 문서화하지 않는다.
- 2026-07-21 확인 시 운영 URL, `manifest.webmanifest`, `sw.js`, `404.html`은 HTTP 200이었다.
- 최신 확인 Pages workflow는 commit `cf1ce51cd19ec2781e229150ab36b2051d030926`에서 성공했다. `test:all` 545/545와 PWA/Pages 검증이 통과했다.

## 2. 구현된 사용자 흐름

### 카드와 학습

- 홈의 빠른 시작, 학습 카드 요약, 카드 라이브러리
- 덱·태그·`final_rep`·어려운 카드·첫 문장 전용/전체 답변·보관 상태 필터
- 카드 라이브러리 20장 단위 표시와 세션 내 필터·스크롤 복원
- 첫 문장 일반 연습과 10·15·20·전체 출제 모의고사
- 3초 카운트다운, 결과 요약, 어려운 카드 다시 도전
- 첫 문장 상태 `success | again | hard | null`, UUID 시도 기록, 날짜별 통계와 실행 취소
- 답변 익히기 전용 상태 `hard | learning | speakable`와 별도 시도·통계·실행 취소
- 기본 답변과 카드 ID별 나만의 답변
- 전체·문단·문장 쉐도잉, 1·3·5·10·무한 반복, 휴식 5단계, 속도 5단계
- 질문 확인, 이전·다음 카드, 백그라운드 복귀 시 paused 전환과 Wake Lock

### 사용자 데이터와 관리

- 카드별 여러 메모, 고정, 검색, 삭제 직후 복원
- 카드와 무관한 개인 학습 메모, 검색, 고정, 삭제 복원, 세션 초안
- 개인 메모 읽기 화면의 제한적 Markdown: 제목, 굵게, 단순 목록, 인용, 구분선, 인라인 코드
- 임시 직접 지문과 여러 저장 지문
- 카드 ID를 고정하는 직접 수정
- 카드 본문과 학습 기록을 유지하는 보관·복원
- 확인 후 카드 완전 삭제와 새로고침 전 메모리 snapshot 기반 한 번 실행 취소
- TSV 13열 가져오기·내보내기와 가져오기 직전 카드 안전 복사본
- AppBackupV1 JSON 전체 백업·복구와 복구 직전 안전 백업

### TTS와 녹음

- 모든 영어 TTS는 재생 직전에 현재 `speechSynthesis.getVoices()`에서 voice를 다시 선택한다.
- 선택 순서는 영어 Ava, `en-US`, `en-GB`, 그 밖의 `en*`다. 한국어 voice fallback은 금지한다.
- 목록이 일시적으로 비면 `voiceschanged`와 지연 재시도를 사용한다.
- 녹음은 MediaRecorder로 최대 3분이며 TTS와 동시에 재생하지 않는다.
- 녹음 Blob, Object URL, 진행 상태는 현재 컴포넌트 메모리에만 존재한다. 저장소, JSON, Firebase, 다운로드 파일에 넣지 않는다.

## 3. 카드와 ID 정책

- 핵심 카드 타입은 `src/types.ts`의 `OpicCard`다.
- 기본 답변은 `back: string[]`, 나만의 답변은 카드 ID별 별도 문자열이다.
- 카드 ID를 유지하면 첫 문장 상태·시도, 답변 익히기 상태·시도, 나만의 답변과 카드 메모가 계속 연결된다.
- TSV의 동일 ID 가져오기는 카드 본문만 덮어쓰고 ID 기반 사용자 기록과 보관 상태를 유지한다.
- 삭제했던 ID를 다시 TSV로 가져오면 새 카드처럼 생성되며 과거 삭제 기록을 복구하지 않는다.
- 첫 문장 전용 카드는 `answer/back`이 `firstLine` 한 문장인 유효 카드다. 첫 문장 연습에는 포함하지만 답변 익히기와 쉐도잉에는 전체 답변 없음 상태를 표시한다.
- 기본 답변 배열은 `join("\n")` 후 빈 줄, 즉 줄바꿈 2회 이상을 기준으로 문단을 나눈다. 배열 항목 하나를 자동으로 독립 문단으로 보지 않는다.

## 4. localStorage: 장기 데이터와 설정

| 키 | 담당 내용 | JSON 전체 백업 |
| --- | --- | --- |
| `opic-card-dataset` | 버전 1 활성 카드 데이터셋 | 포함 |
| `opic-archived-card-ids` | 보관 카드 ID 배열 | 포함, 구버전 누락 시 빈 배열 |
| `opic-first-line-statuses` | 카드 ID별 첫 문장 현재 상태 | 포함 |
| `opic-first-line-attempts-by-date` | 날짜별 첫 문장 시도 | 포함 |
| `opic-answer-learning-statuses` | 카드 ID별 답변 익히기 상태 | 포함 |
| `opic-answer-learning-attempts-by-date` | 날짜별 답변 익히기 시도 | 포함 |
| `opic-my-answers` | 카드 ID별 나만의 답변 | 포함 |
| `opic-card-memos` | 카드 ID별 메모 배열 | 포함 |
| `opic-personal-memos` | 독립 개인 학습 메모 데이터셋 | 포함 |
| `opic-saved-passages` | 저장 지문 데이터셋 | 포함 |
| `opic-theme-mode` | 라이트·다크 테마 | 포함 |
| `opic-study-day-start-time` | 학습일 시작 시각 | 포함 |
| `opic-tts-rate` | 공통 TTS 속도 | 포함 |
| `opic-question-tts-autoplay` | 질문 TTS 자동재생 | 포함 |
| `opic-auto-advance-after-rating` | 평가 후 자동 넘김 | 포함 |
| `opic-study-card-scope` | 전체·새 카드 범위 | 포함 |
| `opic-study-order` | 기본·랜덤·적은 연습 순서 | 포함 |
| `opic-shadowing-repeat-mode` | 전체·문단·문장 반복 | 포함 |
| `opic-shadowing-repeat-count` | 1·3·5·10·무한 반복 | 포함 |
| `opic-shadowing-rest-level` | 듣기만·짧게·보통·길게·아주 길게 | 포함 |
| `opic-cards-import-backup` | TSV 가져오기 직전 카드 복사본 | 제외 |
| `opic-full-restore-backup` | 전체 복구 직전 안전 백업 | 제외 |

주요 담당 모듈은 `src/utils/cardStorage.ts`, `statusStorage.ts`, `studyStats.ts`, `answerLearningStorage.ts`, `myAnswerStorage.ts`, `cardMemoStorage.ts`, `personalMemoStorage.ts`, `savedPassageStorage.ts`, `cardArchiveStorage.ts`, `studyPreferences.ts`, `shadowingSettings.ts`다.

## 5. sessionStorage: 현재 탭의 임시 상태

| 키 | 담당 내용 |
| --- | --- |
| `opic-navigation-session` | 현재 화면, 카드, 필터, drill 순서와 복귀 경로 |
| `opic-card-library-session` | 표시 개수, 필터 signature, 스크롤 위치 |
| `opic-card-detail-ui-session` | 상세 펼침 상태, 선택 답변, 나만의 답변·메모 초안 |
| `opic-shadowing-player-session` | 소스, 현재 문장, paused 상태, 질문 표시 |
| `opic-swipe-navigation-hint-seen` | 스와이프 안내 표시 여부 |
| `opic-saved-passage-editor-session` | 저장 지문 작성·수정 초안 |
| `opic-saved-passage-library-open` | 저장 지문 목록 펼침 상태 |
| `opic-personal-memo-editor-session` | 개인 메모 작성·수정 초안 |
| `opic-personal-memo-library-open` | 개인 메모 목록 펼침 상태 |
| `opic-answer-learning-session` | 답변 익히기 카드 순서와 화면 상태 |
| `opic-first-line-mock-session` | 모의고사 출제·답변·결과 |
| `opic-post-restore-navigation` | 전체 복구 후 관리 영역 복귀 의도 |

세션 값은 AppBackupV1, TSV와 클라우드 백업에 포함하지 않는다. 완전히 새 세션에서는 사라져도 되는 UI·진행 데이터다.

## 6. AppBackupV1 정책

- 파일 표식은 `format: "opic-trainer-backup"`, `version: 1`이다.
- 카드 데이터셋, 보관 ID, 첫 문장·답변 익히기 상태와 시도, 나만의 답변, 카드 메모, 개인 메모, 저장 지문 및 학습 설정을 포함한다.
- 녹음, 현재 TTS·플레이어 상태, 임시 직접 지문, 편집 초안, 탐색 세션, TSV 안전 복사본과 전체 복구 안전 백업은 제외한다.
- 복구는 미리보기와 사용자 확인 후 실행한다.
- 복구 직전 현재 AppBackupV1을 `opic-full-restore-backup`에 한 번 저장하고, 직전 복구 되돌리기는 이를 적용한 뒤 제거한다.
- `src/utils/appBackup.ts`는 복구 대상 raw snapshot을 잡고, 중간 저장 실패 시 이전 값을 복원한다. rollback 성공 여부는 `BackupApplyError`로 전달한다.
- 구버전 v1에서 선택 필드가 빠진 경우 안전한 기본값으로 호환한다. 알 수 없는 필드는 무시하고 위험한 prototype 키를 거부한다.

## 7. 카드 보관과 완전 삭제

- 보관은 카드 본문을 변경하지 않고 `opic-archived-card-ids`만 갱신한다. 학습 기록, 나만의 답변, 메모를 유지한다.
- 완전 삭제는 카드 본문과 해당 카드 ID의 첫 문장 상태·시도, 답변 익히기 상태·시도, 나만의 답변, 카드 메모, 보관 ID 및 현재 학습 세션 참조를 정리한다.
- 개인 학습 메모와 저장 지문은 카드와 무관하므로 삭제하지 않는다.
- 삭제 직전 React 메모리 상태를 `DeletedCardSnapshot`으로 보관하고 새로고침 전 한 번 실행 취소할 수 있다.

### 알려진 기술 부채: 삭제 저장의 비원자성

현재 `src/App.tsx`의 카드 완전 삭제와 실행 취소는 여러 localStorage/sessionStorage saver를 순서대로 호출한다. 일부 saver는 저장 예외를 던지고 일부는 내부에서 삼키므로, quota 또는 저장소 실패 시 일부 키만 변경되거나 React 메모리와 저장소가 달라질 수 있다.

다음 우선 작업은 공통 raw storage transaction 경계를 도입하는 것이다.

1. 관련 키 원문 snapshot
2. 모든 다음 값 사전 계산·검증·직렬화
3. 결정된 순서로 저장 적용
4. 한 번이라도 실패하면 snapshot 전체 rollback
5. rollback 실패를 별도 고위험 상태로 안내
6. transaction 성공 후에만 React 상태 갱신
7. 삭제 실행 취소도 raw snapshot을 복원하는 별도 transaction으로 처리

AppBackupV1의 도메인 정책과 일반 저장 transaction 책임을 합치지 말고, snapshot·mutation·rollback primitive만 공유한다. persistent undo journal과 다중 탭 잠금은 현재 범위가 아니다.

## 8. 클라우드 수동 백업

- 기능 플래그와 완전한 Firebase Web config가 있을 때만 패널과 Firebase 초기화 경로를 연다.
- production은 `VITE_FIREBASE_USE_EMULATORS=false`가 명시되어야 활성화된다.
- Google Authentication의 현재 사용자 UID로 `cloudBackupAllowedUsers/{uid}` 단건을 확인하고 `enabled === true`인 계정만 허용한다.
- 계정 카드에서는 displayName이 있으면 이름을 주요 정보, 이메일을 보조 정보로 표시한다. 이름이 없으면 이메일을 주요 정보로 표시하고, 둘 다 없으면 `Google 사용자`를 표시한다.
- 이메일은 UI의 현재 Auth 객체에서만 읽으며 localStorage, sessionStorage, AppBackupV1, Storage JSON 별도 필드, Firestore metadata, 로그와 진단 복사 정보에 저장하지 않는다.
- 수동 클릭 한 번마다 AppBackupV1을 생성해 사용자별 Storage JSON으로 올리고 Firestore metadata를 기록한다.
- byteSize, SHA-256, schema version, 경로와 요약을 검증하며 Storage 성공 후 metadata 실패 시 파일 cleanup을 시도한다.
- 업로드 단계, 마지막 완료 단계, 실패 지점, 안전 오류 코드와 cleanup 결과는 메모리 진단 상태로만 유지한다.
- 네트워크 계열만 사용자의 명시적 재시도를 허용한다. 권한·검증·cleanup 실패에는 추가 업로드를 막는다.
- Storage Security Rules가 Firestore allowlist를 조회하려면 Storage service agent에 `Firebase Rules Firestore Service Agent` 역할이 필요하다. 기본 Storage 역할도 유지한다.
- 2026-07-21 수동 운영 검증에서 Firestore metadata 1건과 Storage JSON 1건의 ID·경로·크기·SHA-256·schema·시각 관계가 일치했고 고아·중복이 없었다. 식별자와 내용은 저장소에 기록하지 않는다.
- 구현 범위는 업로드와 최근 목록 확인뿐이다. 다운로드, 클라우드 복원, 병합, 삭제 UI, 자동 업로드와 자동 동기화는 없다.

상세 운영 절차와 긴급 OFF 방법은 [CLOUD_BACKUP_OPERATIONS.md](CLOUD_BACKUP_OPERATIONS.md)를 따른다.

## 9. 주요 코드 지도

- 앱 상태·화면 조립: `src/App.tsx`
- 공통 타입과 기본 카드: `src/types.ts`, `src/data/cards.ts`
- 카드 목록·상세·수정: `src/components/CardList.tsx`, `CardDetail.tsx`, `CardEditor.tsx`
- 카드 수정·보관·삭제 규칙: `src/utils/cardEditor.ts`, `cardArchiveStorage.ts`, `cardDeletion.ts`
- 첫 문장: `src/components/FirstLineSetup.tsx`, `FirstLineDrill.tsx`, `src/utils/firstLineMockSession.ts`
- 답변 익히기: `src/components/AnswerLearningSetup.tsx`, `AnswerLearning.tsx`, `src/utils/answerLearningStorage.ts`, `answerLearningSession.ts`
- 쉐도잉: `src/components/ShadowingPlayer.tsx`, `src/hooks/useShadowingPlayer.ts`, `src/utils/shadowingPlayer.ts`, `shadowingSettings.ts`
- 문장·문단: `src/utils/sentenceSegmenter.ts`, `passageParagraphs.ts`
- TTS: `src/hooks/useSpeechSynthesis.ts`, `src/utils/englishVoice.ts`
- 녹음: `src/components/AudioRecorder.tsx`, `src/hooks/useAudioRecorder.ts`, `src/utils/audioRecorder.ts`
- 메모·지문: `src/components/CardMemoSection.tsx`, `MemoSearch.tsx`, `PersonalMemoManager.tsx`, `DirectTextPractice.tsx`
- TSV: `src/components/CardDataManager.tsx`, `src/utils/cardTsv.ts`, `cardStorage.ts`
- JSON 백업: `src/components/BackupManager.tsx`, `src/utils/appBackup.ts`
- 클라우드: `src/components/CloudBackupPanel.tsx`, `src/services/cloudBackup.ts`, `src/services/firebaseCloudBackup.ts`, `src/config/cloudBackup.ts`, `src/config/firebase.ts`
- PWA: `src/components/PwaManager.tsx`, `vite.config.ts`, `scripts/create-spa-fallback.mjs`, `scripts/verify-pwa.mjs`
- 배포: `.github/workflows/deploy-pages.yml`

## 10. 테스트와 배포 규칙

### 현재 검증 기준

`package.json`의 `test:all`은 다음 15개 스크립트를 순서대로 실행하며 최신 main Actions에서 545/545가 통과했다.

| 명령 | 개수 |
| --- | ---: |
| `test:backup` | 33 |
| `test:my-answers` | 19 |
| `test:memos` | 28 |
| `test:personal-memos` | 47 |
| `test:passages` | 41 |
| `test:recorder` | 66 |
| `test:shadowing` | 49 |
| `test:ui-session` | 20 |
| `test:tsv` | 30 |
| `test:answer-learning` | 50 |
| `test:first-line-mock` | 18 |
| `test:card-management` | 31 |
| `test:cloud-backup` | 82 |
| `test:home-layout` | 10 |
| `test:ui-system` | 21 |

`test:cloud-rules` 22개는 실행 중인 Firestore·Storage Emulator가 필요한 별도 Security Rules 검증이다. `test:pwa`도 build 후 별도로 실행한다.

### 변경 후 기본 명령

```powershell
npm.cmd run test:all
npm.cmd run test:cloud-rules  # Emulator가 실행 중인 Rules 작업에서만
npm.cmd run build
npm.cmd run test:pwa
git diff --check
```

- `build`가 `tsc -b`를 포함하므로 TypeScript와 production build를 함께 검사한다.
- `test:pwa`는 `dist`가 생성된 뒤 실행한다.
- 실제 Galaxy 기능은 HTTPS 운영본에서 별도로 검증한다.

### GitHub Pages

- `.github/workflows/deploy-pages.yml`은 `main` push에서만 build/deploy job을 실행한다.
- 순서는 checkout, Node LTS, `npm ci`, `test:all`, production build, `test:pwa`, Pages artifact, deploy다.
- production Firebase Web config는 Repository Variables에서만 build에 전달한다.
- feature 브랜치 push와 `workflow_dispatch`는 현재 guard 때문에 Pages build/deploy를 실행하지 않는다.

## 11. Codex 작업 규칙

1. 저장소 루트에서 `CODEX_CONTEXT.md`, `package.json`, `git status`, 최근 log와 관련 코드를 먼저 확인한다.
2. 현재 코드와 package scripts를 과거 채팅보다 우선한다.
3. 기존 카드 ID와 저장 키·AppBackupV1 호환을 우선한다.
4. 사용자의 기존 변경과 추적하지 않은 개인 데이터 디렉터리를 건드리지 않는다.
5. 위험한 카드 관리 QA는 격리된 브라우저 저장소와 임시 데이터로 수행하고 원상 복구한다.
6. 기능 변경 후 자동 테스트, TypeScript 포함 build, PWA 검사와 `git diff --check`를 실행한다.
7. 마이크·TTS·Wake Lock·PWA는 실제 Galaxy HTTPS 환경의 확인 항목을 별도로 보고한다.
8. 사용자가 결과 보고를 먼저 요청하면 승인 전 commit·push·배포하지 않는다.
9. Firebase 값, 실제 사용자 식별자, 백업 본문과 진단 원문을 저장소 문서에 넣지 않는다.

## 12. 의도적으로 미구현 또는 보류

- 녹음 영구 저장, 다운로드, 히스토리와 서버 업로드
- STT, Whisper, AI 발음·답변 평가
- 클라우드 다운로드·복원·병합·삭제 UI·자동 동기화
- 지문 폴더·태그·공유
- 복잡한 Markdown 편집기, WYSIWYG와 임의 HTML 렌더링
- persistent 카드 삭제 undo journal, storage transaction, 다중 탭 잠금
