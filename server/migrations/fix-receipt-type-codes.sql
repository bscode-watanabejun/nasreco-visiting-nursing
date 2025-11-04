-- レセプト種別コードマスタの全面刷新
-- 設計書「別表4 レセプト種別コード（訪問看護）」に準拠
-- 3xxx形式 → 6xxx形式に全面変更

BEGIN;

-- 既存データを削除
DELETE FROM receipt_type_codes;

-- 訪問看護・医保単独/国保単独（6種類）
INSERT INTO receipt_type_codes (receipt_type_code, receipt_type_name, insurance_type, description, display_order, is_active) VALUES
('6112', '訪問看護・医保単独/国保単独・本人/世帯主', 'medical', '医療保険単独、本人または世帯主', 10, true),
('6114', '訪問看護・医保単独/国保単独・未就学者', 'medical', '医療保険単独、未就学者', 20, true),
('6116', '訪問看護・医保単独/国保単独・家族/その他', 'medical', '医療保険単独、家族またはその他', 30, true),
('6118', '訪問看護・医保単独/国保単独・高齢受給者一般・低所得者', 'medical', '医療保険単独、高齢受給者一般・低所得者', 40, true),
('6110', '訪問看護・医保単独/国保単独・高齢受給者7割', 'medical', '医療保険単独、高齢受給者7割', 50, true);

-- 訪問看護・医保/国保と1種の公費併用（5種類）
INSERT INTO receipt_type_codes (receipt_type_code, receipt_type_name, insurance_type, description, display_order, is_active) VALUES
('6122', '訪問看護・医保/国保と1種の公費併用・本人/世帯主', 'medical', '医療保険と1種の公費併用、本人または世帯主', 110, true),
('6124', '訪問看護・医保/国保と1種の公費併用・未就学者', 'medical', '医療保険と1種の公費併用、未就学者', 120, true),
('6126', '訪問看護・医保/国保と1種の公費併用・家族/その他', 'medical', '医療保険と1種の公費併用、家族またはその他', 130, true),
('6128', '訪問看護・医保/国保と1種の公費併用・高齢受給者一般・低所得者', 'medical', '医療保険と1種の公費併用、高齢受給者一般・低所得者', 140, true),
('6120', '訪問看護・医保/国保と1種の公費併用・高齢受給者7割', 'medical', '医療保険と1種の公費併用、高齢受給者7割', 150, true);

-- 訪問看護・医保/国保と2種の公費併用（5種類）
INSERT INTO receipt_type_codes (receipt_type_code, receipt_type_name, insurance_type, description, display_order, is_active) VALUES
('6132', '訪問看護・医保/国保と2種の公費併用・本人/世帯主', 'medical', '医療保険と2種の公費併用、本人または世帯主', 210, true),
('6134', '訪問看護・医保/国保と2種の公費併用・未就学者', 'medical', '医療保険と2種の公費併用、未就学者', 220, true),
('6136', '訪問看護・医保/国保と2種の公費併用・家族/その他', 'medical', '医療保険と2種の公費併用、家族またはその他', 230, true),
('6138', '訪問看護・医保/国保と2種の公費併用・高齢受給者一般・低所得者', 'medical', '医療保険と2種の公費併用、高齢受給者一般・低所得者', 240, true),
('6130', '訪問看護・医保/国保と2種の公費併用・高齢受給者7割', 'medical', '医療保険と2種の公費併用、高齢受給者7割', 250, true);

-- 訪問看護・医保/国保と3種の公費併用（5種類）
INSERT INTO receipt_type_codes (receipt_type_code, receipt_type_name, insurance_type, description, display_order, is_active) VALUES
('6142', '訪問看護・医保/国保と3種の公費併用・本人/世帯主', 'medical', '医療保険と3種の公費併用、本人または世帯主', 310, true),
('6144', '訪問看護・医保/国保と3種の公費併用・未就学者', 'medical', '医療保険と3種の公費併用、未就学者', 320, true),
('6146', '訪問看護・医保/国保と3種の公費併用・家族/その他', 'medical', '医療保険と3種の公費併用、家族またはその他', 330, true),
('6148', '訪問看護・医保/国保と3種の公費併用・高齢受給者一般・低所得者', 'medical', '医療保険と3種の公費併用、高齢受給者一般・低所得者', 340, true),
('6140', '訪問看護・医保/国保と3種の公費併用・高齢受給者7割', 'medical', '医療保険と3種の公費併用、高齢受給者7割', 350, true);

