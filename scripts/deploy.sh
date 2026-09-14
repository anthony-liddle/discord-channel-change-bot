#!/bin/sh
# Deploys to Fly with the deploy marker baked in.
#
# The marker cannot be derived inside the image, because .dockerignore excludes
# .git, so both values are passed as build args. This script exists rather than
# a documented flag because a build arg you have to remember to type is the same
# failure mode as a constant you have to remember to bump, which is what this
# whole mechanism replaced.
#
# The commit date is used rather than the wall clock date. It is what the commit
# says about itself, it is identical whoever builds it and whenever they build
# it, and it cannot drift from the SHA beside it.
set -eu

if git diff --quiet HEAD 2>/dev/null; then
  GIT_SHA=$(git rev-parse HEAD)
  GIT_DATE=$(git show -s --format=%cs HEAD)
else
  # Uncommitted changes mean the image matches no commit. Say so rather than
  # shipping a marker that names a commit which is not what actually ran.
  echo "Working tree is dirty. The deploy marker will read 'unknown'." >&2
  GIT_SHA=dirty
  GIT_DATE=dirty
fi

exec flyctl deploy --remote-only \
  --build-arg "GIT_SHA=$GIT_SHA" \
  --build-arg "GIT_DATE=$GIT_DATE"
