-- Phase 4 Test Data: Bonus Master Samples
-- 加算マスタのテストデータ投入

-- 1. 緊急訪問看護加算（医療保険）- 月14日目までと以降で変動パターン
INSERT INTO bonus_master (
  id,
  facility_id,
  bonus_code,
  bonus_name,
  bonus_category,
  insurance_type,
  points_type,
  conditional_pattern,
  points_config,
  predefined_conditions,
  version,
  valid_from,
  valid_to,
  requirements_description,
  display_order,
  is_active
) VALUES (
  gen_random_uuid(),
  NULL, -- グローバル（全施設共通）
  'emergency_visit',
  '緊急訪問看護加算',
  'visit_care',
  'medical',
  'conditional',
  'monthly_14day_threshold',
  '{"up_to_14": 2650, "after_14": 2000}'::json,
  '[{"type": "field_not_empty", "field": "emergencyVisitReason"}]'::json,
  '2024',
  '2024-04-01',
  '2026-03-31',
  '利用者又はその家族等の求めに応じて、計画外の訪問看護を緊急に行った場合に算定',
  10,
  true
);

-- 2. 長時間訪問看護加算（医療保険）- 訪問時間長パターン
INSERT INTO bonus_master (
  id,
  facility_id,
  bonus_code,
  bonus_name,
  bonus_category,
  insurance_type,
  points_type,
  conditional_pattern,
  points_config,
  predefined_conditions,
  version,
  valid_from,
  valid_to,
  requirements_description,
  display_order,
  is_active
) VALUES (
  gen_random_uuid(),
  NULL,
  'long_visit',
  '長時間訪問看護加算',
  'visit_care',
  'medical',
  'conditional',
  'duration_based',
  '{"duration_90": 5200}'::json,
  '[]'::json,
  '2024',
  '2024-04-01',
  '2026-03-31',
  '90分以上の訪問看護を行った場合に算定',
  20,
  true
);

-- 3. 夜間・深夜加算（医療保険）- 時間帯別パターン
INSERT INTO bonus_master (
  id,
  facility_id,
  bonus_code,
  bonus_name,
  bonus_category,
  insurance_type,
  points_type,
  conditional_pattern,
  points_config,
  predefined_conditions,
  version,
  valid_from,
  valid_to,
  requirements_description,
  display_order,
  is_active
) VALUES (
  gen_random_uuid(),
  NULL,
  'night_visit',
  '夜間・深夜訪問看護加算',
  'visit_care',
  'medical',
  'conditional',
  'time_based',
  '{"late_night": 4200, "night": 2100, "early_morning": 2100, "daytime": 0}'::json,
  '[]'::json,
  '2024',
  '2024-04-01',
  '2026-03-31',
  '深夜(22:00-6:00)は420点、夜間(18:00-22:00)・早朝(6:00-8:00)は210点',
  30,
  true
);

-- 4. 乳幼児加算（医療保険）- 年齢区分パターン
INSERT INTO bonus_master (
  id,
  facility_id,
  bonus_code,
  bonus_name,
  bonus_category,
  insurance_type,
  points_type,
  conditional_pattern,
  points_config,
  predefined_conditions,
  version,
  valid_from,
  valid_to,
  requirements_description,
  display_order,
  is_active
) VALUES (
  gen_random_uuid(),
  NULL,
  'infant_bonus',
  '乳幼児加算',
  'patient_attribute',
  'medical',
  'conditional',
  'age_based',
  '{"age_0_6": 1500}'::json,
  '[]'::json,
  '2024',
  '2024-04-01',
  '2026-03-31',
  '6歳未満の乳幼児に対して訪問看護を行った場合に算定',
  40,
  true
);

-- 5. 複数名訪問看護加算（医療保険）- 固定点数
INSERT INTO bonus_master (
  id,
  facility_id,
  bonus_code,
  bonus_name,
  bonus_category,
  insurance_type,
  points_type,
  fixed_points,
  predefined_conditions,
  version,
  valid_from,
  valid_to,
  requirements_description,
  display_order,
  is_active
) VALUES (
  gen_random_uuid(),
  NULL,
  'multiple_staff_visit',
  '複数名訪問看護加算',
  'visit_care',
  'medical',
  'fixed',
  4500,
  '[{"type": "field_not_empty", "field": "multipleVisitReason"}]'::json,
  '2024',
  '2024-04-01',
  '2026-03-31',
  '看護師等が2名以上で訪問看護を行った場合に算定',
  50,
  true
);

-- 6. 介護保険：緊急時訪問看護加算
INSERT INTO bonus_master (
  id,
  facility_id,
  bonus_code,
  bonus_name,
  bonus_category,
  insurance_type,
  points_type,
  fixed_points,
  predefined_conditions,
  version,
  valid_from,
  valid_to,
  requirements_description,
  display_order,
  is_active
) VALUES (
  gen_random_uuid(),
  NULL,
  'care_emergency_system',
  '緊急時訪問看護加算',
  'system',
  'care',
  'fixed',
  574,
  '[]'::json,
  '2024',
  '2024-04-01',
  '2027-03-31',
  '24時間連絡体制を確保し、緊急時訪問看護を実施できる体制を整えている場合（月額）',
  100,
  true
);
