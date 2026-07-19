# OPIc Speaking Trainer - Codex 인수인계

> 마지막 확인: 2026-07-19 (Asia/Seoul)
> 기준 프로젝트 루트: `C:\Projects\OPIcApp`
> 주의: 과거 `ChatFoundry` 경로를 사용하지 말고 항상 위 프로젝트 루트를 기준으로 작업한다.

이 문서는 새 Codex 대화가 과거 채팅을 읽지 않아도 현재 저장소를 확인하고 바로 이어서 작업할 수 있도록 만든 인수인계 문서다. 아래 내용은 현재 소스, `package.json`, Git 설정, GitHub Actions, 공개 Pages 응답을 직접 확인한 결과다.

## 1. 프로젝트 목적과 주요 사용자 환경

- 개인용 OPIc 말하기 학습 PWA다.
- 영어 질문 카드를 보고 먼저 말한 뒤 첫 문장, 힌트, 기본 답변 또는 나만의 답변을 확인하는 흐름이 중심이다.
- 기술 스택은 React, TypeScript, Vite, 일반 CSS다. 핵심 학습 데이터는 브라우저 저장소를 원본으로 유지하며, 기본 OFF인 실험적 Firebase 수동 백업 기능만 선택적으로 분리되어 있다.
- 모바일, 특히 갤럭시 Chrome에서 실제 학습하는 사용 흐름을 우선한다. 360px, 390px, 412px 폭과 터치 조작을 중요한 기준으로 삼는다.
- 저장소: <https://github.com/novakawa-web/opic-speaking-trainer>
- 배포: <https://novakawa-web.github.io/opic-speaking-trainer/>
- GitHub Pages 프로젝트 사이트이므로 production base는 `/opic-speaking-trainer/`다. 개발 모드 base는 `/`다.
- 마이크는 secure context가 필요하다. 갤럭시에서는 위 HTTPS Pages 배포본을 사용해야 하며, LAN IP의 HTTP 개발 주소는 마이크를 사용할 수 없다. 데스크톱의 `http://localhost`와 `http://127.0.0.1`은 예외적으로 신뢰되는 로컬 환경이다.

## 2. 현재 구현 완료 기능

### 카드와 학습 흐름

- `src/data/cards.ts`에 기본 카드 12장이 있다. 기존 카드 ID는 사용자 학습 기록의 외래 키이므로 바꾸지 않는다.
- 활성 카드 집합은 기본 12장 또는 TSV로 저장한 버전 1 데이터셋이다.
- 카드 목록, 카드 상세, 첫 문장 훈련 화면이 구현되어 있다.
- 필터: 덱, 태그, `final_rep`, 어려움 카드, 전체/새 카드.
- 학습 순서: 기본 순서, 랜덤 세션 순서, 전체 시도 횟수가 적은 순.
- 첫 문장 훈련은 현재 필터 결과 배열 안에서만 이전/다음 이동한다. 모바일 좌우 스와이프와 데스크톱 측면 이동 버튼도 있다.
- 첫 문장 연습 전용 준비 화면에서 필터, 연습/모의고사 모드, 모의고사 출제 수 10·15·20·전체를 선택한다.
- 첫 문장 모의고사는 현재 필터 결과를 세션마다 한 번 무작위로 섞고 중복 없이 고정한다. 문제마다 3초 카운트다운 후 정답 확인과 기존 성공/연습 필요/어려움 평가를 사용하며, 완료 화면에서 결과 요약·어려운 카드 재도전·같은 조건 재시험을 제공한다.
- 첫 문장 전용 카드는 `firstLine`과 같은 한 문장 답변만 있고 힌트 필드가 비어 있는 카드다. 첫 문장 훈련에는 정상 포함되지만 답변 익히기에서는 전체 답변 없음 안내와 쉐도잉 비활성 사유를 표시한다. 같은 ID로 전체 답변을 덮어써도 ID 기반 학습 기록은 유지된다.
- 카드 라이브러리와 첫 문장 준비 화면은 전체 / 첫 문장 전용 / 전체 답변 있음 필터를 지원한다.
- 카드 상세에서 ID를 유지한 채 deck, tags, 질문, 첫 문장, 힌트, 답변, `final_rep`를 직접 수정할 수 있다. 같은 ID를 사용하므로 기존 학습 상태와 시도 기록은 유지된다.
- 카드는 별도 ID 목록으로 보관하거나 복원할 수 있다. 카드 라이브러리의 기본값은 사용 중 카드이며, 사용 중 / 보관됨 / 전체 필터를 제공한다.
- 카드 완전 삭제는 확인 후 카드 본문과 ID 기반 첫 문장·답변 익히기 기록, 나만의 답변, 카드 메모, 진행 세션만 정리한다. 개인 학습 메모와 저장 지문은 건드리지 않으며, 삭제 직후 메모리 스냅샷으로 한 번 실행 취소할 수 있다.
- 카드 수정·보관·복원·완전 삭제 결과는 화면 하단의 공통 `TransientToast` 한 건으로 안내한다. 보관과 완전 삭제는 실행 취소를 제공하고, 최신 알림은 모바일 safe-area를 고려해 3.5초 뒤 자동 소멸한다.
- 700px 이하 첫 문장 연습·모의고사에는 정답 버튼 행 바로 아래 2열 compact 이전/다음 버튼을 표시한다. 기존 스와이프는 유지하고, 701px 이상에서는 기존 질문 측면 및 하단 내비게이션을 사용한다.
- 상태는 내부적으로 `success | again | hard | null`이며 화면에서는 성공 / 연습 필요 / 어려움으로 표시한다. 기존 `again` 저장값은 그대로 호환한다.
- 상태 선택 이력, 날짜별 통계, 오늘 고유 카드 수, 시도 수, 성공률, 한 단계 실행 취소, 현재 상태만 초기화가 구현되어 있다.
- 학습일 시작 시간 기본값은 04:00이며 사용자가 자정, 새벽 4시 또는 직접 시간을 설정할 수 있다.
- 상태 선택 후 자동 넘김 옵션과 1단계 Undo가 있다.
- 주요 키보드 단축키: Q/W 이전·다음, Enter 다음, Space 화면별 토글, A/S/D 평가, Z 최근 평가 실행 취소.
- 홈은 빠른 시작, 오늘 학습 기록, 학습 카드·쉐도잉 지문·개인 학습 메모의 공통 레일 구조를 사용한다. 학습 카드의 현재 조건은 모바일에서도 label과 값을 한 줄 우선으로 표시한다.
- 답변 익히기 모드는 필터한 카드를 대상으로 힌트·첫 문장·전체 답변을 단계적으로 확인한다. 상태는 `hard | learning | speakable`이며 첫 문장 상태와 별도 저장·통계·한 단계 Undo·현재 상태 초기화를 사용한다.
- 답변 익히기에서 선택한 기본 답변 또는 나만의 답변으로 기존 쉐도잉 플레이어에 진입하고 원래 카드·화면으로 복귀할 수 있다.

