# OPIc Speaking Trainer - Codex 인수인계

> 마지막 확인: 2026-08-01 (Asia/Seoul)
>
> 기준 브랜치: `main` (기준 main: `7e43a887a98c5e56cfa8ea740ded7d91b61195a1`)
>
> 기준 커밋·운영 반영 SHA: `7e43a887a98c5e56cfa8ea740ded7d91b61195a1`

이 문서는 새 Codex 대화에서 가장 먼저 읽는 현재 코드 구조와 작업 규칙의 source of truth다. 프로젝트 소개와 실행 방법은 [README.md](README.md), Firebase 운영 절차는 [CLOUD_BACKUP_OPERATIONS.md](CLOUD_BACKUP_OPERATIONS.md)를 우선한다.

## 1. 프로젝트와 운영 상태

- 개인용 OPIc 말하기 학습 PWA다.
- 기술 스택은 React, TypeScript, Vite, 일반 CSS, Web Speech API, MediaRecorder, Firebase Web SDK다.
- 저장소: <https://github.com/novakawa-web/opic-speaking-trainer>
- 운영 앱: <https://novakawa-web.github.io/opic-speaking-trainer/>
- production Vite base는 `/opic-speaking-trainer/`, 개발 base는 `/`다.
- 기본 카드 소스는 12장이지만 활성 카드 데이터셋은 TSV 사용에 따라 달라진다. 운영 카드 수를 코드 상수처럼 문서화하지 않는다.
- 2026-08-01 운영 배포 검증에서 운영 URL, `manifest.webmanifest`, `sw.js`, `404.html`과 배포 HTML·JS에서 동적으로 확인한 현재 asset은 HTTP 200이었다. hash가 바뀌는 asset 이름은 고정해 기록하지 않는다.
- 최신 확인 Pages workflow는 commit `7e43a887a98c5e56cfa8ea740ded7d91b61195a1`의 Actions run `30680123204`에서 build job `91315318830`, deploy job `91315378617`과 Pages deployment `5700864622`가 모두 success였다.
- 운영본 브라우저 시각 검증은 사용자 Chrome 프로필의 기존 학습 데이터가 표시되어 클릭·입력·storage 조회 없이 중단했다. 이를 운영본 시각 QA 통과로 기록하지 않으며, 헤더 기능은 release 전 격리 브라우저와 PC·Galaxy 수동 검증 결과를 근거로 한다.
- storage transaction, 카드 삭제 transaction, 공통 브랜드 홈 이동, 쉐도잉 UX, 단일 카드 직접 추가, UX 안정화 1차, 카드 통합 검색, 기본 답변과 나만의 답변의 줄바꿈 정규화, 답변 익히기 카드 선택 조작, 첫 문장 답변 연습 상태 필터, 답변 익히기 상태 통합 필터, 공통 학습 화면 rail과 모바일 헤더 action 정렬, 짧은 가로 화면 쉐도잉·답변 익히기 밀도, 카드 라이브러리 답변 연습 상태 있음·없음 필터, 화면별 학습 제목·홈 문구 정리, 복수 TSV 선택과 최신 선택 미리보기 보호가 main과 운영 Pages에 포함되어 있다.

## 2. 구현된 사용자 흐름

### 카드와 학습

