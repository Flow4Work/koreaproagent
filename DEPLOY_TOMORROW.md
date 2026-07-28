# KoreaProAgent v4 — 내일 배포 인수인계

대상 브랜치: `revamp/outbound-engine-v4`
목표 빌드: `outbound-v4 / 2026.07.29-rc1`

## 배포 전

```powershell
git fetch origin
git checkout revamp/outbound-engine-v4
git pull origin revamp/outbound-engine-v4
npm run check
```

`npm run check`가 실패하면 배포하지 않는다.

## 확인할 핵심 변경

- 랜딩형 상단 카드/통계 박스 제거, 결과 중심 내부 도구 UI
- Tavily 다중 검색 병렬화 + warm-instance 캐시
- 회사별 검증 요청을 일괄 병렬 검증으로 변경
- 회사 후보를 먼저 표시하고 연락처/한국 계정은 뒤에서 점진 보강
- 연락처는 Sales/BD/Partnerships/APAC/Growth/Founder/CEO 등 GTM 의사결정자만 표시
- 한국 테스트 계정은 직접 근거 + 현재 구매신호 + 제품/문제 적합성이 동시에 있을 때만 표시
- 메일 본문은 영어 전용 필드만 사용
- 실패한 연락처/한국 계정은 개별 재시도 가능
- 마음에 안 드는 회사는 `제외`하면 이후 탐색에서 제외
- `발송 가능만` 필터, 메일 복사, 근거 링크 제공
- OpenCode Zen 기본 모델 장애/제한 시 다른 무료 Zen 모델로 fallback
- `/api/version`으로 실제 배포된 빌드 확인 가능

## Production 배포

브랜치 검증 후 main에 반영하고 Production 배포한다.

```powershell
git checkout main
git pull origin main
git merge --ff-only revamp/outbound-engine-v4
npm run check
git push origin main
vercel --prod
```

GitHub/Vercel 자동 Production 연결이 확실히 정상화된 뒤에는 `vercel --prod` 수동 호출을 생략해도 된다.

## 배포 후 필수 QA

1. `https://koreaproagent-eta.vercel.app/api/version`에서 `build=outbound-v4` 확인
2. 첫 화면에 `오늘 영업 돌리기`, `탐색/이메일/샘플/발송 준비` 4칸이 보이면 실패
3. 첫 화면이 `영업 후보` + `새 후보 찾기` 중심인지 확인
4. 새 후보 찾기 1회 실행
5. 회사 후보가 먼저 표시되고 이후 연락처/한국 계정이 순차적으로 채워지는지 확인
6. General Counsel/Engineer 등 비GTM 담당자가 메일 대상으로 나오지 않는지 확인
7. 메일 미리보기에 한글 문장이 섞이지 않는지 확인
8. `제외`한 회사가 다음 실행에서 재등장하지 않는지 확인
9. 실패 항목의 `재시도`가 전체 탐색을 다시 돌리지 않고 해당 회사만 보강하는지 확인
10. 모바일 390px에서 가로 스크롤/버튼 잘림 여부 확인

QA 1~10 중 하나라도 실패하면 Production 완료로 보고하지 않는다.
