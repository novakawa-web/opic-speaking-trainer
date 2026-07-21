# OPIc Speaking Trainer

OPIc 질문 카드로 첫 문장부터 전체 답변까지 단계적으로 연습하는 개인용 React·TypeScript PWA입니다. 학습 데이터는 현재 브라우저의 로컬 저장소를 원본으로 유지하며, Galaxy Chrome을 포함한 모바일 사용을 우선해 설계했습니다.

- 운영 앱: <https://novakawa-web.github.io/opic-speaking-trainer/>
- 설치 가능한 PWA이며 앱 셸을 오프라인에서 사용할 수 있습니다.
- 사용자 TSV로 카드를 추가하거나 교체할 수 있으므로 카드 수는 사용자 데이터에 따라 달라집니다.

## 주요 기능

### 학습

- 첫 문장 일반 연습과 10·15·20·전체 출제 모의고사
- 3초 카운트다운, 결과 요약, 어려운 카드 다시 도전
- 첫 문장 상태·날짜별 시도 기록과 실행 취소
- 기본 답변과 카드별 나만의 답변
- 별도 상태와 통계를 사용하는 답변 익히기
- 전체·문단·문장 단위 쉐도잉
- 영어 TTS의 5단계 속도, 반복 횟수, 문장 사이 휴식
- 녹음 후 즉시 듣기, 다시 녹음, 삭제

녹음 Blob과 재생 URL은 현재 화면의 메모리에만 존재합니다. 녹음 파일은 localStorage, sessionStorage, JSON 백업, 클라우드 또는 서버에 저장하지 않습니다.

### 카드와 개인 데이터

- 필터·정렬·20장 단위 표시를 제공하는 카드 라이브러리
- ID를 유지하는 카드 직접 수정
- 카드 보관·복원과 보관 상태 필터
- 확인 후 카드 완전 삭제와 새로고침 전 한 번 실행 취소
- 카드별 여러 메모와 전체 메모 검색
- 카드와 연결되지 않는 개인 학습 메모와 제한적 Markdown 표시
- 여러 저장 지문과 쉐도잉 연습

### 가져오기와 백업

- 고정 13열 형식의 TSV 가져오기·내보내기
- 파일 선택, 검증·미리보기, 실제 실행의 분리
- JSON 전체 백업·복구, 복구 직전 안전 백업과 한 번 되돌리기
- Google 로그인과 UID allowlist를 사용하는 수동 클라우드 전체 백업

클라우드 기능은 현재 **업로드와 최근 백업 목록 확인 전용**입니다. 클라우드 다운로드, 복원, 병합, 삭제 UI, 자동 업로드 및 자동 동기화는 구현하지 않았습니다. 로컬 저장소가 계속 유일한 학습 데이터 원본입니다.

## 설치 및 개발 시작

Node.js가 설치된 환경에서 저장소를 받은 뒤 다음 명령을 실행합니다.

```bash
npm ci
npm run dev
```

Windows PowerShell에서 실행 정책 때문에 `npm.ps1`이 차단되면 `npm.cmd`를 사용할 수 있습니다.

```powershell
npm.cmd ci
npm.cmd run dev
```

기본 개발 주소는 `http://localhost:5173`입니다. 마이크는 secure context가 필요하므로 실제 Galaxy 녹음 검증은 HTTPS 운영 앱에서 진행합니다.

## 검증과 프로덕션 빌드

`package.json`에 정의된 전체 자동 테스트와 빌드를 실행합니다.

```powershell
npm.cmd run test:all
npm.cmd run build
npm.cmd run test:pwa
```

- `build`는 `tsc -b`와 Vite production build를 실행하고, postbuild에서 Pages용 `404.html`을 생성합니다.
- `test:pwa`는 build 후 생성된 Pages·PWA 산출물을 검사합니다.
- Firebase Security Rules 테스트는 로컬 Firestore·Storage Emulator가 실행 중일 때 `npm.cmd run test:cloud-rules`로 별도 실행합니다.

## 배포와 업데이트

- production base 경로는 `/opic-speaking-trainer/`입니다.
- `main` push에서만 GitHub Actions가 테스트, 빌드, PWA 검증 및 GitHub Pages 배포를 실행합니다.
- service worker는 앱 셸을 오프라인 캐시합니다.
- 새 버전은 앱 안의 업데이트 안내에서 사용자가 적용합니다.
- GitHub Pages 직접 경로 새로고침을 위해 `404.html` fallback을 사용합니다.

## 데이터 안전 원칙

- 카드 ID를 유지해 첫 문장·답변 익히기 기록과 사용자 데이터를 연결합니다.
- 기본 답변과 나만의 답변은 서로 다른 데이터로 저장합니다.
- TSV는 카드 기본 데이터 전용이며 메모·기록·저장 지문을 포함하지 않습니다.
- JSON 전체 백업은 장기 학습 데이터와 설정을 이동하는 기준 형식입니다.
- 클라우드 백업은 로컬 JSON의 복사본이며 로컬 데이터를 자동 변경하지 않습니다.
- 위험한 관리 작업 전에는 먼저 JSON 전체 백업을 권장합니다.

내부 저장 구조와 개발 규칙은 [CODEX_CONTEXT.md](CODEX_CONTEXT.md), Firebase 운영·장애 대응은 [CLOUD_BACKUP_OPERATIONS.md](CLOUD_BACKUP_OPERATIONS.md)를 참고하세요.