- 홈의 빠른 시작, 학습 카드 요약, 카드 라이브러리
- 덱·태그·`final_rep`·어려운 카드·첫 문장 전용/전체 답변·답변 연습 상태 있음/없음·보관 상태 필터
- 카드 라이브러리 20장 단위 표시와 세션 내 필터·스크롤 복원
- 첫 문장 일반 연습과 10·15·20·전체 출제 모의고사
- 첫 문장 준비의 `답변 연습 상태 있음` 필터는 기본 OFF이며, ON이면 현재 답변 익히기 상태가 `hard | learning | speakable`인 카드만 기존 덱·태그·첫 문장 상태·답변 구성 필터와 AND로 남긴다. 연습과 모의고사는 같은 최종 후보를 사용하고 카드 라이브러리 검색어는 이 후보 계산에서 제외한 채 보존한다.
- 3초 카운트다운, 결과 요약, 어려운 카드 다시 도전
- 첫 문장 상태 `success | again | hard | null`, UUID 시도 기록, 날짜별 통계와 실행 취소
- 답변 익히기 전용 상태 `hard | learning | speakable`와 별도 시도·통계·실행 취소
- 답변 익히기 준비의 상태 필터에는 `답변 연습 상태 없음`, `답변 연습 상태 있음`과 기존 `어려움`, `익히는 중`, `말할 수 있음`이 있다. `hard | learning | speakable`만 유효한 상태로 판정하고 다른 필터와 AND로 결합한다. 필터 전환은 선택 ID와 상태 map을 바꾸지 않으며, 기존 N/M·전체 선택·선택 해제·실제 시작 카드 수 계약을 그대로 따른다. `opic-answer-learning-session` key와 session version 1도 유지한다.
- 답변 익히기 준비 화면은 카드 목록 위에서 현재 필터 결과와 선택 ID의 교집합을 `학습할 카드 N장`으로 표시한다. `전체 선택`은 현재 결과를 기존 선택에 추가하고, `선택 해제`는 필터 밖 선택까지 모두 제거하며, 숨은 선택이 있으면 `필터 밖에서 선택한 M장은 유지되지만 이번 학습에는 포함되지 않아요.`를 표시한다. N이 0이면 시작 버튼을 비활성화한다.
- 기본 답변과 카드 ID별 나만의 답변
- 전체·문단·문장 쉐도잉, 1·3·5·10·무한 반복, 휴식 5단계, 속도 5단계
- 질문 확인, 이전·다음 카드, 문장별 반복 완료 후 다음 문장 자동 진행, 재생 unit 가시성 스크롤, 백그라운드 복귀 시 paused 전환과 Wake Lock

### 공통 학습 화면 레이아웃

- 홈·답변 익히기 준비·답변 익히기·쉐도잉의 공통 outer rail은 최대 1200px이며 좌우 여백은 모바일 16px, 태블릿 24px, 데스크톱 32px이다. 긴 학습 본문은 가독성을 위해 최대 900px의 별도 inner rail을 사용한다.
- AppHeader와 쉐도잉 header는 full-width shell 안의 공통 rail에 콘텐츠를 정렬한다. 쉐도잉 header·main·controller의 좌우 기준선을 맞추되 화면 높이가 같다는 의미는 아니며, 700px 이하 controller는 8px inset을 유지한다.
- 모바일 공통 학습 header와 쉐도잉 header action은 실제 44×44px box와 8px 간격을 사용한다. 홈 action은 44px button 안에 38×38px 파란 mark를 두며, 뒤로가기와 테마 action은 공통 border·background·10px radius 시각 언어를 따른다.
- 쉐도잉 header의 DOM·Tab 순서는 `뒤로가기 → 홈 → 제목 → 진행도 → 테마`다. CSS `order`나 투명 pseudo hit target을 사용하지 않으며 button 의미, handler, 접근성 이름과 테마 `aria-pressed`를 유지한다.
- header 전용 `:focus-visible`은 theme-aware `--header-focus-ring`으로 3px outline과 2px offset을 사용한다. 700px 이하 쉐도잉 제목은 14px/1.2, 진행도는 13px/800과 최소 42px로 compact AppHeader와 맞춘다.
- 쉐도잉 단축키 안내는 문장 목록 아래의 스크롤 영역에 있고, 본문 bottom reserve는 controller 높이·safe-area와 최소 24px 간격을 고려한다. TTS·반복·휴식·녹음과 5버튼 controller 구조는 변경하지 않았다.
- 짧은 가로 화면인 `orientation: landscape`, 높이 700px 이하에서는 너비 제한 없이 공통 study header와 쉐도잉 header를 고정하지 않고 문서와 함께 스크롤한다. 쉐도잉은 현재 문단에 전체 문장 진행도를 표시하고, 중복 이어듣기 문구는 접근성 상태를 유지한 채 시각적으로만 숨긴다. header action의 44px 계약은 유지하며 하단 5개 재생 조작과 속도 선택은 safe-area를 포함한 높이 40px 한 행으로 배치한다.
- 답변 익히기는 700px 이하와 짧은 가로 화면에서 문제 제목, 평가 제목·설명과 이전·다음 조작의 세로 간격을 줄인다. 평가 feedback과 disabled reason은 별도 범위로 유지하고, safe-area 여백과 기존 터치 최소 높이 및 데스크톱 레이아웃은 보존한다.

### 사용자 데이터와 관리

