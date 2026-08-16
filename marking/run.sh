#!/bin/bash
docker run --rm \
  --network none --memory 256m --cpus 1 --pids-limit 64 \
  --cap-drop ALL --security-opt no-new-privileges \
  -v "$PWD/questions/$1:/cases:ro" \
  -v "$PWD/submissions/$2:/submission:ro" \
  -v "$PWD/out:/out" \
  -e CASES=/cases/cases.yaml \
  marking
