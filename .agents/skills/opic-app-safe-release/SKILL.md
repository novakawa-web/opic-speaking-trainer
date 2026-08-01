---
name: opic-app-safe-release
description: Safely release an already validated OPIc Speaking Trainer feature branch by enforcing Git SHA and clean-tree gates, fast-forwarding main without history rewriting, pushing main, monitoring GitHub Pages, and performing read-only production verification. Use only when the user explicitly authorizes main ff-only merge and GitHub Pages deployment; do not use for implementation, feature commit or push, PR creation, live Firebase changes, or browser interaction with user data.
---

# OPIc App Safe Release

## 역할과 승인 경계

검증되고 원격에 push된 OPIcApp feature 브랜치를 정확한 SHA gate로
`main`에 fast-forward하고 GitHub Pages 배포를 읽기 전용으로 검증한다.

feature commit·push 승인은 release 승인이 아니다. 사용자가 현재 요청에서
`main ff-only 병합`과 `GitHub Pages 배포`를 명시적으로 승인한 경우에만
이 Skill을 사용한다. main push가 자동 배포를 시작하므로 둘 중 하나만
요청했거나 배포 의도가 불명확하면 push 전에 확인한다.

다음을 수행하지 않는다.

- source, 테스트, 문서 또는 workflow 수정
- rebase, squash, cherry-pick, force push 또는 merge commit
- PR 생성 또는 feature 브랜치 삭제
- 실패한 배포의 임의 rollback이나 재실행
- Firebase 데이터·Rules·IAM 또는 Repository Variables 변경
- 운영 앱의 클릭·입력·storage 조회
- 사용자 Chrome 프로필을 이용한 브라우저 검증

release 중 수정이 필요해지면 중단하고 `$opic-app-safe-development`의
새 feature 작업으로 되돌린다.

## 시작 전 확인

1. 저장소 루트의 `CODEX_CONTEXT.md`와 배포 workflow를 읽는다.
2. `git status --short --branch`로 현재 feature 브랜치와 dirty 상태를 확인한다.
3. `git fetch origin --prune` 후 `origin/main`과 원격 feature SHA를 확인한다.
4. local feature HEAD와 원격 feature SHA가 정확히 같은지 확인한다.
5. index와 tracked worktree가 clean인지 확인한다. 기존의 알려진 untracked
   첨부 파일은 대상에서 제외하고 수정하지 않는다.
6. `origin/main`이 feature의 ancestor인지 확인하고, divergence나 conflict
   가능성이 있으면 중단한다.
7. release 대상 파일과 commit 목록을 다시 읽어 요청 범위와 일치하는지 확인한다.
8. 실제 `package.json` 명령과 최근 검증 결과를 확인한다.

예상하지 못한 main 이동, 원격 SHA 차이, dirty tracked 파일 또는
merge conflict가 있으면 stash, reset, pull, rebase로 해결하지 않는다.
발견한 사실과 안전한 선택지를 먼저 보고한다.

## release 전 검증

release 대상 feature HEAD에서 다음을 다시 실행한다.

1. 티켓 전용 및 직접 관련 회귀 테스트
2. `npm.cmd run test:all`
3. `npm.cmd exec tsc -- --noEmit`
4. `npm.cmd run build`
5. `npm.cmd run test:pwa`
6. `npm.cmd audit`
7. `git diff --check`
8. tracked 상태와 민감정보 패턴 검사

`npm audit`은 `CODEX_CONTEXT.md`와 현재 결과를 비교해 정확한 severity와
exit code를 보고한다. 취약점이 있으면 Actions success와 별개로 기록하며
`npm audit fix --force`를 실행하지 않는다.

문서·Skill-only release라도 저장소 정책이 요구하는 전체 검증은 생략하지
않는다. 검증 실패 원인이 불명확하면 release하지 않는다.

## ff-only 병합과 main push

검증을 통과하면 다음 순서를 지킨다.