- 카드별 여러 메모, 고정, 검색, 삭제 직후 복원
- 카드와 무관한 개인 학습 메모, 검색, 고정, 삭제 복원, 세션 초안
- 개인 메모 읽기 화면의 제한적 Markdown: 제목, 굵게, 단순 목록, 인용, 구분선, 인라인 코드
- 임시 직접 지문과 여러 저장 지문
- 카드 ID를 고정하는 직접 수정
- 카드 라이브러리에서 자동 ID로 새 카드 한 장 직접 추가
- 카드 본문과 학습 기록을 유지하는 보관·복원
- 확인 후 카드 완전 삭제와 새로고침 전 메모리 snapshot 기반 한 번 실행 취소
- TSV 13열 가져오기·내보내기, 복수 파일 동시 선택과 통합 미리보기, 파일 간 중복 ID·파일별 읽기 오류 표시, 가져오기 직전 카드 안전 복사본. 파일을 연속 선택하면 읽기 시작 즉시 이전 미리보기를 비우고 가져오기를 막으며 마지막 선택 요청의 결과만 반영한다.
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
- 앱에서 새 카드를 만들 때 사용자가 ID를 입력하지 않는다. `crypto.randomUUID()` 또는 `crypto.getRandomValues()`로 `custom-` ID를 만들고 활성·보관 ID와 최대 32회 충돌 검사를 한다. 안전한 난수 API가 없거나 충돌을 해소하지 못하면 저장하지 않는다.
- 새 카드 생성은 정규화된 질문과 전체 답변이 모두 기존 카드와 같으면 중복을 차단하고 기존 카드로 이동할 수 있게 한다.
- 첫 문장 전용 카드는 `answer/back`이 `firstLine` 한 문장인 유효 카드다. 첫 문장 연습에는 포함하지만 답변 익히기와 쉐도잉에는 전체 답변 없음 상태를 표시한다.
- 기본 답변 배열은 `join("\n")` 후 빈 줄, 즉 줄바꿈 2회 이상을 기준으로 문단을 나눈다. 배열 항목 하나를 자동으로 독립 문단으로 보지 않는다.
- `src/utils/answerText.ts`가 답변 개행의 source of truth다. CRLF·CR은 LF로 바꾸고, 한 번의 LF는 유지하며, 공백·탭만 있는 빈 줄을 포함한 두 번 이상의 연속 LF는 정확히 `\n\n`으로 줄인다. 문장 내용·문장부호·대소문자와 일반 내부 공백은 바꾸지 않는다.
- CardEditor 입력 중에는 draft를 강제 정규화하지 않는다. 새 카드·카드 수정, TSV 가져오기, JSON 백업 복구와 나만의 답변 저장 같은 commit 경계에서 정규화하고, 기존 저장 데이터는 앱 시작 시 다시 저장하거나 일괄 migration하지 않는다.
- 기존 카드의 표시·쉐도잉 source와 CardEditor 초기값은 저장값을 변경하지 않는 순수 view normalization을 사용한다. 쉐도잉 fingerprint는 정규화된 문장 배열을 기준으로 하므로 빈 줄 개수만 과도한 답변은 같은 문장 지문을 유지한다.

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
| `opic-shadowing-player-session` | 소스 식별자·문장 지문, 현재 문장·완료 반복 수, 반복·휴식 설정, paused 상태, 질문 표시 |
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
- 삭제 transaction의 raw storage snapshot과 이전 semantic 상태를 `DeletedCardUndoSnapshot`으로 메모리에 보관하고 새로고침 전 한 번 실행 취소할 수 있다.

### 카드 삭제 저장 트랜잭션과 남은 한계

`src/App.tsx`의 카드 완전 삭제는 `src/utils/cardDeletionAdapter.ts`에서 현재 React 상태와 엄격하게 읽은 UI session을 조립한 뒤 `createCardDeletionPlan`으로 모든 다음 값을 계산·검증한다. 이어 `runStorageTransaction`이 raw snapshot을 잡고 mutation을 적용하며, 성공한 뒤에만 React 상태를 한 번에 반영한다. 실행 취소도 저장된 raw snapshot을 별도 transaction으로 복원한 뒤에만 이전 React 상태를 반영한다.

`src/utils/storageTransaction.ts`에 공통 raw storage transaction 기반을 추가했다. 호출자가 전달한 storage 인스턴스와 key를 raw string 또는 `null`로 snapshot하고, mutation 순서를 유지해 적용하며, 실패 시 snapshot 전체를 역순으로 복원하는 앱 수준 보상 rollback이다. Web Storage를 ACID 데이터베이스로 간주하지 않으며 rollback 일부 실패도 별도로 보고한다.