### TTS와 쉐도잉

- Web Speech API 기반으로 문제, 첫 문장, 기본 답변, 나만의 답변, 쉐도잉 문장을 읽는다.
- TTS 속도는 0.7, 0.85, 1.0, 1.15, 1.3의 5단계이며 모든 TTS 화면이 같은 설정을 공유한다.
- 문제 자동재생 설정과 한국어 문제 뜻 표시가 있다. 한국어 TTS는 없다.
- 영어 음성은 재생 요청마다 현재 `speechSynthesis.getVoices()` 목록에서 다시 선택한다. 영어 Ava 음성이 있으면 최우선이며, 이후 `en-US`, `en-GB`, 기타 `en*` 순서다. 비영어 Ava와 한국어 fallback은 사용하지 않는다.
- 음성 목록이 일시적으로 비어 있으면 `voiceschanged`와 짧은 재시도를 사용한다. 영어 음성이 끝내 없으면 안내하고, 한국어 기본 음성으로 fallback하지 않는다.
- 쉐도잉 소스는 카드 기본 답변, 나만의 답변, 저장하지 않은 직접 지문, 저장 지문이다.
- 쉐도잉 반복 단위는 전체 / 현재 문단 / 현재 문장이다.
- 반복 횟수는 1, 3, 5, 10, 무한이다.
- 휴식은 듣기만 0배, 짧게 0.5배, 보통 0.8배, 길게 1배, 아주 길게 1.5배다. 실제 문장 재생 시간을 우선하고, 실측값이 없으면 현재 TTS 속도에 따른 추정 시간을 사용한다.
- 문장 탭 이동, 이전/다음 문장, 현재 문장 강조, 자동 스크롤, 백그라운드 복귀 시 안전한 paused 전환, Wake Lock이 구현되어 있다.
- 카드 소스 플레이어에서는 질문과 한국어 뜻, 카드 위치, 이전/다음 카드도 확인할 수 있다.

### 답변, 메모, 지문

- 기본 답변은 카드의 `back: string[]`이며 읽기 전용이다.
- 나만의 답변은 카드 ID별 별도 문자열로 작성·수정·삭제한다. 기본 답변을 복사해 편집을 시작할 수 있고, 전체 답변 및 추출한 첫 문장을 TTS로 들을 수 있다.
- 나만의 답변이 있는 카드에서 답변 영역을 처음 열면 나만의 답변 탭이 기본 선택된다. 같은 카드에서는 사용자의 탭 선택을 유지하고, 카드가 바뀌면 새 카드의 답변 유무로 다시 결정한다.
- 카드별 메모는 한 카드에 여러 개를 둘 수 있다. 작성·수정·삭제·고정·삭제 직후 1회 복원, 전체 검색, 카드 목록 배지가 있다.
- 개인 학습 메모는 카드와 연결되지 않는 독립 데이터다. 제목/본문, 작성·수정·삭제·고정, 검색, 최근 삭제 1회 복원, 편집 초안 세션 복원이 있다. 표시 모드에서는 `#`, `##`, 굵게, 목록, 인용, 구분선, 인라인 코드를 안전한 React 요소로 표현한다.
- 저장 지문은 제목과 본문을 여러 개 영구 저장하고 작성·수정·삭제·삭제 직후 복원 후 쉐도잉 플레이어에서 연습할 수 있다.
- 직접 지문은 저장하지 않고 같은 실행 세션에서만 연습할 수 있다.

