#!/bin/bash
# git-credential-helper.sh
# Routes git HTTPS credentials to the appropriate env-var token based on the remote host.
#
# Token routing:
#   *.github.com / github.com  → GITHUB_TOKEN
#   *                          → GITEA_TOKEN  (self-hosted Gitea, Forgejo, GitLab, etc.)
#
# Git calls this script with "get" as the first argument and writes the credential
# context (protocol, host, path) to stdin.  We only need to handle "get".

[ "${1:-}" = "get" ] || exit 0

host=""
while IFS= read -r line && [ -n "$line" ]; do
  case "$line" in
    host=*) host="${line#host=}" ;;
  esac
done

case "$host" in
  *github.com)
    token="${GITHUB_TOKEN:-}"
    ;;
  *)
    token="${GITEA_TOKEN:-}"
    ;;
esac

if [ -n "${token}" ]; then
  echo "username=x-access-token"
  echo "password=${token}"
fi
