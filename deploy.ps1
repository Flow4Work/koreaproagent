$ErrorActionPreference = "Stop"

$ExpectedRepo = "Flow4Work/koreaproagent"
$ExpectedProject = "koreaproagent"
$ExpectedScope = "daijobu1"

Write-Host "=== Korea Agent / Safe Vercel Production Deploy ===" -ForegroundColor Cyan

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw "Git이 설치되어 있지 않습니다."
}

if (-not (Get-Command vercel -ErrorAction SilentlyContinue)) {
  Write-Host "Vercel CLI 설치 중..." -ForegroundColor Yellow
  npm install -g vercel
}

$repoRoot = (git rev-parse --show-toplevel 2>$null).Trim()
if (-not $repoRoot) {
  throw "Git 저장소 안에서 실행해야 합니다."
}
Set-Location $repoRoot

$origin = (git remote get-url origin).Trim()
if ($origin -notmatch 'Flow4Work[\\/]koreaproagent(?:\.git)?$') {
  throw "잘못된 저장소입니다. origin=$origin / expected=$ExpectedRepo"
}

$branch = (git branch --show-current).Trim()
if ($branch -ne "main") {
  throw "Production 배포는 main 브랜치에서만 허용합니다. 현재 브랜치: $branch"
}

$dirty = git status --porcelain
if ($dirty) {
  throw "로컬 변경사항이 있습니다. 코드 수정 없이 배포하려면 working tree를 먼저 정리하세요."
}

Write-Host "최신 origin/main 확인 중..." -ForegroundColor Cyan
git fetch origin main | Out-Null
$localSha = (git rev-parse HEAD).Trim()
$remoteSha = (git rev-parse origin/main).Trim()
if ($localSha -ne $remoteSha) {
  throw "현재 main이 최신 origin/main과 다릅니다. local=$localSha remote=$remoteSha"
}

Write-Host "Vercel 계정/프로젝트 확인 중..." -ForegroundColor Cyan
vercel whoami | Out-Null
vercel project inspect $ExpectedProject --scope $ExpectedScope | Out-Null

# 프로젝트가 실제로 존재하는지 확인한 뒤에만 링크한다.
# --project와 --scope를 고정해 새 프로젝트가 실수로 생성되는 경로를 차단한다.
vercel link --yes --project $ExpectedProject --scope $ExpectedScope | Out-Null

Write-Host "Production 배포: $ExpectedScope/$ExpectedProject @ $localSha" -ForegroundColor Green
vercel --prod --yes --project $ExpectedProject --scope $ExpectedScope
