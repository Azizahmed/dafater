#!/usr/bin/env bash
# Dafater: end-to-end check of the administrator's OpenAI-compatible AI
# configuration against the dev server on :3010, with no real API key.
# It starts tools/dafater/mock-openai.mjs on :18080, creates two @dafater.test
# users (first = admin via /api/setup/create-admin-user, second via
# /api/auth/sign-up), exercises /api/admin/ai (GET/PUT/POST /test, 401/403),
# streams a chat reply, a translation and a mind-map action, then deletes the
# workspace and users and clears the copilot config back to the defaults.
# Requires an EMPTY users table (the first user becomes the admin).
#
# Run (serialised with other agents' user tests):
#   flock /tmp/dafater-users.lock bash tools/dafater/e2e-admin-ai.sh
set -u
cd "$(dirname "$0")/../.."
B=http://localhost:3010
T=$(mktemp -d)
A=$T/admin.jar
U=$T/user.jar
PW='Dafater-Test-1234'
log() { echo; echo "=== $*"; }
gql() { # jar query [variables-json]
  local vars=${3:-'{}'}
  curl -s -b "$1" -c "$1" "$B/graphql" -H 'content-type: application/json' \
    -d "$(node -e 'console.log(JSON.stringify({query: process.argv[1], variables: JSON.parse(process.argv[2])}))' "$2" "$vars")"
  echo
}
json() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const v=JSON.parse(s);console.log(eval("v"+process.argv[1]))})' "$1"; }

node tools/dafater/mock-openai.mjs > /tmp/w5-mock.log 2>&1 &
MOCK=$!
trap 'kill $MOCK 2>/dev/null' EXIT
sleep 1
log "mock GET /v1/models"
curl -s localhost:18080/v1/models; echo

log "users before"
USERS=$(docker exec dafater-postgres psql -U dafater -d dafater -tAc "select count(*) from users" | tr -d '[:space:]')
if [ "$USERS" != "0" ]; then
  echo "refusing to run: the server already has $USERS user(s); this check needs an empty server" >&2
  exit 1
fi

log "create admin (first user) via /api/setup/create-admin-user"
curl -s -c "$A" -b "$A" -X POST "$B/api/setup/create-admin-user" -H 'content-type: application/json' \
  -d "{\"email\":\"w5-admin@dafater.test\",\"password\":\"$PW\",\"name\":\"W5 Admin\"}"; echo
log "sign up second (non-admin) user via /api/auth/sign-up"
curl -s -c "$U" -b "$U" -X POST "$B/api/auth/sign-up" -H 'content-type: application/json' \
  -d "{\"email\":\"w5-user@dafater.test\",\"password\":\"$PW\",\"name\":\"W5 User\"}"; echo

log "anonymous GET /api/admin/ai (expect 401)"
curl -s -w '\nHTTP %{http_code}\n' "$B/api/admin/ai"
log "non-admin GET /api/admin/ai (expect 403)"
curl -s -w '\nHTTP %{http_code}\n' -b "$U" "$B/api/admin/ai"
log "non-admin PUT /api/admin/ai (expect 403)"
curl -s -w '\nHTTP %{http_code}\n' -b "$U" -X PUT "$B/api/admin/ai" -H 'content-type: application/json' \
  -d '{"enabled":true,"baseURL":"http://localhost:18080/v1","model":"mock-model"}'
log "admin GET /api/admin/ai (initial)"
curl -s -w '\nHTTP %{http_code}\n' -b "$A" "$B/api/admin/ai"
log "serverConfig.features before"
gql "$U" '{ serverConfig { features } }'

log "admin PUT invalid (enabled without model, expect 400)"
curl -s -w '\nHTTP %{http_code}\n' -b "$A" -X PUT "$B/api/admin/ai" -H 'content-type: application/json' \
  -d '{"enabled":true,"baseURL":"http://localhost:18080/v1","model":""}'
