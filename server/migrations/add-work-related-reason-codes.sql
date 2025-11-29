-- 職務上の事由コードマスタの追加
-- 設計書「別表8 職務上の事由コード」に準拠

BEGIN;

-- テーブルが存在しない場合は作成（Drizzleが自動生成するが、念のため）
CREATE TABLE IF NOT EXISTS work_related_reason_codes (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(1) NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 既存データを削除（再実行時のため）
DELETE FROM work_related_reason_codes;

-- 別表8の職務上の事由コードを投入（3件）
INSERT INTO work_related_reason_codes (code, name, description, display_order, is_active) VALUES
('1', '職 上', '職務上（職務上の事由）', 10, true),
('2', '下 ３', '下船後３月以内', 20, true),
('3', '通 災', '通勤災害', 30, true);

-- 確認：3件のコードが正しく登録されたか
SELECT COUNT(*) as total_codes FROM work_related_reason_codes;

SELECT code, name FROM work_related_reason_codes ORDER BY display_order;

COMMIT;