`src/utils/cardDeletionPlan.ts`는 현재 카드와 ID 연관 local/session 상태를 입력받아 삭제 후 semantic 상태와 기존 saver 형식의 raw `StorageMutation[]`을 메모리에서만 계산한다. 주입된 `now`를 dataset `updatedAt`에 사용하고, session 정리 → 카드 종속 local 데이터 → `opic-card-dataset` 순으로 mutation을 만든 뒤 불변 조건을 검증한다. 개인 메모와 저장 지문은 입력·mutation 범위에서 제외한다. plan 생성 중 storage 접근, React 상태 변경, UI 이동, Firebase 호출은 없다.

카드 완전 삭제와 새로고침 전 한 번 실행 취소에는 transaction과 deletion plan이 연결되어 있다. snapshot 또는 apply 실패와 rollback 성공은 React 상태를 바꾸지 않으며, rollback 일부 실패는 추가 destructive action을 잠그고 새로고침 후 상태 재확인을 요구한다. Web Storage는 여전히 ACID 저장소가 아니고, undo snapshot은 메모리에만 있으므로 새로고침 후에는 실행 취소할 수 없다. AppBackupV1 복구와 카드 수정·보관은 이 transaction 기반에 연결하지 않았다.

1. 관련 키 원문 snapshot
2. 모든 다음 값 사전 계산·검증·직렬화
3. 결정된 순서로 저장 적용
4. 한 번이라도 실패하면 snapshot 전체 rollback
5. rollback 실패를 별도 고위험 상태로 안내
6. transaction 성공 후에만 React 상태 갱신
7. 삭제 실행 취소도 raw snapshot을 복원하는 별도 transaction으로 처리

AppBackupV1의 도메인 정책과 일반 저장 transaction 책임을 합치지 말고, snapshot·mutation·rollback primitive만 공유한다. persistent undo journal과 다중 탭 잠금은 현재 범위가 아니다.

### 새 카드 생성 저장 경계

`src/utils/cardCreation.ts`는 CardEditor가 검증한 카드 내용에 충돌 없는 ID를 붙이고, 기존 카드 끝에 추가한 v1 dataset raw JSON을 만든 뒤 `parseCardDataset`으로 재검증한다. mutation은 `opic-card-dataset` 한 건뿐이며 `runStorageTransaction` 성공 후에만 `setCardCatalog`을 한 번 호출한다. 실패 시 React 카드 목록, 화면, 입력 draft와 기존 저장값을 바꾸지 않는다. 생성 직후 별도 상태·시도·메모·session key를 만들지 않으며 JSON 백업과 TSV 내보내기는 기존 card dataset을 읽으므로 자동 포함된다.

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
- 카드 목록·상세·생성·수정: `src/components/CardList.tsx`, `CardLibrary.tsx`, `CardDetail.tsx`, `CardEditor.tsx`, `src/utils/cardCreation.ts`
- 카드 수정·보관·삭제 규칙: `src/utils/cardEditor.ts`, `cardArchiveStorage.ts`, `cardDeletion.ts`
- 첫 문장: `src/components/FirstLineSetup.tsx`, `FirstLineDrill.tsx`, `src/utils/firstLineMockSession.ts`
- 답변 익히기와 공통 상태 selector: `src/components/AnswerLearningSetup.tsx`, `AnswerLearning.tsx`, `src/utils/answerLearningStorage.ts`, `answerLearningSession.ts`, `answerLearningSelectors.ts`
- 공통 학습 화면 레이아웃: `src/components/AppHeader.tsx`, `src/components/ShadowingPlayer.tsx`, `src/styles.css`
- 쉐도잉: `src/components/ShadowingPlayer.tsx`, `src/hooks/useShadowingPlayer.ts`, `src/utils/shadowingPlayer.ts`, `shadowingSettings.ts`
- 답변 개행·문장·문단: `src/utils/answerText.ts`, `sentenceSegmenter.ts`, `passageParagraphs.ts`
- TTS: `src/hooks/useSpeechSynthesis.ts`, `src/utils/englishVoice.ts`
- 녹음: `src/components/AudioRecorder.tsx`, `src/hooks/useAudioRecorder.ts`, `src/utils/audioRecorder.ts`
- 메모·지문: `src/components/CardMemoSection.tsx`, `MemoSearch.tsx`, `PersonalMemoManager.tsx`, `DirectTextPractice.tsx`
- TSV: `src/components/CardDataManager.tsx`, `src/utils/cardTsv.ts`, `cardTsvBatch.ts`, `cardStorage.ts`
- JSON 백업: `src/components/BackupManager.tsx`, `src/utils/appBackup.ts`
- 클라우드: `src/components/CloudBackupPanel.tsx`, `src/services/cloudBackup.ts`, `src/services/firebaseCloudBackup.ts`, `src/config/cloudBackup.ts`, `src/config/firebase.ts`
- PWA: `src/components/PwaManager.tsx`, `vite.config.ts`, `scripts/create-spa-fallback.mjs`, `scripts/verify-pwa.mjs`
- 배포: `.github/workflows/deploy-pages.yml`