log "admin PUT invalid dialect (expect 400)"
curl -s -w '\nHTTP %{http_code}\n' -b "$A" -X PUT "$B/api/admin/ai" -H 'content-type: application/json' \
  -d '{"enabled":true,"baseURL":"http://localhost:18080/v1","model":"mock-model","dialect":"completions"}'

log "admin POST /api/admin/ai/test with key, allowPrivateNetwork=false (expect private_network)"
curl -s -w '\nHTTP %{http_code}\n' -b "$A" -X POST "$B/api/admin/ai/test" -H 'content-type: application/json' \
  -d '{"baseURL":"http://localhost:18080/v1","apiKey":"sk-mock-123","model":"mock-model"}'
log "admin POST /api/admin/ai/test, allowPrivateNetwork=true"
curl -s -w '\nHTTP %{http_code}\n' -b "$A" -X POST "$B/api/admin/ai/test" -H 'content-type: application/json' \
  -d '{"baseURL":"http://localhost:18080/v1","apiKey":"sk-mock-123","model":"mock-model","allowPrivateNetwork":true}'
log "admin POST /api/admin/ai/test, responses dialect"
curl -s -w '\nHTTP %{http_code}\n' -b "$A" -X POST "$B/api/admin/ai/test" -H 'content-type: application/json' \
  -d '{"baseURL":"http://localhost:18080/v1","model":"mock-model","dialect":"responses","allowPrivateNetwork":true}'
log "admin POST /api/admin/ai/test, wrong path (expect not_found)"
curl -s -w '\nHTTP %{http_code}\n' -b "$A" -X POST "$B/api/admin/ai/test" -H 'content-type: application/json' \
  -d '{"baseURL":"http://localhost:18080/nope","model":"mock-model","allowPrivateNetwork":true}'

log "admin PUT config -> mock"
curl -s -w '\nHTTP %{http_code}\n' -b "$A" -X PUT "$B/api/admin/ai" -H 'content-type: application/json' \
  -d '{"enabled":true,"baseURL":"http://localhost:18080/v1/","apiKey":"sk-mock-123","model":"mock-model","dialect":"chat_completions","allowPrivateNetwork":true,"vision":false}'
log "admin PUT again WITHOUT apiKey (key must be kept)"
curl -s -w '\nHTTP %{http_code}\n' -b "$A" -X PUT "$B/api/admin/ai" -H 'content-type: application/json' \
  -d '{"enabled":true,"baseURL":"http://localhost:18080/v1","model":"mock-model","allowPrivateNetwork":true}'
log "stored profile in app_configs (apiKey masked here)"
docker exec dafater-postgres psql -U dafater -d dafater -tAc \
  "select id, regexp_replace(value::text, '\"apiKey\": \"[^\"]*\"', '\"apiKey\": \"***\"') from app_configs where id like 'copilot%'"
log "admin POST /test using the stored key (no apiKey in body)"
curl -s -w '\nHTTP %{http_code}\n' -b "$A" -X POST "$B/api/admin/ai/test" -H 'content-type: application/json' \
  -d '{"baseURL":"http://localhost:18080/v1","model":"mock-model","allowPrivateNetwork":true}'
log "public admin appConfig does not leak the key"
gql "$A" '{ appConfig }' | grep -o 'sk-mock-123' || echo "no key in appConfig: OK"
log "serverConfig.features after (expect copilot)"
gql "$U" '{ serverConfig { features } }'

log "non-admin: create workspace"
WS=$(gql "$U" 'mutation { createWorkspace { id } }' | json '.data.createWorkspace.id')
echo "workspace=$WS"
log "non-admin: copilot quota (expect limit null)"
gql "$U" '{ currentUser { copilot { quota { limit used } } } }'

log "non-admin: chat session + message + SSE stream"
SID=$(gql "$U" 'mutation($o: CreateChatSessionInput!) { createCopilotSession(options: $o) }' \
  "{\"o\":{\"workspaceId\":\"$WS\",\"promptName\":\"Chat With AFFiNE AI\",\"pinned\":false}}" | tee -a /dev/stderr | json '.data.createCopilotSession')
