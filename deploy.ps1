$ErrorActionPreference = "Stop"
Write-Host "=== Korea Prospect Agent / Vercel Deploy ===" -ForegroundColor Cyan

if (-not (Get-Command vercel -ErrorAction SilentlyContinue)) {
  Write-Host "Vercel CLI 설치 중..." -ForegroundColor Yellow
  npm install -g vercel
}

Write-Host "`n1) Vercel 로그인" -ForegroundColor Cyan
vercel login

Write-Host "`n2) 현재 폴더를 Vercel 프로젝트에 연결 / Preview 배포" -ForegroundColor Cyan
vercel

Write-Host "`n3) GROQ_API_KEY는 Vercel Dashboard > Project Settings > Environment Variables에 등록하세요." -ForegroundColor Yellow
Write-Host "등록 후 Production 배포: vercel --prod" -ForegroundColor Green
