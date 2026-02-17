#!/usr/bin/env bash
set -euo pipefail

# Fixed for port 8080
BASE_URL="${BASE_URL:-http://localhost:8080}"
EMAIL="${EMAIL:-test@example.com}"
PASSWORD="${PASSWORD:-Password123!}"
NEW_PASSWORD="${NEW_PASSWORD:-Password456!}"

COOKIE_JAR="$(mktemp)"
OTHER_COOKIE_JAR=""
trap 'rm -f "$COOKIE_JAR" "$OTHER_COOKIE_JAR" 2>/dev/null || true' EXIT

echo "Using API: $BASE_URL"
echo "Testing notifications for email: $EMAIL"
echo

# Helper to pretty print responses
pp() {
  echo
  echo "---- $1 ----"
  cat
  echo
}

# 1) Create / ensure user and resolve USER_ID
echo "Creating / ensuring user..."
CREATE_RES="$(curl -s -X POST "$BASE_URL/users" \
  -H "Content-Type: application/json" \
  -d @- <<EOF
{
  "name": "Test User",
  "email": "$EMAIL",
  "password": "$PASSWORD",
  "address": "123 Test St"
}
EOF
)"
echo "$CREATE_RES" | pp "Create user (may be 201 or 409)"

# Extract id from self link
USER_ID="$(echo "$CREATE_RES" | sed -n 's/.*"self":"[^"]*\/users\/\([^"]*\)".*/\1/p')"

# 2) Sign in to establish session (captures session cookie)
echo "Signing in..."
SIGNIN_RES="$(curl -s -c "$COOKIE_JAR" -X POST "$BASE_URL/signin" \
  -H "Content-Type: application/json" \
  -d @- <<EOF
{
  "email": "$EMAIL",
  "password": "$PASSWORD"
}
EOF
)"
echo "$SIGNIN_RES" | pp "Signin"

# If USER_ID was not set from create (e.g. 409), get it from signin links
if [ -z "$USER_ID" ]; then
  USER_ID="$(echo "$SIGNIN_RES" | sed -n 's/.*"self":"[^"]*\/users\/\([^"]*\)".*/\1/p')"
fi

if [ -z "$USER_ID" ]; then
  echo "ERROR: Could not resolve USER_ID from API responses."
  exit 1
fi

echo "Resolved USER_ID: $USER_ID"
echo "Cookie jar contents:"
cat "$COOKIE_JAR"
echo

# 3) Trigger password change (should hit Kafka PASSWORD_CHANGED notification)
echo "Triggering password change..."
curl -s -b "$COOKIE_JAR" -X PUT "$BASE_URL/users/$USER_ID" \
  -H "Content-Type: application/json" \
  -d @- <<EOF | pp "Password change (204 expected)"
{
  "password": "$NEW_PASSWORD"
}
EOF

# 4) Sign out first (clear old session), then sign in with new password
echo "Signing out and re-signing in with new password..."
curl -s -b "$COOKIE_JAR" -X POST "$BASE_URL/logout" | pp "Logout"

SIGNIN_NEW_RES="$(curl -s -c "$COOKIE_JAR" -X POST "$BASE_URL/signin" \
  -H "Content-Type: application/json" \
  -d @- <<EOF
{
  "email": "$EMAIL",
  "password": "$NEW_PASSWORD"
}
EOF
)"
echo "$SIGNIN_NEW_RES" | pp "Signin with new password"

# 5) Create a game (owner = current user) - with cookie debug
echo "Creating game..."
GAME_RESPONSE="$(curl -s -v -b "$COOKIE_JAR" -X POST "$BASE_URL/games" \
  -H "Content-Type: application/json" \
  -d @- <<EOF
{
  "name": "Test Game",
  "system": "NES",
  "condition": "Good",
  "price": 25
}
EOF
)"
echo "$GAME_RESPONSE" | pp "Create game"
GAME_ID="$(echo "$GAME_RESPONSE" | sed -n 's/.*"self":"[^"]*\/games\/\([^"]*\)".*/\1/p' || true)"

if [ -z "$GAME_ID" ]; then
  echo "Could not parse GAME_ID from response; offers tests may not run."
else
  echo "Created game with id: $GAME_ID"
fi

# 6) Test /my/games (session-based listing)
echo "Listing my games..."
curl -s -b "$COOKIE_JAR" "$BASE_URL/my/games" | pp "My games"

# 7) Create second user for offer tests
echo "Creating second user for offer tests..."
OTHER_EMAIL="${OTHER_EMAIL:-other@example.com}"
OTHER_PASSWORD="${OTHER_PASSWORD:-Password789!}"

OTHER_CREATE_RES="$(curl -s -X POST "$BASE_URL/users" \
  -H "Content-Type: application/json" \
  -d @- <<EOF
{
  "name": "Buyer User",
  "email": "$OTHER_EMAIL",
  "password": "$OTHER_PASSWORD",
  "address": "456 Buyer Rd"
}
EOF
)"
echo "$OTHER_CREATE_RES" | pp "Create second user"

OTHER_COOKIE_JAR="$(mktemp)"

echo "Signing in as buyer..."
curl -s -c "$OTHER_COOKIE_JAR" -X POST "$BASE_URL/signin" \
  -H "Content-Type: application/json" \
  -d @- <<EOF | pp "Buyer signin"
{
  "email": "$OTHER_EMAIL",
  "password": "$OTHER_PASSWORD"
}
EOF

if [ -n "${GAME_ID:-}" ]; then
  echo "Creating offer on test game..."
  OFFER_RESPONSE="$(curl -s -b "$OTHER_COOKIE_JAR" -X POST "$BASE_URL/offers" \
    -H "Content-Type: application/json" \
    -d @- <<EOF
{
  "gameId": "$GAME_ID",
  "amount": 50
}
EOF
)"
  echo "$OFFER_RESPONSE" | pp "Create offer"
  OFFER_ID="$(echo "$OFFER_RESPONSE" | sed -n 's/.*"self":"[^"]*\/offers\/\([^"]*\)".*/\1/p' || true)"

  if [ -n "$OFFER_ID" ]; then
    echo "Accepting offer (as seller)..."
    curl -s -b "$COOKIE_JAR" -X POST "$BASE_URL/offers/$OFFER_ID/accept" \
      | pp "Accept offer"

    echo "Done hitting API endpoints for Kafka notification testing."
  else
    echo "Could not parse OFFER_ID; skipping accept/reject."
    echo "Done hitting API endpoints for Kafka notification testing."
  fi
else
  echo "No GAME_ID; skipping offer tests."
  echo "Done hitting API endpoints for Kafka notification testing."
fi
