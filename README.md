# Korea Prospect Agent MVP

해외 SaaS/AI 회사 URL을 넣으면 **한국 잠재고객 후보 + 구매 신호 + 공개 근거 + 담당 직책 + 개인화 메시지**를 생성하는 내부 영업 리서치 도구입니다.

## 판매용 산출물

- 한국 잠재고객 우선순위
- 각 기업이 적합한 이유
- 현재 구매 신호와 근거 URL
- 공개적으로 검증된 담당자 후보(있는 경우만)
- 담당자가 불명확할 때 추천 직책 + 검색 쿼리
- 기업별 한국어/영어 아웃바운드 메시지
- CSV / JSON 내보내기

**개인 이름·이메일은 추측하지 않습니다.** 공개 출처가 없으면 빈 값으로 남깁니다.

## 가장 빠른 Vercel 배포

1. Vercel → Add New → Project → `Flow4Work/koreaproagent` Import.
2. Framework Preset은 `Other` 그대로 사용합니다.
3. Project Settings → Environment Variables에 아래를 추가합니다.

```text
GROQ_API_KEY=본인_Groq_API_Key
GROQ_MODEL=groq/compound
```

4. Redeploy 후 `/api/health`에서 `groqConfigured: true`인지 확인합니다.

## 로컬 실행

```powershell
npm i -g vercel
vercel login
vercel dev
```

## 모드

- **Fast**: `groq/compound-mini`
- **Deep**: `groq/compound`

처음에는 잠재고객 5~8개로 품질을 확인하세요.
