# OPIc Speaking Trainer

영어 질문을 보고 먼저 혼자 말한 뒤, 필요할 때 힌트와 대표 답변을 확인하는 React 기반 OPIc 학습 MVP입니다.

## 포함된 기능

- 카드 목록과 상세 화면
- 덱·태그 필터
- `final_rep` 카드 전용 필터
- 힌트와 대표 답변 독립 토글
- 첫 문장 훈련 모드
- 성공·다시·어려움 상태 기록
- 첫 문장 어려움 카드 전용 필터
- `localStorage`를 이용한 상태 유지
- 라이트·다크 모드와 테마 설정 유지
- 날짜별 첫 문장 시도 이력과 오늘 통계
- 필터 결과 기준 카드 진행률과 이전·다음 이동
- 차분한 카드 전환 효과와 모션 감소 설정 지원
- 모바일 대응 레이아웃

현재 샘플 데이터는 6주차 카드 3개만 포함합니다. TSV 가져오기, 녹음, 쉐도잉, AI 피드백은 다음 단계용으로 남겨두었습니다.

## 설치 및 실행

Node.js가 설치된 터미널에서 아래 명령을 실행합니다.

```bash
npm install
npm run dev
```

터미널에 표시되는 로컬 주소(기본값 `http://localhost:5173`)를 브라우저에서 엽니다.

프로덕션 빌드를 확인하려면 다음 명령을 사용합니다.

```bash
npm run build
npm run preview
```

pnpm을 사용하는 경우 `npm` 대신 `pnpm`을 사용해도 됩니다.

## GitHub Pages 및 PWA

- 배포 주소: `https://novakawa-web.github.io/opic-speaking-trainer/`
- 프로덕션 base 경로: `/opic-speaking-trainer/`
- `main` 브랜치에 push하면 GitHub Actions가 테스트, 빌드, PWA 검증 후 Pages에 배포합니다.
- 앱은 설치 가능한 PWA이며 앱 셸을 오프라인 캐시합니다.
- 새 버전은 강제 새로고침하지 않고 앱 안의 업데이트 안내에서 사용자가 적용합니다.
- GitHub Pages의 직접 경로 새로고침을 위해 빌드 후 `404.html`을 생성합니다.

로컬에서 전체 검증하려면 다음 명령을 사용합니다.

```bash
npm run test:all
npm run build
npm run test:pwa
```

## 데이터와 상태 저장

- 샘플 카드: `src/data/cards.ts`
- 카드 타입: `src/types.ts`
- 첫 문장 상태 저장 키: `opic-first-line-statuses`
- 첫 문장 시도 이력 키: `opic-first-line-attempts-by-date`
- 테마 설정 키: `opic-theme-mode`

첫 문장 상태는 현재 브라우저의 `localStorage`에만 저장됩니다.