### 데이터 관리와 PWA

- TSV 내보내기, 샘플 TSV, 파일 파싱·검증·미리보기·가져오기가 구현되어 있다.
- TSV 충돌 정책은 새 카드만 추가, 같은 ID 덮어쓰기, 전체 교체다. 가져오기 직전 카드 데이터 1회 임시 백업과 되돌리기가 있다.
- TSV는 기본/활성 카드 데이터 전용이다. 나만의 답변, 카드별 메모, 개인 학습 메모, 저장 지문, 상태와 시도 기록을 TSV에 넣지 않는다.
- JSON 전체 백업·검증·미리보기·전체 복구가 구현되어 있다. 복구 직전 전체 안전 백업 1회와 직전 복구 되돌리기가 있다.
- 실험적 클라우드 백업 1단계는 기능 플래그 뒤에서 Google 로그인과 **수동 전체 JSON 백업 업로드 및 최근 metadata 목록 확인만** 제공한다. 클라우드 다운로드·복원·병합·삭제·자동 동기화는 구현하지 않았다.
- 클라우드 백업은 Firestore `cloudBackupAllowedUsers/{uid}` 문서의 `enabled === true`인 사용자만 사용할 수 있다. 앱은 로그인 후 자기 문서를 단건 조회하며, 미허용 사용자는 백업 목록을 조회하거나 업로드할 수 없다. 클라이언트는 자기 allowlist 문서의 `get`만 가능하고 목록 조회와 모든 쓰기는 Security Rules에서 거부한다.
- Firestore와 Storage의 백업 경로 모두 인증 UID와 allowlist를 함께 검사한다. Storage Rules는 기본 Firestore 데이터베이스의 allowlist 문서를 `firestore.exists/get`으로 확인하고 기존 JSON·10MB·불변 업로드·부분 실패 정리 조건을 유지한다.
- Firebase 공개 Web 설정은 `.env.local`에서만 읽고 저장소에는 빈 `.env.example`만 둔다. 운영 빌드의 기능 플래그는 기본 OFF이며, OFF에서는 Firebase 패널·SDK 초기화·외부 요청이 발생하지 않는다.
- allowlist Rules와 앱 통합은 로컬 Emulator에서만 검증했다. 실제 Firebase Rules 배포, 실제 allowlist 문서 생성, 실제 UID 입력과 운영 기능 활성화는 아직 하지 않았다.
- PWA manifest, 아이콘, service worker, 오프라인 precache, 오래된 캐시 정리, 새 버전 prompt 업데이트가 구현되어 있다.
- `scripts/create-spa-fallback.mjs`가 build 후 `dist/404.html`을 만들어 GitHub Pages SPA 새로고침을 보완한다.
- `main` push 시 GitHub Actions가 테스트, production build, PWA 검증 후 Pages에 자동 배포한다.

### 녹음 후 바로 듣기

- 공통 `AudioRecorder`와 `useAudioRecorder`를 카드 상세과 쉐도잉 플레이어가 재사용한다.
- MediaRecorder로 녹음 시작, 중지, 즉시 재생, 재생 정지, 다시 녹음, 삭제를 지원한다.
- 최대 녹음 시간은 3분이다.
- MIME 우선순위는 지원 여부에 따라 `audio/webm;codecs=opus`, `audio/webm`, `audio/mp4`, 브라우저 기본값이다.
- 녹음 시작 시 TTS를 멈추고 플레이어를 paused로 유지한다. 녹음 종료 후 TTS를 자동 재개하지 않는다.
- 백그라운드 전환 시 녹음은 안전하게 중지하고, 녹음 재생은 pause한다.
- 녹음 데이터는 `Blob`과 Object URL로 현재 컴포넌트 메모리에만 유지한다. 카드 이동, 화면 이탈, 새로고침 시 사라진다.

## 3. 핵심 데이터 구조

### 카드

```ts
type OpicCard = {
  id: string;
  deck: "OPIc 03_주제별답변" | "OPIc 04_롤플레이" | "OPIc 05_문제해결" | "OPIc 06_변화질문";
  front: string;
  frontKo?: string;
  firstLine: string;
  hint: {
    title: string;
    memoryTip: string;
    subjectTip?: string;
    minimum: string;
    flow: string[];
  };
  back: string[];
  tags: string[];
};
```

활성 카드 데이터셋:

```ts
type CardDataset = {
  version: 1;
  updatedAt: string;
  cards: OpicCard[];
};
```

`firstLine`은 `back[0]`과 공백 정규화 후 같아야 한다. 저장 데이터셋이 없으면 `src/data/cards.ts`의 12장을 사용하고, 잘못된 데이터셋은 기본 카드로 안전하게 fallback한다.

### 학습 상태와 시도

