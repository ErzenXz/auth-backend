#!/bin/sh
echo "Starting XENSystem API..."
export INFISICAL_TOKEN=$(infisical login --domain=https://eu.infisical.com/api --method=universal-auth \
  --client-id=$INFISICAL_MACHINE_CLIENT_ID \
  --client-secret=$INFISICAL_MACHINE_CLIENT_SECRET \
  --plain --silent)
exec infisical run --watch --domain=https://eu.infisical.com/api --projectId $PROJECT_ID -- yarn start:prod