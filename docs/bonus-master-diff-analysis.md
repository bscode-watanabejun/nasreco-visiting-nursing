# 加算マスタ管理の差分分析レポート

## 📊 概要

開発環境と本番環境の加算マスタを比較した結果、以下の差分が確認されました。

## 🔍 差分の詳細

### 1. 件数の比較

| 環境 | 有効な加算マスタ数 | 医療保険（有効） | 介護保険（有効） |
|------|-------------------|-----------------|-----------------|
| **開発環境** | **31件** | 19件 | 12件 |
| **本番環境** | **55件** | 29件 | 26件 |
| **差分** | **+24件** | +10件 | +14件 |

### 2. 本番環境にのみ存在する加算マスタ（23件）

開発環境では無効（`is_active = false`）だが、本番環境では有効（`is_active = true`）になっている加算マスタが23件存在します。

#### 医療保険（9件）
1. `base_up_evaluation_1` - 訪問看護ベースアップ評価料（I）
2. `base_up_evaluation_2` - 訪問看護ベースアップ評価料（II）
3. `discharge_joint_guidance` - 退院時共同指導加算
4. `home_coordination_guidance` - 在宅連携指導加算
5. `home_patient_emergency_conference` - 在宅患者緊急時等カンファレンス
6. `medical_dx_information_utilization` - 訪問看護医療DX情報活用加算
7. `nursing_care_staff_collaboration` - 看護・介護職員連携強化加算
8. `psychiatric_severe_patient_support_5800` - 精神科重症患者支援管理連携加算（月2回以上）
9. `psychiatric_severe_patient_support_8400` - 精神科重症患者支援管理連携加算（週2回以上）
10. `special_area_visit` - 特別地域訪問看護加算

#### 介護保険（13件）
1. `care_intermediate_area_5` - 中間地域等に居住する者へのサービス提供加算（介護保険）
2. `care_mountain_area_10` - 中山間地域等における小規模事業所加算（介護保険）
3. `care_multiple_staff_1` - 複数名訪問加算（I）（介護保険）
4. `care_multiple_staff_2` - 複数名訪問加算（II）（介護保険）
5. `care_nursing_care_staff_collaboration` - 看護・介護職員連携強化加算（介護保険）
6. `care_nursing_system_1` - 看護体制強化加算（I）（介護保険）
7. `care_nursing_system_2` - 看護体制強化加算（II）（介護保険）
8. `care_oral_coordination` - 口腔連携加算（介護保険）
9. `care_prevention_nursing_system` - 看護体制強化加算（介護予防訪問看護）
10. `care_remote_death_diagnosis` - 遠隔死亡診断補助加算（介護保険）
11. `care_service_system_1` - サービス提供体制強化加算（I）（介護保険）
12. `care_service_system_2` - サービス提供体制強化加算（II）（介護保険）
13. `care_special_area_15` - 特別地域訪問看護加算（介護保険）

### 3. 共通の加算マスタで内容が異なる（15件）

同じ`bonus_code`を持つ加算マスタで、内容が異なるものが15件あります。

#### 主な差分パターン

##### パターン1: 点数が10倍違う（10件）
開発環境の点数が本番環境の1/10になっているケースが複数あります。

| 加算コード | フィールド | 開発環境 | 本番環境 |
|-----------|-----------|---------|---------|
| `24h_response_system_basic` | fixedPoints | 652点 | 6520点 |
| `24h_response_system_enhanced` | fixedPoints | 680点 | 6800点 |
| `care_terminal_care` | fixedPoints | 250点 | 2500点 |
| `discharge_special_management_guidance` | fixedPoints | 200点 | 2000点 |
| `discharge_support_guidance_basic` | fixedPoints | 600点 | 6000点 |
| `medical_discharge_joint_guidance` | fixedPoints | 800点 | 8000点 |

##### パターン2: 点数タイプが異なる（1件）
- `discharge_support_guidance_long`
  - 開発環境: `conditional`（条件分岐、90分超で8400点）
  - 本番環境: `fixed`（固定8400点）

##### その他の差分（4件）
その他のフィールド（`pointsConfig`、`conditionalPattern`など）が異なるケースが4件あります。

## ⚠️ 影響範囲の確認が必要

本番環境でこれらの加算マスタが実際に使用されているか確認する必要があります。

### 確認すべきポイント

1. **`bonus_calculation_history`テーブル**
   - 本番環境にのみ存在する加算マスタが実際に使用されているか
   - 内容が異なる加算マスタで計算済みの履歴があるか

2. **`nursing_records`テーブル**
   - 訪問記録でこれらの加算マスタが選択されているか

3. **`monthly_receipts`テーブル**
   - 月次レセプトでこれらの加算マスタが使用されているか

## 🔄 推奨される対応

開発環境が正しいという前提で、以下の対応が必要です：

### フェーズ1: 影響範囲の確認
1. 本番環境で使用されている加算マスタの確認
2. 計算済みの履歴があるか確認
3. 月次レセプトへの影響確認

### フェーズ2: 本番環境の無効化
1. 開発環境で無効な加算マスタを本番環境でも無効化（`is_active = false`）
2. ただし、既に使用されている場合は慎重に判断

### フェーズ3: 内容の更新
1. 共通の加算マスタの内容を開発環境の値に更新
2. 点数が10倍違うケースは、開発環境の値が正しいと仮定

### フェーズ4: 検証
1. 更新後の加算マスタが正しく表示されるか確認
2. 既存の計算履歴に影響がないか確認

## 📝 注意事項

- 本番環境は実際に利用されているため、変更前に必ず影響範囲を確認すること
- 既に使用されている加算マスタを無効化する場合は、代替手段を検討すること
- 点数が10倍違うケースは、どちらが正しいか法令を確認すること

