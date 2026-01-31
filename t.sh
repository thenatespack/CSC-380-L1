#!/usr/bin/env bash

#tests written by Grok 4.1

set -euo pipefail

# ──────────────────────────────────────────────────────────────────────────────
#  Simple API Test Script for your game-trading backend
#  Assumes server is running on http://localhost:7653
# ──────────────────────────────────────────────────────────────────────────────

BASE_URL="http://localhost:8080"
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Starting API tests on ${BASE_URL}${NC}\n"

# ── Helper Functions ─────────────────────────────────────────────────────────

check_status() {
  local expected=$1
  local actual=$2
  local msg=$3

  if [ "$actual" = "$expected" ]; then
    echo -e "${GREEN}✓ $msg (Status $actual)${NC}"
  else
    echo -e "${RED}✗ $msg - Expected $expected but got $actual${NC}"
    exit 1
  fi
}

extract_json_value() {
  local key=$1
  jq -r ".$key" 2>/dev/null || echo ""
}

# ── 1. Register a test user ─────────────────────────────────────────────────

echo "1. Registering test user..."

REGISTER_RESPONSE=$(curl -s -X POST "$BASE_URL/users" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "testuser@example.com",
    "password": "password123",
    "address": "123 Game Street, SLC"
  }')

STATUS=$(echo "$REGISTER_RESPONSE" | jq -r '. | if type=="object" and has("error") then 400 else 201 end' || echo 500)

check_status 201 "$STATUS" "User registration"

USER_ID=$(echo "$REGISTER_RESPONSE" | extract_json_value "links.self" | awk -F'/' '{print $NF}')

echo "→ Created user ID: $USER_ID"

# ── 2. Sign in ───────────────────────────────────────────────────────────────

echo -e "\n2. Signing in..."

LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/signin" \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{
    "email": "testuser@example.com",
    "password": "password123"
  }')

STATUS=$(echo "$LOGIN_RESPONSE" | jq -r '. | if type=="object" and has("error") then 401 else 200 end' || echo 500)

check_status 200 "$STATUS" "Login successful"

echo "→ Session cookie saved to cookies.txt"

# ── 3. Create a game (authenticated) ────────────────────────────────────────

echo -e "\n3. Creating a test game..."

GAME_RESPONSE=$(curl -s -X POST "$BASE_URL/games" \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "name": "Super Mario Odyssey",
    "system": "Nintendo Switch",
    "condition": "Like New",
    "price": 45.00
  }')

STATUS=$(echo "$GAME_RESPONSE" | jq -r '. | if type=="object" and has("error") then 400 else 201 end' || echo 500)

check_status 201 "$STATUS" "Game creation"

GAME_ID=$(echo "$GAME_RESPONSE" | extract_json_value "links.self" | awk -F'/' '{print $NF}')

echo "→ Created game ID: $GAME_ID"

# ── 4. List all games ────────────────────────────────────────────────────────

echo -e "\n4. Getting all games..."

curl -s -X GET "$BASE_URL/games" -b cookies.txt | jq '.'

# ── 5. Get my games ──────────────────────────────────────────────────────────

echo -e "\n5. Getting my games..."

curl -s -X GET "$BASE_URL/my/games" -b cookies.txt | jq '.'

# ── 6. Register second user (for offer testing) ─────────────────────────────

echo -e "\n6. Registering second user (buyer)..."

curl -s -X POST "$BASE_URL/users" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Buyer McBuyface",
    "email": "buyer@example.com",
    "password": "buyer456",
    "address": "456 Offer Ave"
  }' > /dev/null

# ── 7. Sign in as buyer ──────────────────────────────────────────────────────

echo -e "\n7. Signing in as buyer..."

curl -s -X POST "$BASE_URL/signin" \
  -H "Content-Type: application/json" \
  -c buyer-cookies.txt \
  -d '{
    "email": "buyer@example.com",
    "password": "buyer456"
  }' > /dev/null

# ── 8. Make an offer on the game ─────────────────────────────────────────────

echo -e "\n8. Making an offer as buyer..."

OFFER_RESPONSE=$(curl -s -X POST "$BASE_URL/offers" \
  -H "Content-Type: application/json" \
  -b buyer-cookies.txt \
  -d '{
    "gameId": "'"$GAME_ID"'",
    "amount": 38.50
  }')

STATUS=$(echo "$OFFER_RESPONSE" | jq -r '. | if type=="object" and has("error") then 400 else 201 end' || echo 500)

check_status 201 "$STATUS" "Offer creation"

OFFER_ID=$(echo "$OFFER_RESPONSE" | extract_json_value "offer.id")

echo "→ Created offer ID: $OFFER_ID"

# ── 9. Accept offer as original user (seller) ────────────────────────────────

echo -e "\n9. Accepting offer as seller..."

ACCEPT_RESPONSE=$(curl -s -X POST "$BASE_URL/offers/$OFFER_ID/accept" \
  -H "Content-Type: application/json" \
  -b cookies.txt)

STATUS=$(echo "$ACCEPT_RESPONSE" | jq -r '. | if has("message") and .message=="Offer accepted" then 200 else 400 end' || echo 500)

check_status 200 "$STATUS" "Offer accepted"

echo -e "\n${GREEN}All core tests passed!${NC}"
echo "You can now check MongoDB/Redis to verify data."

# Cleanup (optional)
# rm -f cookies.txt buyer-cookies.txt
