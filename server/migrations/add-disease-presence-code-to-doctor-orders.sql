-- 訪問看護指示書テーブルに「基準告示第2の1に規定する疾病等の有無コード」カラムを追加
-- 別表13: '01'=別表7, '02'=別表8, '03'=無

BEGIN;

-- カラムを追加（デフォルト値'03'、NULL許可は後方互換性のため）
ALTER TABLE doctor_orders
ADD COLUMN IF NOT EXISTS disease_presence_code VARCHAR(2) DEFAULT '03';

-- 既存レコードにデフォルト値'03'を設定（NULLの場合のみ）
UPDATE doctor_orders
SET disease_presence_code = '03'
WHERE disease_presence_code IS NULL;

-- 確認：カラムが正しく追加されたか
SELECT 
  column_name, 
  data_type, 
  character_maximum_length,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'doctor_orders' 
  AND column_name = 'disease_presence_code';

COMMIT;