## 10. 테스트와 배포 규칙

### 현재 검증 기준

쉐도잉 session은 마지막 유효한 미완료 재생 1건만 보존한다. 카드 또는 저장 지문 식별자, 답변 문장 지문, 현재 반복 설정과 진행 범위가 모두 일치할 때만 `이어 듣기`로 복원한다. 완료됨, 손상됨, 다른 소스, 답변 변경, 범위 이탈 또는 설정 불일치는 처음부터 상태로 정규화한다. 홈·뒤로 이동은 떠나기 직전 현재 진행을 한 번 저장하며 이후 TTS 정리가 그 값을 덮어쓰지 않는다.

`package.json`의 `test:all`은 다음 22개 스크립트를 순서대로 실행한다. 현재 main의 최신 검증 기준은 934/934다.

| 명령 | 개수 |
| --- | ---: |
| `test:answer-line-breaks` | 42 |
| `test:minor-ui-feedback` | 37 |
| `test:card-search` | 22 |
| `test:card-creation` | 41 |
| `test:card-deletion-transaction` | 36 |
| `test:card-deletion-plan` | 40 |
| `test:storage-transaction` | 30 |
| `test:backup` | 33 |
| `test:my-answers` | 19 |
| `test:memos` | 28 |
| `test:personal-memos` | 47 |
| `test:passages` | 41 |
| `test:recorder` | 66 |
| `test:shadowing` | 122 |
| `test:ui-session` | 20 |
| `test:tsv` | 44 |
| `test:answer-learning` | 68 |
| `test:first-line-mock` | 28 |
| `test:card-management` | 32 |
| `test:cloud-backup` | 82 |
| `test:home-layout` | 19 |
| `test:ui-system` | 37 |

`test:cloud-rules` 22개는 실행 중인 Firestore·Storage Emulator가 필요한 별도 Security Rules 검증이다. `test:pwa`도 build 후 별도로 실행한다.

commit `451b4844f22e6dd762b96e114668b44867e233f6`의 기준은 880/880이었다. 답변 익히기 상태 통합 필터 commit `022084a7c22b5e2aad7ea3f7adedc0b9dbe0fbc9`에서 892/892로, 공통 학습 화면 rail commit `03c5082fc0a3fabbe81ba6c6e0b6759650c94ff9`에서 899/899로, 모바일 헤더 action 정렬 commit `abbc66464d50785276e373320ccb3fbc059cf90d`에서 909/909로 증가했다. 짧은 가로 화면 쉐도잉 밀도 commit `650859cb8556f764b7a03515d17b75ee13218a3a`에서 912/912로, 답변 익히기 세로 밀도 commit `498fe3c648fd12e88bd70587402afb44f66aea13`에서 913/913으로 증가했다. 이후 카드 라이브러리 답변 상태 presence 필터 `911fab4`, 짧은 가로 쉐도잉 controller `402bb2d`, 화면별 헤더·홈 문구 `5eacf01`, 복수 TSV 선택 `3eef744`, 최신 TSV 선택 보호 `7e43a88`이 반영되어 현재 기준은 934/934다. 현재 main과 해당 SHA의 CI 기준 TypeScript, production build와 PWA/Pages 검증도 통과했다.

### dependency audit 기준

