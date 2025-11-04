-- 場所コードマスタの修正
-- 設計書「別表16 場所コード」に準拠
-- 01-09連番 → 01, 11-16, 31, 32, 99 に変更

BEGIN;

-- 既存データを削除
DELETE FROM visit_location_codes;

-- 正しい場所コードを投入
INSERT INTO visit_location_codes (location_code, location_name, description, display_order, is_active) VALUES
('01', '自宅', '利用者の自宅', 10, true),
('11', '施設（社会福祉施設及び身体障害者施設）', '社会福祉施設及び身体障害者施設', 20, true),
('12', '施設（小規模多機能型居宅介護）', '小規模多機能型居宅介護', 30, true),
('13', '施設（複合型サービス）', '複合型サービス', 40, true),
('14', '施設（認知症対応型グループホーム）', '認知症対応型グループホーム', 50, true),
('15', '施設（特定施設）', '特定施設', 60, true),
('16', '施設（地域密着型介護老人福祉施設及び介護老人福祉施設）', '地域密着型介護老人福祉施設及び介護老人福祉施設', 70, true),
('31', '病院', '医療機関（病院）', 80, true),
('32', '診療所', '医療機関（診療所）', 90, true),
('99', 'その他', 'その他の場所', 100, true);

-- 確認：10件のコードが正しく登録されたか
SELECT COUNT(*) as total_codes FROM visit_location_codes;

SELECT location_code, location_name FROM visit_location_codes ORDER BY display_order;

COMMIT;