```ts
type FirstLineStatus = "success" | "again" | "hard" | null;

type StudyAttempt = {
  id?: string;       // 새 기록은 UUID 사용, 구형 기록 호환 때문에 optional
  date: string;      // 설정된 학습일 경계로 계산한 YYYY-MM-DD
  cardId: string;
  status: "success" | "again" | "hard";
  timestamp: string; // ISO
};
```

상태 초기화는 현재 카드 상태만 `null`로 바꾸며 과거 시도와 통계를 삭제하지 않는다. Undo는 최근 상태 선택 한 건의 UUID 시도만 삭제하고 이전 상태를 복원한다.

### 사용자 작성 데이터

- 나만의 답변: `Record<string, string>`; key는 카드 ID, value는 전체 답변 문자열.
- 카드별 메모: `Record<string, CardMemo[]>`; 메모는 `id`, `cardId`, `content`, `pinned`, `createdAt`, `updatedAt`을 가진다.
- 개인 학습 메모: `{ version: 1, memos: PersonalMemo[] }`; 메모는 카드 ID를 가지지 않고 `id`, `title`, `content`, `pinned`, 날짜를 가진다.
- 저장 지문: `{ version: 1, passages: SavedPassage[] }`; 지문은 `id`, `title`, `text`, 날짜를 가진다.
- 카드가 활성 데이터셋에서 사라져도 나만의 답변과 카드 메모는 orphan 데이터로 보존한다. TSV 교체가 이 데이터를 지우면 안 된다.

## 4. 브라우저 저장 키

### localStorage: 장기 데이터와 설정

| 키 | 내용 | JSON 전체 백업 |
|---|---|---|
| `opic-card-dataset` | 버전 1 활성 카드 전체 | 포함 |
| `opic-archived-card-ids` | 학습 목록에서 보관한 카드 ID 배열 | 포함, 구버전 누락 시 빈 배열 |
| `opic-first-line-statuses` | 카드 ID별 현재 평가 상태 | 포함 |
| `opic-first-line-attempts-by-date` | 날짜별 첫 문장 시도 이력 | 포함, 파일에서는 flat 배열 |
| `opic-answer-learning-statuses` | 카드 ID별 답변 익히기 상태 | 포함 |
| `opic-answer-learning-attempts-by-date` | 날짜별 답변 익히기 시도 이력 | 포함, 파일에서는 flat 배열 |
| `opic-my-answers` | 카드 ID별 나만의 답변 | 포함 |
| `opic-card-memos` | 카드별 여러 메모 | 포함 |
| `opic-personal-memos` | 카드와 무관한 개인 학습 메모 데이터셋 | 포함 |
| `opic-saved-passages` | 저장 지문 데이터셋 | 포함 |
| `opic-theme-mode` | `light` 또는 `dark` | 포함 |
| `opic-study-day-start-time` | 학습일 시작 `HH:mm`, 기본 04:00 | 포함 |
| `opic-tts-rate` | 5단계 TTS 속도 | 포함 |
| `opic-question-tts-autoplay` | 카드 전환 시 문제 자동재생 | 포함 |
| `opic-auto-advance-after-rating` | 평가 후 자동 넘김 | 포함 |
| `opic-study-card-scope` | `all` 또는 `new` | 포함 |
| `opic-study-order` | `default`, `random`, `least-practiced` | 포함 |
| `opic-shadowing-repeat-mode` | `full`, `paragraph`, `sentence` | 포함 |
| `opic-shadowing-repeat-count` | `1`, `3`, `5`, `10`, `infinite` | 포함 |
| `opic-shadowing-rest-level` | `none`, `short`, `medium`, `long`, `extraLong` | 포함 |
| `opic-cards-import-backup` | TSV 가져오기 직전 카드 안전 복사본 | 제외 |
| `opic-full-restore-backup` | JSON 전체 복구 직전 안전 복사본 | 제외 |

### sessionStorage: 현재 탭의 임시 UI 상태

| 키 | 내용 |
|---|---|
| `opic-navigation-session` | home/library/detail/drill 화면, 상세 복귀 위치, 현재 카드, 필터, drill 카드 순서 |
| `opic-card-library-session` | 카드 라이브러리의 20장 단위 표시 개수, 필터 signature, 스크롤 위치 |
| `opic-card-detail-ui-session` | 힌트/답변, 답변 탭, 나만의 답변 초안, 메모 펼침/편집 초안 |
| `opic-shadowing-player-session` | 카드/저장 지문 소스, 현재 문장, paused 상태, 질문 표시 상태 |
| `opic-swipe-navigation-hint-seen` | 스와이프 안내를 본 현재 탭 상태 |
| `opic-saved-passage-editor-session` | 저장 지문 작성·수정 초안 |
| `opic-saved-passage-library-open` | 저장 지문 목록 펼침 상태 |
| `opic-personal-memo-editor-session` | 개인 학습 메모 작성·수정 초안 |
| `opic-personal-memo-library-open` | 개인 학습 메모 목록 펼침 상태 |
| `opic-answer-learning-session` | 답변 익히기 카드 순서, 현재 카드와 화면 상태 |
| `opic-post-restore-navigation` | 전체 복구 후 관리 영역으로 한 번만 복귀하는 이동 의도 |
| `opic-first-line-mock-session` | 모의고사 출제 순서, 답변 결과, 출제 조건과 결과 화면. JSON 백업에서 제외되는 세션 전용 데이터 |

