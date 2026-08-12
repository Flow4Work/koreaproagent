$ErrorActionPreference = "Stop"

$ExpectedRepo = "Flow4Work/koreaproagent"
$ExpectedProject = "koreaproagent"
$ScopeArgs = @()
if ($env:VERCEL_SCOPE) {
  $ScopeArgs = @('--scope', $env:VERCEL_SCOPE)
}

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

Write-Host "Vercel 계정/기존 프로젝트 확인 중..." -ForegroundColor Cyan
$who = (vercel whoami).Trim()
if (-not $who) {
  throw "Vercel 로그인이 필요합니다. 먼저 vercel login을 실행하세요."
}

# 먼저 기존 프로젝트가 현재 Vercel 계정/선택 scope에 실제로 존재하는지 검사한다.
# 존재하지 않으면 여기서 중단하여 이름이 비슷한 새 프로젝트가 생성되는 것을 막는다.
vercel project inspect $ExpectedProject @ScopeArgs | Out-Null

# 검증된 기존 프로젝트에만 명시적으로 링크한다.
vercel link --yes --project $ExpectedProject @ScopeArgs | Out-Null

$scopeLabel = if ($env:VERCEL_SCOPE) { "$($env:VERCEL_SCOPE)/" } else { "" }
Write-Host "Production 배포: $scopeLabel$ExpectedProject @ $localSha" -ForegroundColor Green
vercel --prod --yes --project $ExpectedProject @ScopeArgs
