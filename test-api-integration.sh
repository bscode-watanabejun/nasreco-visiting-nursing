#!/bin/bash

# API Integration Test for Bonus Calculation
# 実際のAPIを経由した加算計算のテスト

echo "🧪 API Integration Test for Bonus Calculation"
echo "============================================================"
echo ""

# 1. Login as nurse_yamada
echo "📝 Step 1: Login as nurse_yamada"
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:5000/api/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "nurse_yamada",
    "password": "password123"
  }' \
  -c cookies.txt)

echo "Login response: $LOGIN_RESPONSE"
echo ""

# 2. Create a nursing record with emergency visit at night
echo "📝 Step 2: Create nursing record (Emergency + Night)"
RECORD_RESPONSE=$(curl -s -X POST http://localhost:5000/api/nursing-records \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "patientId": "5df7433b-a4a7-47f2-9763-1a5cc1e9bfc2",
    "recordType": "general_care",
    "recordDate": "2025-10-15T19:00:00Z",
    "visitDate": "2025-10-15",
    "actualStartTime": "2025-10-15T19:00:00Z",
    "actualEndTime": "2025-10-15T20:00:00Z",
    "title": "夜間緊急訪問",
    "content": "呼吸困難のため緊急訪問を実施",
    "emergencyVisitReason": "呼吸困難のため緊急訪問",
    "status": "completed"
  }')

echo "Record created:"
echo "$RECORD_RESPONSE" | jq -r '.id, .calculatedPoints, .appliedBonuses'
RECORD_ID=$(echo "$RECORD_RESPONSE" | jq -r '.id')
echo ""

# 3. Check bonus_calculation_history
echo "📝 Step 3: Check bonus calculation history"
if [ -n "$DATABASE_URL" ]; then
  psql "$DATABASE_URL" -c "
    SELECT
      bch.id,
      bm.bonus_name,
      bch.calculated_points,
      bch.applied_version,
      bch.is_manually_adjusted
    FROM bonus_calculation_history bch
    JOIN bonus_master bm ON bch.bonus_master_id = bm.id
    WHERE bch.nursing_record_id = '$RECORD_ID'
    ORDER BY bch.created_at;
  "
else
  echo "DATABASE_URL is not set"
fi
echo ""

# 4. Create another record - long visit
echo "📝 Step 4: Create nursing record (Long Visit 95min)"
RECORD_RESPONSE2=$(curl -s -X POST http://localhost:5000/api/nursing-records \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "patientId": "5df7433b-a4a7-47f2-9763-1a5cc1e9bfc2",
    "recordType": "general_care",
    "recordDate": "2025-10-16T10:00:00Z",
    "visitDate": "2025-10-16",
    "actualStartTime": "2025-10-16T10:00:00Z",
    "actualEndTime": "2025-10-16T11:35:00Z",
    "title": "長時間訪問",
    "content": "褥瘡処置のため長時間訪問",
    "longVisitReason": "褥瘡処置のため長時間訪問",
    "status": "completed"
  }')

echo "Record created:"
echo "$RECORD_RESPONSE2" | jq -r '.id, .calculatedPoints, .appliedBonuses'
RECORD_ID2=$(echo "$RECORD_RESPONSE2" | jq -r '.id')
echo ""

# 5. Check bonus_calculation_history for second record
echo "📝 Step 5: Check bonus calculation history for long visit"
if [ -n "$DATABASE_URL" ]; then
  psql "$DATABASE_URL" -c "
    SELECT
      bch.id,
      bm.bonus_name,
      bch.calculated_points,
      bch.applied_version,
      bch.calculation_details->>'matchedCondition' as matched_condition
    FROM bonus_calculation_history bch
    JOIN bonus_master bm ON bch.bonus_master_id = bm.id
    WHERE bch.nursing_record_id = '$RECORD_ID2'
    ORDER BY bch.created_at;
  "
else
  echo "DATABASE_URL is not set"
fi
echo ""

# 6. Summary
echo "============================================================"
echo "✅ API Integration Test Completed!"
echo ""
echo "Total bonus history records:"
if [ -n "$DATABASE_URL" ]; then
  psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM bonus_calculation_history;"
fi

# Cleanup
rm -f cookies.txt