echo "session=$SID"
MID=$(gql "$U" 'mutation($o: CreateChatMessageInput!) { createCopilotMessage(options: $o) }' \
  "{\"o\":{\"sessionId\":\"$SID\",\"content\":\"ما هي عاصمة مصر؟\"}}" | tee -a /dev/stderr | json '.data.createCopilotMessage')
echo "message=$MID"
curl -s -N -b "$U" --max-time 90 "$B/api/copilot/chat/$SID/stream?messageId=$MID" | grep -v '^$' | head -40

log "non-admin: translate (chat stream with the Translate to prompt)"
SID2=$(gql "$U" 'mutation($o: CreateChatSessionInput!) { createCopilotSession(options: $o) }' \
  "{\"o\":{\"workspaceId\":\"$WS\",\"docId\":\"w5-test-doc\",\"promptName\":\"Translate to\"}}" | tee -a /dev/stderr | json '.data.createCopilotSession')
MID2=$(gql "$U" 'mutation($o: CreateChatMessageInput!) { createCopilotMessage(options: $o) }' \
  "{\"o\":{\"sessionId\":\"$SID2\",\"content\":\"Good morning\",\"params\":{\"language\":\"Arabic\"}}}" | tee -a /dev/stderr | json '.data.createCopilotMessage')
curl -s -N -b "$U" --max-time 90 "$B/api/copilot/chat/$SID2/stream?messageId=$MID2" | grep -v '^$' | grep -v '^id:' | head -30

log "non-admin: mindmap.generate structured action stream"
SID3=$(gql "$U" 'mutation($o: CreateChatSessionInput!) { createCopilotSession(options: $o) }' \
  "{\"o\":{\"workspaceId\":\"$WS\",\"docId\":\"w5-test-doc\",\"promptName\":\"mindmap.generate\"}}" | tee -a /dev/stderr | json '.data.createCopilotSession')
MID3=$(gql "$U" 'mutation($o: CreateChatMessageInput!) { createCopilotMessage(options: $o) }' \
  "{\"o\":{\"sessionId\":\"$SID3\",\"content\":\"خطة مشروع\"}}" | tee -a /dev/stderr | json '.data.createCopilotMessage')
curl -s -N -b "$U" --max-time 90 "$B/api/copilot/actions/$SID3/stream?messageId=$MID3&actionId=mindmap.generate&actionVersion=v1" | grep -v '^$' | grep -v '^id:' | head -30

log "mock server log"
cat /tmp/w5-mock.log

log "cleanup: delete workspace"
gql "$U" "mutation { deleteWorkspace(id: \"$WS\") }"
log "cleanup: reset AI config via PUT (enabled=false, profiles=[])"
curl -s -w '\nHTTP %{http_code}\n' -b "$A" -X PUT "$B/api/admin/ai" -H 'content-type: application/json' \
  -d '{"enabled":false,"baseURL":"","model":""}'
docker exec dafater-postgres psql -U dafater -d dafater -tAc "select id, value from app_configs where id like 'copilot%'"
log "cleanup: clear the copilot overrides back to defaults (admin updateAppConfig clear)"
gql "$A" 'mutation($u: [UpdateAppConfigInput!]!) { updateAppConfig(updates: $u) }' \
  '{"u":[{"module":"copilot","key":"enabled","clear":true},{"module":"copilot","key":"providers.profiles","clear":true},{"module":"copilot","key":"byok.enabled","clear":true}]}' | cut -c1-300
docker exec dafater-postgres psql -U dafater -d dafater -tAc "select count(*) as copilot_rows from app_configs where id like 'copilot%'"
log "serverConfig.features after reset"
gql "$U" '{ serverConfig { features } }'
log "cleanup: delete test users"
docker exec dafater-postgres psql -U dafater -d dafater -tAc "delete from users where email like '%@dafater.test'"
docker exec dafater-postgres psql -U dafater -d dafater -tAc "select count(*) from users"
rm -rf "$T"