- 2026-08-01 release 검증 기준 승인 `npm audit` baseline은 exit 1, **high 1건**이다. audit 통과 또는 취약점 0건으로 기록하지 않는다.
- Pages CI workflow에는 별도 `npm audit` 단계가 없으므로 Actions success를 audit 통과로 해석하지 않는다.
- 직접 devDependency `vite-plugin-pwa@1.3.0`에서 `workbox-build@7.4.1`로 이어지는 build-time 전이 경로에 `brace-expansion` DoS advisory `GHSA-mh99-v99m-4gvg`가 존재한다. lockfile에는 `brace-expansion@5.0.7`과 `filelist` 아래의 `brace-expansion@2.1.2`가 있다.
- 확인된 경로는 `vite-plugin-pwa → workbox-build → @trickfilm400/rollup-plugin-off-main-thread → ejs → jake → filelist → minimatch → brace-expansion`이다.
- 이 build-time advisory를 운영 브라우저 runtime 문제와 동일하다고 단정하지 않지만, 현재 운영 앱이 자동으로 안전하다고도 단정하지 않는다.
- `npm audit fix --force`, 직접 dependency downgrade와 override를 적용하지 않는다. 별도 보안 dependency 티켓 `OPIC-SEC-20260726-P01`에서 추적한다.

### 변경 후 기본 명령

```powershell
npm.cmd run test:all
npm.cmd run test:cloud-rules  # Emulator가 실행 중인 Rules 작업에서만
npm.cmd exec tsc -- --noEmit
npm.cmd run build
npm.cmd run test:pwa
npm.cmd audit  # high 1건 baseline을 확인하며 통과로 기록하지 않음
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
- persistent 카드 삭제 undo journal, 다중 탭 destructive action 잠금

### UX backlog

- 완료된 최근 UX·관리 작업은 `OPIC-SHADOWING-LANDSCAPE-20260729-P01`, `OPIC-ANSWER-LEARNING-DENSITY-20260729-P01`, 카드 라이브러리 답변 상태 presence 필터, 짧은 가로 쉐도잉 40px 한 행 controller, 화면별 학습 제목·홈 문구 정리, 복수 TSV 선택과 최신 선택 미리보기 보호다.
- 후속 기능의 현재 추천 순서는 공통 카드 편집·저장 transaction → 답변 익히기 녹음 위치와 TTS 정책 → 카드 라이브러리 필터 결과의 학습 화면 전달이다.
- 카드 라이브러리의 현재 필터 결과를 첫 문장 연습과 답변 익히기로 직접 전달하는 흐름은 상태 통합 필터와 분리해 설계한다.
- 녹음 UI를 답변 익히기 화면 아래로 이동하고 답변 익히기 맥락에 맞게 문구와 디자인을 조정한다.
- 첫 문장 연습·답변 익히기·카드 라이브러리의 카드 선택 UI를 공통 패턴으로 정리한다.
- 카드 선택 필터에 `type`·`topic`·`week` 다중 선택을 지원하고 필터 순서를 재검토한다.
- 카드 목록 2열 전환 breakpoint를 실제 모바일·태블릿 사용성 기준으로 다시 결정한다.
- 첫 문장 훈련에 전체 답변 보기와 첫 문장 공개 시 자동 음성 재생을 검토한다.
- 첫 문장 훈련의 다시 도전 버튼 디자인을 다른 학습 조작과 일관되게 정리한다.
- 답변 익히기 전체 답변 영역의 3중 테두리를 단순화하고 녹음 위치를 쉐도잉과 함께 재검토한다.
- 답변 익히기 TTS에는 속도 선택과 다음 상태 정책을 적용한다: 정지 상태 문장 터치는 선택 문장만 재생 후 정지, 전체 답변 듣기는 처음부터 끝까지 연속 재생, 일시정지는 현재 문장을 기억, 이어 듣기는 멈춘 문장 처음부터 끝까지, 연속 재생 중 문장 터치는 누른 문장부터 끝까지, 전체 완료 후 문장 터치는 선택 문장만 재생 후 정지.
- 나만의 답변 공통 편집은 카드 라이브러리와 답변 익히기에서 동일한 기존 `CardEditor`로 진입한다. 기본 카드 내용과 나만의 답변을 함께 편집하고, 답변 익히기에서 진입한 경우 저장 후 기존 학습 위치로 안전하게 복귀한다. 기본 카드 dataset과 나만의 답변 저장소는 하나의 storage transaction 경계로 처리하고 두 저장이 모두 성공한 뒤에만 React 상태를 반영하며, 실패하면 입력값과 기존 데이터를 유지한다.
- 쉐도잉 하단 5버튼 controller의 더 넓은 재설계는 완료된 공통 rail 정렬·짧은 가로 40px 한 행 compact 처리와 별도 티켓으로 유지한다.