-- 訪問看護・医保/国保と4種の公費併用（5種類）
INSERT INTO receipt_type_codes (receipt_type_code, receipt_type_name, insurance_type, description, display_order, is_active) VALUES
('6152', '訪問看護・医保/国保と4種の公費併用・本人/世帯主', 'medical', '医療保険と4種の公費併用、本人または世帯主', 410, true),
('6154', '訪問看護・医保/国保と4種の公費併用・未就学者', 'medical', '医療保険と4種の公費併用、未就学者', 420, true),
('6156', '訪問看護・医保/国保と4種の公費併用・家族/その他', 'medical', '医療保険と4種の公費併用、家族またはその他', 430, true),
('6158', '訪問看護・医保/国保と4種の公費併用・高齢受給者一般・低所得者', 'medical', '医療保険と4種の公費併用、高齢受給者一般・低所得者', 440, true),
('6150', '訪問看護・医保/国保と4種の公費併用・高齢受給者7割', 'medical', '医療保険と4種の公費併用、高齢受給者7割', 450, true);

-- 訪問看護・公費単独（4種類）
INSERT INTO receipt_type_codes (receipt_type_code, receipt_type_name, insurance_type, description, display_order, is_active) VALUES
('6212', '訪問看護・公費単独', 'medical', '公費負担医療単独', 510, true),
('6222', '訪問看護・2種の公費併用', 'medical', '2種の公費負担医療併用', 520, true),
('6232', '訪問看護・3種の公費併用', 'medical', '3種の公費負担医療併用', 530, true),
('6242', '訪問看護・4種の公費併用', 'medical', '4種の公費負担医療併用', 540, true);

-- 訪問看護・後期高齢者単独（2種類）
INSERT INTO receipt_type_codes (receipt_type_code, receipt_type_name, insurance_type, description, display_order, is_active) VALUES
('6318', '訪問看護・後期高齢者単独・一般・低所得者', 'medical', '後期高齢者医療単独、一般・低所得者', 610, true),
('6310', '訪問看護・後期高齢者単独・7割', 'medical', '後期高齢者医療単独、7割', 620, true);

-- 訪問看護・後期高齢者と1種の公費併用（2種類）
INSERT INTO receipt_type_codes (receipt_type_code, receipt_type_name, insurance_type, description, display_order, is_active) VALUES
('6328', '訪問看護・後期高齢者と1種の公費併用・一般・低所得者', 'medical', '後期高齢者医療と1種の公費併用、一般・低所得者', 710, true),
('6320', '訪問看護・後期高齢者と1種の公費併用・7割', 'medical', '後期高齢者医療と1種の公費併用、7割', 720, true);

-- 訪問看護・後期高齢者と2種の公費併用（2種類）
INSERT INTO receipt_type_codes (receipt_type_code, receipt_type_name, insurance_type, description, display_order, is_active) VALUES
('6338', '訪問看護・後期高齢者と2種の公費併用・一般・低所得者', 'medical', '後期高齢者医療と2種の公費併用、一般・低所得者', 810, true),
('6330', '訪問看護・後期高齢者と2種の公費併用・7割', 'medical', '後期高齢者医療と2種の公費併用、7割', 820, true);

-- 訪問看護・後期高齢者と3種の公費併用（2種類）
INSERT INTO receipt_type_codes (receipt_type_code, receipt_type_name, insurance_type, description, display_order, is_active) VALUES
('6348', '訪問看護・後期高齢者と3種の公費併用・一般・低所得者', 'medical', '後期高齢者医療と3種の公費併用、一般・低所得者', 910, true),
('6340', '訪問看護・後期高齢者と3種の公費併用・7割', 'medical', '後期高齢者医療と3種の公費併用、7割', 920, true);

-- 訪問看護・後期高齢者と4種の公費併用（2種類）
INSERT INTO receipt_type_codes (receipt_type_code, receipt_type_name, insurance_type, description, display_order, is_active) VALUES
('6358', '訪問看護・後期高齢者と4種の公費併用・一般・低所得者', 'medical', '後期高齢者医療と4種の公費併用、一般・低所得者', 1010, true),
('6350', '訪問看護・後期高齢者と4種の公費併用・7割', 'medical', '後期高齢者医療と4種の公費併用、7割', 1020, true);

-- 確認：43件のコードが正しく登録されたか
SELECT COUNT(*) as total_codes FROM receipt_type_codes;

COMMIT;
