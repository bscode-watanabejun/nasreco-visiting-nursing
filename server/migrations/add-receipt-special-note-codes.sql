-- レセプト特記コードマスタの追加
-- 設計書「別表6 レセプト特記コード」に準拠

BEGIN;

-- テーブルが存在しない場合は作成（Drizzleが自動生成するが、念のため）
CREATE TABLE IF NOT EXISTS receipt_special_note_codes (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(2) NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 既存データを削除（再実行時のため）
DELETE FROM receipt_special_note_codes;

-- 別表6のレセプト特記コードを投入（15件）
INSERT INTO receipt_special_note_codes (code, name, description, display_order, is_active) VALUES
('01', '公', '公費', 10, true),
('02', '長', '長', 20, true),
('04', '後 保', '後期高齢者医療制度', 30, true),
('10', '第 三', '第三', 40, true),
('16', '長 ２', '長２', 50, true),
('21', '高 半', '高額療養費半額', 60, true),
('26', '区 ア', '区ア', 70, true),
('27', '区 イ', '区イ', 80, true),
('28', '区 ウ', '区ウ', 90, true),
('29', '区 エ', '区エ', 100, true),
('30', '区 オ', '区オ', 110, true),
('41', '区 カ', '区カ', 120, true),
('42', '区 キ', '区キ', 130, true),
('96', '災 １', '災害１', 140, true),
('97', '災 ２', '災害２', 150, true);

-- 確認：15件のコードが正しく登録されたか
SELECT COUNT(*) as total_codes FROM receipt_special_note_codes;

SELECT code, name FROM receipt_special_note_codes ORDER BY display_order;

COMMIT;