sessionStorage 데이터는 JSON 전체 백업에 포함하지 않는다. 잘못된 JSON, 존재하지 않는 카드/지문 ID, 길이 제한 위반은 안전한 초기 상태로 fallback한다.

### 절대 저장하지 않는 런타임 데이터

- 녹음 `Blob`, Object URL, 녹음 경과 시간과 MediaStream/MediaRecorder 상태
- 현재 재생 중인 SpeechSynthesisUtterance와 실제 voice 객체
- TTS/휴식/자동 넘김 timer, Wake Lock 객체, pointer/swipe 진행 상태
- 저장하지 않고 바로 연습하는 직접 지문
- 현재 스크롤 위치와 service worker 런타임 객체

음성 녹음은 localStorage, sessionStorage, IndexedDB, JSON 백업, TSV, 서버 어디에도 저장하거나 전송하지 않는다.

## 5. JSON 백업 정책

- 파일 형식: `format: "opic-trainer-backup"`, `version: 1`, app schema version 1.
- 최대 파일 크기: 10MB.
- 명시적으로 포함: 활성 카드 데이터셋, 보관 카드 ID, 첫 문장과 답변 익히기의 현재 상태·시도 이력, 나만의 답변, 카드별 메모, 저장 지문, 개인 학습 메모, 장기 설정.
- 명시적으로 제외: 모든 sessionStorage UI 상태, TSV 임시 백업, 직전 전체 복구 안전 백업, 녹음, TTS/타이머/Wake Lock 런타임 상태, 직접 임시 지문.
- 복구 전 전체 파일을 파싱·검증·정규화한다. 알 수 없는 필드는 경고 후 무시하고, 데이터 손상 위험이 있는 핵심 오류가 있으면 복구를 막는다.
- `__proto__`, `constructor`, `prototype` 같은 위험 키를 차단한다.
- 복구 직전 `opic-full-restore-backup`에 현재 전체 상태를 한 번 저장한다. 되돌리기는 이 백업을 한 번 적용하고 제거하는 정책이다.
- 카드 ID와 연결된 orphan 학습 기록, 나만의 답변, 카드 메모는 보존한다.

## 6. 중요한 구현 정책과 변경 금지 경계

1. **기본 답변과 나만의 답변은 분리한다.** `OpicCard.back`을 사용자 편집 결과로 덮어쓰지 않는다. 나만의 답변은 `opic-my-answers`에만 저장한다.
2. **카드별 메모와 개인 학습 메모는 다른 기능이다.** 카드별 메모는 `cardId`가 있고 카드 상세/카드 검색과 연결된다. 개인 학습 메모는 카드와 독립이며 별도 데이터셋과 UI를 사용한다.
3. **문단은 실제 빈 줄로만 나눈다.** 하나 이상의 빈 줄, 즉 줄바꿈 2회 이상(`\n\n`, CRLF 정규화 포함)이 새 문단 경계다. 한 번의 줄바꿈은 같은 문단 안의 문장 연결이다. 카드 기본 답변의 `back` 배열은 `join("\n")`으로 합쳐서 각 배열 항목이 자동으로 별도 문단이 되지 않게 한다. 배열 요소 내부에 실제 빈 줄이 있을 때만 문단을 나눈다.
4. **영어 음성만 사용한다.** 매 재생 직전 현재 voice 목록에서 영어 voice를 다시 찾으며 한국어 음성 fallback을 절대 사용하지 않는다. SpeechSynthesisVoice 객체를 장기간 캐시하지 않는다.
5. **녹음은 현재 화면 메모리 전용이다.** 영구 저장, 다운로드, JSON/TSV 포함, 서버 업로드를 추가하지 않는다.
6. **기존 사용자 데이터 보존이 우선이다.** 저장 키, 카드 ID, 내부 `again` 값, 백업 v1 호환을 함부로 바꾸지 않는다. 새 필드는 optional 또는 마이그레이션 가능한 방식으로 추가한다.
7. **TSV와 사용자 데이터는 분리한다.** TSV 카드 추가/덮어쓰기/전체 교체로 상태, 시도, 나만의 답변, 메모, 지문을 지우지 않는다.
8. **모바일 시선 안정성을 우선한다.** 불필요한 transform, 큰 fade, 레이아웃 높이 전환을 피하고 `prefers-reduced-motion`을 존중한다.
9. **TTS, 녹음, 백그라운드 상태를 분리한다.** Wake Lock은 화면 꺼짐 방지일 뿐 TTS pause 상태가 아니다. 백그라운드 복귀 후 플레이어는 자동 재생하지 않고 paused로 복원한다.
10. **카드 보관은 카드 스키마와 분리한다.** `opic-archived-card-ids`만 갱신하고 카드 본문·학습 기록은 유지한다. TSV 동일 ID 덮어쓰기와도 독립적이다.
11. **카드 완전 삭제만 ID 기반 연관 데이터를 정리한다.** 삭제는 확인과 세션 내 한 번 실행 취소를 제공하며 카드와 무관한 개인 메모·저장 지문은 삭제하지 않는다.