1. feature HEAD를 `releaseSha`, `origin/main`을 `mainBeforeSha`로 기록한다.
2. `git switch main`을 실행한다.
3. local main과 `origin/main`이 정확히 같은지 다시 확인한다.
4. `git merge --ff-only <feature-branch>`를 실행한다.
5. main HEAD가 `releaseSha`와 정확히 같은지 확인한다.
6. merge commit이 생기지 않았고 범위 밖 commit이 없는지 확인한다.
7. `git push origin main`을 실행한다.
8. local main과 `origin/main`이 모두 `releaseSha`인지 확인한다.
9. feature 브랜치는 local과 origin에 그대로 보존한다.

push가 거절되거나 origin/main이 움직였으면 즉시 중단한다. 자동 pull,
rebase, force push 또는 두 번째 병합을 수행하지 않는다.

## GitHub Pages 모니터링

main push의 `releaseSha`로 시작된 `.github/workflows/deploy-pages.yml`
run을 찾는다. 과거 run이나 다른 SHA의 성공을 재사용하지 않는다.

- workflow run ID, head SHA, event와 conclusion을 확인한다.
- build job과 deploy job이 모두 완료될 때까지 bounded wait로 모니터링한다.
- 각 job ID와 conclusion을 기록한다.
- GitHub deployment의 environment가 `github-pages`, SHA가 `releaseSha`,
  state가 `success`인지 확인한다.
- 실패·취소·timeout이면 원인과 마지막 확인 상태를 보고하고 멈춘다.

사용자의 새 입력이 있으면 release 범위를 바꾸는지 먼저 판단한다.
장시간 작업 중에는 단계가 바뀔 때마다 짧게 진행 상황을 알린다.

## 운영본 읽기 전용 검증

배포 성공 후 운영 URL에서 다음을 읽기 전용으로 확인한다.

- 앱 URL과 `404.html`
- `manifest.webmanifest`
- `sw.js`와 실제 Workbox import
- 배포 HTML이 참조하는 main JS·CSS
- main JS가 참조하는 lazy chunk
- 확인한 모든 현재 asset의 HTTP 200

Vite·Workbox hash 파일명은 하드코딩하지 않는다. 운영 HTML, main JS와
service worker에서 현재 이름을 파생한다.

기존 사용자 Chrome 프로필이 선택되면 즉시 중단하고 운영 브라우저 QA로
계산하지 않는다. 로그인, 클릭, 입력, localStorage·sessionStorage 조회,
Firebase 호출 또는 사용자 데이터 변경을 하지 않는다.

HTTP·asset 검증은 기능·Galaxy·접근성 검증을 대신하지 않는다. release 전
격리 브라우저와 사용자 Galaxy 검증 결과를 별도로 구분해 보고한다.

## 완료 보고

다음을 보고한다.

1. feature 브랜치와 보존 여부
2. `mainBeforeSha`와 최종 `releaseSha`
3. ff-only 여부와 금지된 history 작업 미수행
4. release 전 자동검증·TypeScript·build·PWA·audit 결과
5. Actions run과 build·deploy job ID 및 conclusion
6. Pages deployment ID, environment와 production URL
7. 동적으로 확인한 asset과 HTTP 결과
8. 운영 Firebase와 사용자 storage 접근 여부
9. 브라우저·Galaxy에서 확인하지 않은 항목
10. 최종 Git 상태와 남아 있는 안전한 다음 작업

확인하지 못한 상태를 성공으로 기록하지 않는다.

## 중단 조건

다음이면 release를 멈춘다.

- 명시적인 main·Pages 승인이 없음
- feature HEAD와 원격 feature SHA가 다름
- origin/main이 예상 SHA와 다르거나 feature의 ancestor가 아님
- tracked worktree 또는 index가 dirty
- 검증 실패 또는 audit 기준의 설명되지 않은 악화
- ff-only 병합 불가 또는 push 거절
- Actions run을 release SHA와 연결할 수 없음
- build·deploy job 또는 deployment 실패
- 운영 asset이 200이 아님
- 사용자 데이터나 live Firebase 접근 없이는 검증할 수 없음
- 민감정보 발견

중단 시 reset, revert, rollback, workflow 재실행 또는 force push를 임의로
수행하지 않는다. 현재 SHA, 실패 지점, 가능한 선택지와 추천안을 보고한다.
