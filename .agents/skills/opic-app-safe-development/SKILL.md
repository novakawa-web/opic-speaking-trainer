---
name: opic-app-safe-development
description: Safely investigate, implement, and validate OPIc Speaking Trainer work, including plan-only investigations, CODEX_CONTEXT.md or repository-skill maintenance, scoped feature additions, bug fixes, UI/UX polish, storage changes, and tests. Use for OPIcApp work that should run on a codex-prefixed feature branch and stop before main merge, main push, GitHub Pages deployment, live Firebase operations, or Galaxy device interaction.
---

# OPIc App Safe Development

## 역할

OPIc Speaking Trainer의 조사, 문서·저장소 Skill 정비, 기능 추가,
버그 수정, 작은 UI·UX 개선, storage 관련 변경과 테스트 추가를
일관된 안전 절차로 수행한다.

개발과 검증까지만 담당한다.

다음을 수행하지 않는다.

- main 병합 또는 main push
- GitHub Pages 운영 배포
- 운영 Firebase 데이터·Rules·IAM 작업
- Repository Variables 변경
- Galaxy 기기의 실제 조작
- 영어 지문이나 학습 콘텐츠 제작
- 다른 저장소의 일반 개발 작업

사용자가 main ff-only 병합과 Pages 배포를 명시적으로 별도 요청하면
이 Skill의 범위를 종료하고 `$opic-app-safe-release`로 인계한다.

## 필요한 사용자 입력

다음 정보만 필수로 받는다.

- 해결할 문제 또는 구현할 기능
- 원하는 최종 동작
- feature 브랜치 commit·push 허용 여부

다음 정보는 실제 코드와 문서만으로 확인할 수 없을 때만 요청한다.

- 재현 단계
- 관련 화면
- Galaxy에서 직접 확인한 결과

`CODEX_CONTEXT.md`, 실제 코드, `package.json`, Git 상태에서 확인할 수
있는 사항은 사용자에게 다시 묻지 않는다.

commit·push 허용 여부가 명확하지 않으면 기본값을 금지로 처리한다.

## 작업 시작 전 점검

작업 전에 다음 순서로 확인한다.

1. 저장소 루트의 `CODEX_CONTEXT.md`를 완전히 읽는다.
2. 실제 코드와 현재 테스트를 source of truth로 확인한다.
3. 현재 브랜치와 HEAD를 확인한다.
4. `origin`을 fetch하고 `origin/main`의 최신 SHA를 확인한다.
5. 작업 트리와 index가 clean인지 확인한다.
6. `.env.local`과 `data/`가 Git에서 제외되는지 확인한다.
7. 실행 중인 개발 서버와 Firebase Emulator를 확인한다.
8. 임시 로그·테스트 파일·민감정보가 없는지 확인한다.
9. 현재 `package.json`의 실제 명령을 확인한다.

기준이 예상과 다르면 merge, reset, stash 또는 기존 변경 수정을
임의로 수행하지 않는다. 발견한 차이와 안전한 선택지를 먼저 보고한다.

`CODEX_CONTEXT.md`보다 실제 코드가 최신이면 실제 코드를 우선하고
문서 불일치를 보고한다. 티켓 범위에 문서 변경이 포함되지 않았다면
문서를 임의로 수정하지 않는다.

## 브랜치 정책

- main에서 직접 수정하지 않는다.
- 최신 main에서 목적이 분명한 브랜치를 만든다.
- 기능은 `codex/feature-<purpose>`를 사용한다.
- 오류 수정은 `codex/fix-<purpose>`를 사용한다.
- 문서·도구·정비는 `codex/chore-<purpose>`를 사용한다.
- 기존 feature 브랜치에서 계속하라는 요청이면 해당 브랜치와 원격
  SHA를 확인한 뒤 작업한다.
- 진행 중인 다른 feature가 있으면 사용자 의도를 확인한다.
- 명시적 요청 없이 rebase, squash, cherry-pick, force push 또는
  history rewrite를 수행하지 않는다.
- 충돌이 발생하면 임의로 해결하지 않고 중단한다.
- feature 브랜치를 임의로 삭제하지 않는다.

## 범위 제한

요청한 티켓에 직접 필요한 변경만 수행한다.

사용자의 현재 요청이 조사·초안 작성·기술 가능성 확인뿐이라면,
사용자가 명시적으로 구현을 요청하기 전에는 파일을 수정하거나
브랜치를 만들지 않는다.

다른 문제를 발견하면 다음 중 하나로 분리한다.

- 완료 보고의 후속 제안
- `CODEX_CONTEXT.md` backlog
- 별도 티켓

사용자 요청 없이 큰 리팩터링, 공통화 또는 공개 계약 변경을 작은
UX 수정에 섞지 않는다.

다음 영역은 기본적으로 변경하지 않는다.

- localStorage·sessionStorage 키 이름
- JSON·TSV·AppBackup 공개 스키마
- Firebase 서비스·Rules·IAM
- GitHub workflow
- Repository Variables
- `package-lock.json`
- 기본 카드 데이터
- 클라우드 자동 동기화·복원