## 7. 주요 코드 위치

- 앱 상태/화면 조립: `src/App.tsx`
- 기본 카드: `src/data/cards.ts`
- 공통 타입: `src/types.ts`
- 카드 목록/상세/수정/첫 문장: `src/components/CardList.tsx`, `CardDetail.tsx`, `CardEditor.tsx`, `FirstLineDrill.tsx`
- 카드 수정·보관·삭제 정책: `src/utils/cardEditor.ts`, `src/utils/cardArchiveStorage.ts`, `src/utils/cardDeletion.ts`
- 답변 익히기: `src/components/AnswerLearningSetup.tsx`, `src/components/AnswerLearning.tsx`, `src/utils/answerLearningStorage.ts`, `src/utils/answerLearningSession.ts`
- 쉐도잉: `src/components/ShadowingPlayer.tsx`, `src/hooks/useShadowingPlayer.ts`, `src/utils/shadowingPlayer.ts`, `src/utils/shadowingSettings.ts`
- 문장/문단: `src/utils/sentenceSegmenter.ts`, `src/utils/passageParagraphs.ts`
- TTS 영어 voice: `src/hooks/useSpeechSynthesis.ts`, `src/utils/englishVoice.ts`
- 녹음: `src/components/AudioRecorder.tsx`, `src/hooks/useAudioRecorder.ts`, `src/utils/audioRecorder.ts`
- 나만의 답변: `src/utils/myAnswerStorage.ts`
- 카드별 메모: `src/components/CardMemoSection.tsx`, `src/components/MemoSearch.tsx`, `src/utils/cardMemoStorage.ts`
- 개인 학습 메모: `src/components/PersonalMemoManager.tsx`, `src/utils/personalMemoStorage.ts`
- 저장/직접 지문: `src/components/DirectTextPractice.tsx`, `src/utils/savedPassageStorage.ts`
- TSV: `src/components/CardDataManager.tsx`, `src/utils/cardTsv.ts`, `src/utils/cardStorage.ts`
- JSON 백업: `src/components/BackupManager.tsx`, `src/utils/appBackup.ts`
- 복구 후 관리 영역 복귀: `src/utils/postRestoreNavigation.ts`, `src/components/HomeManagement.tsx`
- 세션 복원: `src/utils/navigationSession.ts`, `src/utils/uiSessionStorage.ts`
- PWA 업데이트 UI: `src/components/PwaManager.tsx`
- 스타일: `src/styles.css`
- Pages/PWA: `vite.config.ts`, `.github/workflows/deploy-pages.yml`, `scripts/create-spa-fallback.mjs`, `scripts/verify-pwa.mjs`

## 8. 개발, 테스트, 배포

### 로컬 명령

Windows PowerShell에서 실행 정책 때문에 `npm.ps1`이 막힐 수 있다. 그 경우 아래처럼 `npm.cmd`를 사용한다.

```powershell
cd C:\Projects\OPIcApp
npm.cmd install
npm.cmd run dev
npm.cmd run test:all
npm.cmd run build
npm.cmd run test:pwa
```

- `npm run build`는 `tsc -b && vite build` 후 postbuild에서 `dist/404.html`을 만든다.
- 로컬 production 확인은 `npm.cmd run preview`다.
- Vite 개발 서버를 끝낼 때는 실행한 터미널에서 `Ctrl+C`를 누른다.

### 자동 테스트 스크립트

| 명령 | 범위 | 현재 검증 수 |
|---|---|---:|
| `test:backup` | JSON 백업·복구 | 33 |
| `test:my-answers` | 나만의 답변 | 19 |
| `test:memos` | 카드별 메모 | 28 |
| `test:personal-memos` | 개인 학습 메모 | 47 |
| `test:passages` | 저장 지문·문단 | 41 |
| `test:recorder` | 녹음 | 66 |
| `test:shadowing` | 문장/TTS/쉐도잉 | 49 |
| `test:ui-session` | 카드 상세·플레이어·카드 라이브러리 세션 | 20 |
| `test:tsv` | TSV | 30 |
| `test:answer-learning` | 답변 익히기 상태·통계·세션·Undo | 50 |
| `test:first-line-mock` | 첫 문장 전용 카드·모의고사·모바일 이동 | 18 |
| `test:home-layout` | 홈 공통 레일·반응형 구조 | 10 |
| `test:card-management` | 카드 수정·보관·완전 삭제·공통 toast·JSON 호환 | 31 |
| `test:cloud-backup` | 기능 플래그·수동 업로드·allowlist·무결성·부분 실패 정리 | 42 |
| `test:cloud-rules` | Firestore/Storage Emulator Security Rules와 allowlist | 22 |
| `test:ui-system` | compact UI·복구 후 이동·간격 체계 | 21 |

