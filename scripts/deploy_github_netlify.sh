#!/usr/bin/env bash
set -euo pipefail

if [ -z "${GITHUB_REPO_URL:-}" ]; then
  echo "请先设置 GITHUB_REPO_URL，例如："
  echo "export GITHUB_REPO_URL=git@github.com:你的用户名/chainpulse-library.git"
  exit 1
fi

git init
git add .
git commit -m "Deploy ChainPulse paid library" || true
git branch -M main

if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "$GITHUB_REPO_URL"
else
  git remote add origin "$GITHUB_REPO_URL"
fi

git push -u origin main

echo "已推送到 GitHub。"
echo "接下来在 Netlify 选择：Add new site -> Import from Git -> 选择该仓库。"
echo "Build command 留空，Publish directory 填 public。"