티켓이 해당 영역을 명시적으로 요구하면 변경 전에 별도 영향 분석과
롤백 계획을 세운다.

기존 공개 계약을 변경하지 않고는 요구사항을 구현할 수 없으면 먼저
중단하고 필요한 변경과 위험을 설명한다.

## 프로젝트 문서와 저장소 Skill 정비

`CODEX_CONTEXT.md`를 동기화할 때는 live Git, 실제 source,
`package.json`, 현재 audit와 GitHub Pages 증거를 문서보다 우선한다.

- main·배포 SHA와 Actions·job·deployment ID를 직접 확인한다.
- 테스트 표는 현재 `package.json`의 스크립트와 실제 통과 개수를 합산한다.
- Vite asset 이름은 운영 HTML과 main JS에서 동적으로 찾고 고정하지 않는다.
- 완료된 작업을 backlog에서 제거하고 사용자가 거절한 기능은 되살리지 않는다.
- 문서 전용 변경은 브라우저 검증을 생략한 이유를 보고한다.

저장소 Skill을 만들거나 고칠 때는 `$skill-creator`를 함께 사용한다.
기존 Skill이 500줄에 가까워지거나 독립된 승인·위험 경계를 두 개 이상
다룰 때만 reference 또는 별도 Skill로 분리한다. `quick_validate.py`와
UTF-8 YAML 파싱으로 `SKILL.md`와 `agents/openai.yaml`을 검증한다.

## 코드 조사 원칙

구현 전에 다음을 수행한다.

- 관련 컴포넌트, hook, utility와 테스트를 확인한다.
- 실제 데이터 타입과 저장 형식을 확인한다.
- 기존 parser, validator, normalizer와 serializer를 재사용한다.
- 기존 UI 패턴, 접근성 규칙과 navigation handler를 재사용한다.
- 현상의 실제 원인을 먼저 확인한다.
- 추측으로 여러 파일에 CSS나 조건문을 추가하지 않는다.
- 순수 helper나 상태 전이로 분리할 수 있는 로직은 실제 실행 가능한
  테스트와 함께 분리한다.
- source string 존재 검사만으로 동작 검증을 대신하지 않는다.

파일 수정 전 변경 대상과 변경 금지 대상을 확정한다.

## 데이터와 storage 안전 원칙

현재 앱의 localStorage 중심 저장 정책과 기존 공개 계약을 유지한다.

저장이 필요한 변경에서는 다음 순서를 사용한다.

1. 현재 semantic 상태를 읽는다.
2. 모든 next state와 raw 저장값을 메모리에서 계산한다.
3. 기존 parser와 validator로 결과를 검증한다.
4. 여러 key가 바뀌면 기존 storage transaction을 사용한다.
5. storage 적용이 모두 성공한 후에만 React 확정 상태를 반영한다.
6. 저장 실패 시 draft와 이전 React 상태를 유지한다.
7. rollback 실패는 일반 오류와 구분해 고위험 상태로 안내한다.

오류·로그·toast에 다음 내용을 넣지 않는다.

- 카드 전체 답변
- 나만의 답변
- 카드 메모 또는 개인 메모 본문
- raw JSON
- 저장 지문 본문
- Firebase 식별자와 전체 경로

실제 사용자 origin에서 파괴적 테스트를 수행하지 않는다.
운영 Firebase를 자동으로 초기화하거나 접근하지 않는다.

기존 forgiving saver가 남아 있어도 티켓 범위 밖에서 일괄 교체하지
않고 관련 위험을 보고한다.

## 테스트 정책

수정 내용에 맞는 전용 테스트를 먼저 작성하거나 강화한다.

항상 다음을 실행한다.

1. 티켓 전용 테스트
2. 직접 관련된 기능 회귀 테스트
3. `npm.cmd run test:all`
4. `npm.cmd exec tsc -- --noEmit`
5. `npm.cmd run build`
6. `npm.cmd run test:pwa`
7. `npm.cmd audit`
8. `git diff --check`
9. 변경 diff 민감정보 패턴 검사

`package.json`에 없는 명령을 추측하지 않는다.
현재 `package.json`에서 명령을 다시 확인한다.

다음 영역이 관련될 때 해당 테스트를 추가한다.

- 카드 삭제 transaction
- 카드 삭제 plan
- storage transaction
- JSON·TSV round-trip
- UI session
- 클라우드 백업
- demo Emulator Security Rules
- 접근성
- 반응형 레이아웃

Rules 테스트는 기존 demo project ID와 로컬 Emulator만 사용한다.
실제 Firebase 프로젝트에는 접근하지 않는다.

테스트 개수를 고정된 영구 기준으로 가정하지 않는다. 최신 main의
현재 기준 이상인지 확인하고 증감 이유를 설명한다.

테스트 실패 원인이 불명확하면 통과로 간주하거나 unrelated failure로
임의 분류하지 않는다.

## 격리 브라우저 검증 정책

브라우저 검증은 실제 사용자 origin과 분리된 localhost 또는 LAN
origin에서 수행한다.