- 2026-07-19 현재 `npm.cmd run test:all`: **505/505 통과**. `test:cloud-rules`는 실행 중인 Emulator가 필요한 별도 검사이며 **22/22 통과**해 고유 검증 합계는 **527개**다.
- 같은 확인에서 `npm.cmd run build`: TypeScript와 Vite production build 통과.
- 같은 확인에서 `npm.cmd run test:pwa`: Pages/PWA 산출물 검증 통과. `manifest.webmanifest`, `sw.js`, `404.html`이 생성됨.
- `test:pwa`는 `test:all`에 포함되지 않으므로 build 후 별도로 실행한다.

### GitHub Actions / Pages

- workflow: `.github/workflows/deploy-pages.yml`
- trigger: `main` push 또는 수동 `workflow_dispatch`.
- pipeline: checkout -> Node LTS -> `npm ci` -> `test:all` -> build -> `test:pwa` -> Pages artifact upload -> deploy.
- 이전 기준 배포 run: [29590301905](https://github.com/novakawa-web/opic-speaking-trainer/actions/runs/29590301905), commit `7557bf6b72708abe52e4b1f0511fa08b7ba977fe`, 성공.
- 최신 배포 상태와 커밋은 GitHub Actions의 `main` 최신 run과 `git log -1`을 source of truth로 확인한다.
- 2026-07-18 확인 시 공개 배포 URL은 HTTP 200을 반환했다.
- service worker 때문에 이전 bundle이 보이면 앱의 새 버전 안내를 적용하거나 페이지를 다시 연 뒤 검증한다.

## 9. Git 현재 상태

- 현재 개발 브랜치: `feature/cloud-backup-allowlist` (기준 `main` 커밋 `58fe13afef769b443f1ab683e6a5006fdaee5c0e`에서 분기)
- 운영 브랜치와 Pages 배포 기준: `main`, `origin/main`
- remote: `https://github.com/novakawa-web/opic-speaking-trainer.git`
- 이 문서는 저장소 코드와 함께 버전 관리한다. 최신 커밋은 `git log -1 --oneline`, 동기화 여부는 `git status --short --branch`와 `git rev-parse origin/main`으로 확인한다.
- 2026-07-18 릴리스 범위에는 홈 compact 탐색, 카드 라이브러리, 데이터 관리 UX, 개인 메모 Markdown 표시·이동, 개인 메모·저장 지문 자동 제목과 관련 검증이 포함된다.

## 10. 최근 완료 작업과 다음 상태

2026-07-18 릴리스 범위로 아래 작업을 완료했다.

1. TSV 카드 데이터 관리의 파일 입력 버튼을 **“TSV 가져오기”**로 명확히 표시한다.
2. JSON 백업·복구의 파일 입력 버튼을 **“JSON 백업 복구”**로 명확히 표시한다.
3. 두 파일 흐름 모두 **파일 선택 -> 미리보기/검증 -> 가져오기 또는 복구 실행**의 3단계를 화면에 표시한다. 파일 선택만으로 데이터는 적용되지 않는다.
4. 개인 학습 메모의 표시 모드에서 제한적인 간단 Markdown 문법을 표현한다.
   - `#`, `##`, `###` 제목
   - `**굵게**`
   - 목록
   - 인용
   - 구분선
   - 인라인 코드
5. Markdown 편집기, 미리보기 편집 도구, 임의 HTML 렌더링은 추가하지 않았다.
6. `dangerouslySetInnerHTML` 없이 `src/utils/simpleMarkdown.ts`의 제한적 AST 파서와 `src/components/SimpleMarkdown.tsx`의 React 렌더러를 사용한다.
7. 기존 개인 메모 원문 저장 구조, localStorage 키와 JSON 백업 v1 형식은 변경하지 않았다.
8. 홈은 전체 카드 목록 대신 전체/필터 카드 수와 학습 진입 버튼만 표시하고, 필터·정렬·카드 목록은 별도 카드 라이브러리 화면에서 제공한다.
9. 카드 라이브러리는 20장씩 렌더링하며 표시 개수와 스크롤 위치를 `opic-card-library-session` sessionStorage에 보존한다.
10. TSV/JSON 직전 되돌리기는 각각 가져오기/복구 영역으로 이동했고, 안전 백업이 없으면 작은 빈 상태 문구만 표시한다.
11. 개인 메모와 저장 지문은 제목을 비워도 본문 첫 줄에서 안전한 일반 텍스트 제목을 만들며 기존 데이터 스키마는 유지한다.
12. 열린 개인 메모는 현재 정렬 또는 검색 결과 안에서 이전/다음으로 이동할 수 있다.
13. 홈에 답변 익히기 빠른 시작과 별도 상태·시도 통계를 추가했으며 기존 첫 문장 저장 키와 분리했다.
14. 홈 카드들은 1200px 공통 레일과 6·8·12·16·20·24·28px 간격 체계를 사용한다.
15. 모바일 히어로 규칙과 빠른 시작 카드의 내부 좌우선을 20px 공통 inset으로 맞췄다.
16. JSON 전체 복구 또는 되돌리기 후 `opic-post-restore-navigation`으로 관리 영역을 펼치고 백업 영역으로 복귀한다. 완료는 aria-live로 안내하며 제목에는 자동 focus를 주지 않는다.
17. 학습 카드의 요약 칩, 현재 조건, 버튼 그룹은 16px stack gap을 사용하고 현재 조건은 360px 이상에서 한 줄을 우선한다.
18. 첫 문장 전용 카드, 첫 문장 연습 준비 화면, 10·15·20·전체 출제 모의고사, 3초 카운트다운과 결과 요약을 추가했다.
19. 모의고사 출제 순서와 결과는 `opic-first-line-mock-session` sessionStorage에만 저장하며 JSON 전체 백업에는 포함하지 않는다. 카드 상태와 UUID 시도 기록은 기존 localStorage 구조를 그대로 사용한다.
20. 700px 이하 첫 문장 연습·모의고사에는 정답 관련 버튼 바로 아래 42px 높이의 compact 이전/다음 행을 표시하고, 이동 시 TTS·자동 넘김·카운트다운의 기존 정리 경로를 재사용한다.

21. 카드 상세에 ID 고정 수정 화면, 카드 보관/복원, 확인이 필요한 완전 삭제를 추가했다. 보관 ID는 `opic-archived-card-ids`에 별도 저장하고 JSON v1 선택 필드로 백업한다.
22. 완전 삭제는 ID 기반 첫 문장·답변 익히기 상태와 시도, 나만의 답변, 카드 메모와 관련 세션만 정리한다. 개인 학습 메모와 저장 지문은 보존하며 새로고침 전 메모리 스냅샷으로 한 번 실행 취소할 수 있다.
23. 카드 관리 결과는 `TransientToast`로 통합했다. 알림은 하나만 유지되고 3.5초 후 사라지며, 보관·삭제 실행 취소와 `role="status"`, `aria-live="polite"`, 모바일 safe-area 배치를 사용한다.
24. `feature/cloud-backup`에는 수동 Firebase 전체 백업 업로드 1단계를 구현했다. AppBackupV1을 다시 검증해 10MB 이하 JSON을 사용자별 Storage 경로에 저장하고 SHA-256·byteSize·요약 metadata를 Firestore에 생성한다. Storage 성공 후 metadata 실패 시 업로드 파일을 정리한다.
25. Authentication/Firestore/Storage Emulator와 개발 Firebase 프로젝트에서 격리된 합성 백업 1건을 검증했다. Storage 경로, byteSize, SHA-256이 일치했고 업로드 전후 `localStorage` raw snapshot이 동일했다. 실제 사용자 학습 데이터는 업로드하지 않았다.
26. 클라우드 기능의 운영 플래그는 아직 OFF다. main 병합·Pages 배포 전에는 실제 운영 활성화, 비용·보존·다운로드/복원 정책을 별도로 승인받아야 한다.
27. `feature/cloud-backup-allowlist`에서는 `cloudBackupAllowedUsers/{uid}`의 `enabled === true`인 사용자에게만 Firestore metadata와 Storage JSON 백업 접근을 허용한다. 자기 allowlist 문서 단건 조회 외의 클라이언트 접근은 거부하며, Emulator Rules 22개와 앱 통합 검증을 통과했다. 실제 Firebase Rules와 allowlist 문서는 아직 배포·생성하지 않았다.
현재 다음 기능은 정해져 있지 않다. 새 요청을 받으면 먼저 `git status`, `git log -3`, 현재 저장소 코드를 확인하고 이어서 작업한다.

## 11. 보류하거나 하지 않기로 한 기능

- 녹음 영구 저장, 카드별 녹음 히스토리, 녹음 다운로드
- 클라우드 백업 다운로드·복원·병합·삭제·자동 동기화와 운영 기능 플래그 활성화
- 복잡한 Markdown 편집기, WYSIWYG, 임의 HTML/Markdown 엔진
- STT/Whisper, AI 답변 생성·첨삭·발음 평가·피드백
- 위 기능은 현재 범위 밖이며, 후속 단계에서 데이터/보안/비용 정책을 별도로 정한 뒤 검토한다.

## 12. 새 Codex 대화의 시작 체크리스트

1. 작업 디렉터리를 `C:\Projects\OPIcApp`으로 지정한다.
2. 이 문서와 `git status --short --branch`, `git log -3`, `package.json`을 먼저 읽는다.
3. 사용자 변경이 섞여 있으면 보존하고, 요청 범위 밖 파일을 되돌리지 않는다.
4. 저장 키와 기존 카드 ID를 바꾸기 전에 호환성 영향을 먼저 확인한다.
5. 작업 후 최소 `npm.cmd run test:all`, `npm.cmd run build`, `npm.cmd run test:pwa`를 실행한다.
6. Galaxy Chrome 관련 기능은 데스크톱 localhost만으로 완전 검증했다고 단정하지 않는다. 마이크/TTS/Wake Lock/PWA는 HTTPS 배포본에서 실제 기기 확인 항목을 별도로 보고한다.
7. 이번 다음 작업은 결과 보고가 먼저이며, 사용자의 별도 요청 없이 commit/push하지 않는다.
