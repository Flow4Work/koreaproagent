# Vercel 배포

## 같은 GitHub를 쓰는 경우

`Flow4Work/koreaproagent`를 Vercel에서 Import하면 됩니다.

Vercel → Add New → Project → GitHub에서 `koreaproagent` 검색 → Import → Deploy.

단, **같은 GitHub 계정을 서로 다른 Vercel 사용자 계정에 동시에 Git 연동하는 방식은 피하세요.** 2026년 현재 Vercel은 GitHub 계정과 Vercel 사용자 계정의 연결을 1:1로 운영한다고 안내하고 있어, 다른 Vercel 계정에 다시 연결하면 기존 Git 연동 배포가 꼬일 수 있습니다.

### 다른 Vercel 계정으로 꼭 배포해야 할 때

GitHub 자동연동 대신 해당 Vercel 계정으로 CLI 로그인 후 이 프로젝트 폴더에서 실행합니다.

```powershell
npm i -g vercel
vercel login
vercel
vercel --prod
```

또는 운영 목적상 별도의 GitHub 계정/소유 저장소를 사용하는 방법이 있습니다.

## 필수 환경변수

```text
GROQ_API_KEY=본인키
GROQ_MODEL=groq/compound
```

배포 후 `/api/health`에서 `groqConfigured: true`를 확인하세요.