- 사용하지 않는 별도 포트를 선택한다.
- `VITE_CLOUD_BACKUP_ENABLED=false`를 서버 프로세스에만 적용한다.
- `.env.local`을 수정하지 않는다.
- 합성 카드와 폐기 가능한 데이터만 사용한다.
- 실제 Firebase에 접근하지 않는다.
- 운영 Pages의 사용자 데이터를 변경하지 않는다.
- 파괴적 흐름은 반드시 격리 origin에서만 검증한다.

다음을 확인한다.

- 요청 기능의 정상 흐름
- 관련 회귀 흐름
- 오류와 실패 흐름
- 360px, 390px, 412px, 700px, 1280px
- 라이트·다크 모드
- 가로 넘침
- 접근성 이름과 키보드 조작
- 콘솔 오류·경고

검증 후 다음을 정리한다.

- 합성 데이터
- 임시 파일과 로그
- 개발 서버
- Emulator
- 임시 포트

정리 후 Git 상태와 diff 지문이 시작 전과 같은지 확인한다.

사용자 데이터와 분리된 브라우저 프로필을 보장할 수 없으면 운영
브라우저 검증을 시작하지 않는다.

브라우저 자동화가 Windows ACL, 브라우저 연결 또는 환경 문제로
실패하면 통과로 간주하지 않는다. 다음을 보고한다.

- 실패 원인
- 자동으로 확인하지 못한 항목
- Galaxy에서 확인할 최소 항목

## Galaxy 검증 경계

실제 Galaxy 동작이 필요한 경우 Codex가 임의로 통과 처리하지 않는다.

Galaxy 검증이 필요한 대표 사례는 다음과 같다.

- 실제 영어 TTS
- 모바일 터치 조작
- 스크롤 사용감
- 다운로드 피드백
- 반응형 시각 중심
- 마이크와 브라우저 권한

필요한 경우 다음 절차를 사용한다.

1. 격리 개발 서버만 준비한다.
2. 정확한 Galaxy LAN URL을 제공한다.
3. 짧고 순서가 명확한 체크리스트를 제공한다.
4. 서버를 유지하고 사용자의 결과를 기다린다.
5. 사용자 완료 후 서버와 포트를 종료한다.
6. Git 상태와 diff 지문 불변을 확인한다.

사용자가 확인하지 않은 항목을 성공으로 기록하지 않는다.

## commit·push 정책

기본 구현 단계에서는 commit과 push를 수행하지 않는다.

사용자가 feature commit·push를 승인한 경우에만 다음을 수행한다.

1. 현재 브랜치, 기준 SHA와 변경 파일을 다시 확인한다.
2. 전체 검증을 다시 실행한다.
3. 허용된 파일만 명시적으로 stage한다.
4. feature 브랜치에만 commit한다.
5. 동일한 원격 feature 브랜치에만 push한다.
6. 최종 SHA와 원격 브랜치 주소를 보고한다.

항상 다음을 금지한다.

- main 병합
- main push
- PR 생성
- Pages 배포
- force push
- feature 브랜치 삭제

push 후에는 멈춘다. feature commit·push 승인을 main release 승인으로
간주하지 않는다. main 병합·배포 요청은 `$opic-app-safe-release`의
독립 작업으로 처리한다.

## 완료 보고 형식

완료 보고에 다음을 포함한다.

1. 작업 브랜치와 기준 SHA
2. 확인한 실제 원인
3. 구현 방식과 주요 상태 전이
4. 변경 파일
5. 전용 테스트 결과
6. 전체 자동 테스트 결과
7. TypeScript·build·PWA·audit 결과
8. 격리 브라우저 검증 결과
9. Galaxy에서 확인했거나 확인할 항목
10. 저장 키·JSON·TSV·AppBackup 스키마 영향
11. 실제 사용자 storage 접근 여부
12. 실제 Firebase 접근 여부
13. commit·push 여부
14. 최종 Git 상태
15. 다음 안전 단계

확인하지 못한 사실을 확인한 것처럼 쓰지 않는다.
자동 테스트, 브라우저 검증과 Galaxy 실기 결과를 구분한다.

## 중단 조건

다음 상황에서는 임의로 진행하지 않는다.

- `origin/main`이 예상 SHA와 다름
- 작업 트리나 index가 예상과 다르게 dirty
- 기존 사용자 변경과 수정 범위가 충돌함
- 요청 범위 밖 공개 계약 변경이 필요함
- storage migration이 필요함
- Firebase·Rules·IAM 변경이 필요함
- `package-lock.json`에 의도하지 않은 대량 변경이 발생함
- 테스트 실패 원인이 불명확함
- 브라우저 자동화 실패를 기능 통과로 대신해야 함
- 실제 사용자 데이터로만 검증할 수 있음
- merge conflict가 발생함
- 민감정보가 발견됨

중단할 때 다음만 명확히 보고한다.

- 발견한 사실
- 현재 위험
- 가능한 선택지
- 추천 선택지

사용자 승인 없이 범위를 확대하거나 위험한 복구 작업을 수행하지 않는다.
