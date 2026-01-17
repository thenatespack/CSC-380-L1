#!/bin/bash

#chatgpt cooked up some tests

BASE_URL="http://localhost:7653"
COOKIE_JAR="cookies.txt"

echo "=============================="
echo " Creating User"
echo "=============================="
curl -s -X POST $BASE_URL/users \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "password": "password123",
    "address": "123 Test Street"
  }' | jq .

echo
echo "=============================="
echo " Signing In"
echo "=============================="
curl -s -c $COOKIE_JAR -X POST $BASE_URL/signin \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }' | jq .

echo
echo "=============================="
echo " Creating Game"
echo "=============================="
GAME_RESPONSE=$(curl -s -b $COOKIE_JAR -X POST $BASE_URL/games \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Halo",
    "system": "Xbox",
    "condition": "New",
    "price": 59.99
  }')

echo "$GAME_RESPONSE" | jq .

GAME_ID=$(echo "$GAME_RESPONSE" | jq -r '.links.self' | awk -F/ '{print $NF}')

echo
echo "=============================="
echo " Get Game By ID"
echo "=============================="
curl -s $BASE_URL/games/$GAME_ID | jq .

echo
echo "=============================="
echo " Search Games (Halo)"
echo "=============================="
curl -s "$BASE_URL/games?search=Halo" | jq .

echo
echo "=============================="
echo " My Games"
echo "=============================="
curl -s -b $COOKIE_JAR $BASE_URL/my/games | jq .

echo
echo "=============================="
echo " Update Game"
echo "=============================="
curl -s -b $COOKIE_JAR -X PUT $BASE_URL/games/$GAME_ID \
  -H "Content-Type: application/json" \
  -d '{
    "condition": "Used",
    "price": 39.99
  }' -i

echo
echo "=============================="
echo " Delete Game"
echo "=============================="
curl -s -b $COOKIE_JAR -X DELETE $BASE_URL/games/$GAME_ID -i

echo
echo "=============================="
echo " Logout"
echo "=============================="
curl -s -b $COOKIE_JAR -X POST $BASE_URL/logout | jq .

rm -f $COOKIE_JAR

echo
echo "=============================="
echo " Tests Complete"
echo "=============================="

