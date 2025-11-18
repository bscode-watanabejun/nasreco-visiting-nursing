-- deathLocationからdeathPlaceCodeへの移行とdeathLocationフィールドの削除
-- 既存のdeathLocationデータを別表16の場所コードに移行

BEGIN;

-- Step 1: 新しいフィールドを追加
ALTER TABLE patients 
  ADD COLUMN IF NOT EXISTS death_time VARCHAR(4),
  ADD COLUMN IF NOT EXISTS death_place_code VARCHAR(2),
  ADD COLUMN IF NOT EXISTS death_place_text TEXT;

-- Step 2: 既存のdeathLocationデータをdeathPlaceCodeに移行
-- 'home' → '01' (自宅)
-- 'facility' → '16' (施設: 地域密着型介護老人福祉施設及び介護老人福祉施設)
UPDATE patients
SET death_place_code = CASE
  WHEN death_location = 'home' THEN '01'
  WHEN death_location = 'facility' THEN '16'
  ELSE NULL
END
WHERE death_location IS NOT NULL;

-- Step 3: deathLocationカラムを削除
ALTER TABLE patients DROP COLUMN IF EXISTS death_location;

COMMIT;

-- 確認クエリ
SELECT 
  id,
  death_date,
  death_time,
  death_place_code,
  death_place_text
FROM patients
WHERE death_date IS NOT NULL
LIMIT 10;

