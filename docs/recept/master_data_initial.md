# マスターデータ初期値

CSV出力機能に必要なマスターデータの初期値一覧。

## 投入方法

### 方法1: SQLスクリプト
```bash
psql $DATABASE_URL -f scripts/insert_master_data.sql
```

### 方法2: TypeScriptスクリプト
```bash
npx tsx scripts/insertMasterData.ts
```

---

## 1. 都道府県コードマスタ

### データ（47都道府県）

```sql
INSERT INTO prefecture_codes (id, prefecture_code, prefecture_name, display_order, is_active) VALUES
(gen_random_uuid(), '01', '北海道', 1, true),
(gen_random_uuid(), '02', '青森県', 2, true),
(gen_random_uuid(), '03', '岩手県', 3, true),
(gen_random_uuid(), '04', '宮城県', 4, true),
(gen_random_uuid(), '05', '秋田県', 5, true),
(gen_random_uuid(), '06', '山形県', 6, true),
(gen_random_uuid(), '07', '福島県', 7, true),
(gen_random_uuid(), '08', '茨城県', 8, true),
(gen_random_uuid(), '09', '栃木県', 9, true),
(gen_random_uuid(), '10', '群馬県', 10, true),
(gen_random_uuid(), '11', '埼玉県', 11, true),
(gen_random_uuid(), '12', '千葉県', 12, true),
(gen_random_uuid(), '13', '東京都', 13, true),
(gen_random_uuid(), '14', '神奈川県', 14, true),
(gen_random_uuid(), '15', '新潟県', 15, true),
(gen_random_uuid(), '16', '富山県', 16, true),
(gen_random_uuid(), '17', '石川県', 17, true),
(gen_random_uuid(), '18', '福井県', 18, true),
(gen_random_uuid(), '19', '山梨県', 19, true),
(gen_random_uuid(), '20', '長野県', 20, true),
(gen_random_uuid(), '21', '岐阜県', 21, true),
(gen_random_uuid(), '22', '静岡県', 22, true),
(gen_random_uuid(), '23', '愛知県', 23, true),
(gen_random_uuid(), '24', '三重県', 24, true),
(gen_random_uuid(), '25', '滋賀県', 25, true),
(gen_random_uuid(), '26', '京都府', 26, true),
(gen_random_uuid(), '27', '大阪府', 27, true),
(gen_random_uuid(), '28', '兵庫県', 28, true),
(gen_random_uuid(), '29', '奈良県', 29, true),
(gen_random_uuid(), '30', '和歌山県', 30, true),
(gen_random_uuid(), '31', '鳥取県', 31, true),
(gen_random_uuid(), '32', '島根県', 32, true),
(gen_random_uuid(), '33', '岡山県', 33, true),
(gen_random_uuid(), '34', '広島県', 34, true),
(gen_random_uuid(), '35', '山口県', 35, true),
(gen_random_uuid(), '36', '徳島県', 36, true),
(gen_random_uuid(), '37', '香川県', 37, true),
(gen_random_uuid(), '38', '愛媛県', 38, true),
(gen_random_uuid(), '39', '高知県', 39, true),
(gen_random_uuid(), '40', '福岡県', 40, true),
(gen_random_uuid(), '41', '佐賀県', 41, true),
(gen_random_uuid(), '42', '長崎県', 42, true),
(gen_random_uuid(), '43', '熊本県', 43, true),
(gen_random_uuid(), '44', '大分県', 44, true),
(gen_random_uuid(), '45', '宮崎県', 45, true),
(gen_random_uuid(), '46', '鹿児島県', 46, true),
(gen_random_uuid(), '47', '沖縄県', 47, true);
```

---

## 2. 職員資格コードマスタ（別表20）

### データ

```sql
INSERT INTO staff_qualification_codes (id, qualification_code, qualification_name, description, is_active) VALUES
(gen_random_uuid(), '01', '保健師', '保健師助産師看護師法に基づく保健師', true),
(gen_random_uuid(), '02', '助産師', '保健師助産師看護師法に基づく助産師', true),
(gen_random_uuid(), '03', '看護師', '保健師助産師看護師法に基づく看護師', true),
(gen_random_uuid(), '04', '理学療法士', '理学療法士及び作業療法士法に基づく理学療法士', true),
(gen_random_uuid(), '05', '作業療法士', '理学療法士及び作業療法士法に基づく作業療法士', true),
(gen_random_uuid(), '06', '言語聴覚士', '言語聴覚士法に基づく言語聴覚士', true),
(gen_random_uuid(), '07', '准看護師', '保健師助産師看護師法に基づく准看護師', true),
(gen_random_uuid(), '08', '専門研修修了看護師', '特定行為研修を修了した看護師', true),
(gen_random_uuid(), '09', '看護補助者', '看護補助を行う者', true),
(gen_random_uuid(), '10', '精神保健福祉士', '精神保健福祉士法に基づく精神保健福祉士', true);
```

**注**: 2回目、3回目訪問用のコード（11-30, 51-80）は、1回目のコード（01-10）を基に自動計算するため、マスタには登録不要。

---

## 3. 訪問場所コードマスタ（別表16）

### データ

```sql
INSERT INTO visit_location_codes (id, location_code, location_name, description, is_active) VALUES
(gen_random_uuid(), '01', '居宅', '利用者の自宅', true),
(gen_random_uuid(), '02', '老人ホーム', '有料老人ホーム等', true),
(gen_random_uuid(), '03', '特別養護老人ホーム', '特別養護老人ホーム', true),
(gen_random_uuid(), '04', '介護老人保健施設', '介護老人保健施設', true),
(gen_random_uuid(), '05', 'その他の施設', 'その他の施設', true),
(gen_random_uuid(), '06', '病院', '病院', true),
(gen_random_uuid(), '07', '診療所', '診療所', true),
(gen_random_uuid(), '08', 'グループホーム', '認知症対応型共同生活介護事業所', true),
(gen_random_uuid(), '09', 'サービス付き高齢者向け住宅', 'サービス付き高齢者向け住宅', true),
(gen_random_uuid(), '99', 'その他', 'その他（文字データで指定）', true);
```

---

## 4. レセプト種別コードマスタ（別表4）

### データ

```sql
INSERT INTO receipt_type_codes (id, receipt_type_code, receipt_type_name, insurance_type, description, is_active) VALUES
(gen_random_uuid(), '3110', '訪問看護療養費（健康保険）', 'medical', '健康保険法に基づく訪問看護療養費', true),
(gen_random_uuid(), '3120', '訪問看護療養費（国民健康保険）', 'medical', '国民健康保険法に基づく訪問看護療養費', true),
(gen_random_uuid(), '3130', '訪問看護療養費（後期高齢者医療）', 'medical', '高齢者の医療の確保に関する法律に基づく訪問看護療養費', true),
(gen_random_uuid(), '3111', '訪問看護療養費（健康保険・公費併用）', 'medical', '健康保険と公費の併用', true),
(gen_random_uuid(), '3121', '訪問看護療養費（国民健康保険・公費併用）', 'medical', '国民健康保険と公費の併用', true),
(gen_random_uuid(), '3131', '訪問看護療養費（後期高齢者医療・公費併用）', 'medical', '後期高齢者医療と公費の併用', true),
(gen_random_uuid(), '3140', '訪問看護療養費（公費単独）', 'medical', '公費負担医療のみ', true);
```

---

## 5. 訪問看護サービスコードマスタ（主要なもの）

### データ（抜粋）

実際の診療報酬点数表に基づいて、主要なサービスコードを投入する必要があります。
以下は例示です（実際のコードと点数は最新の診療報酬改定を確認してください）。

```sql
-- 訪問看護基本療養費
INSERT INTO nursing_service_codes (id, service_code, service_name, points, valid_from, valid_to, insurance_type, is_active) VALUES
(gen_random_uuid(), '311000110', '訪問看護基本療養費（Ⅰ）週3日まで', 5550, '2024-04-01', NULL, 'medical', true),
(gen_random_uuid(), '311000210', '訪問看護基本療養費（Ⅰ）週4日以降', 6550, '2024-04-01', NULL, 'medical', true),
(gen_random_uuid(), '311000310', '訪問看護基本療養費（Ⅱ）週3日まで', 5050, '2024-04-01', NULL, 'medical', true),
(gen_random_uuid(), '311000410', '訪問看護基本療養費（Ⅱ）週4日以降', 6050, '2024-04-01', NULL, 'medical', true),
(gen_random_uuid(), '311000510', '訪問看護基本療養費（Ⅲ）週3日まで', 4550, '2024-04-01', NULL, 'medical', true),
(gen_random_uuid(), '311000610', '訪問看護基本療養費（Ⅲ）週4日以降', 5550, '2024-04-01', NULL, 'medical', true);

-- 精神科訪問看護基本療養費
INSERT INTO nursing_service_codes (id, service_code, service_name, points, valid_from, valid_to, insurance_type, is_active) VALUES
(gen_random_uuid(), '311001110', '精神科訪問看護基本療養費（Ⅰ）週3日まで', 5750, '2024-04-01', NULL, 'medical', true),
(gen_random_uuid(), '311001210', '精神科訪問看護基本療養費（Ⅰ）週4日以降', 6750, '2024-04-01', NULL, 'medical', true),
(gen_random_uuid(), '311001310', '精神科訪問看護基本療養費（Ⅱ）', 3000, '2024-04-01', NULL, 'medical', true);

-- 主要な加算
INSERT INTO nursing_service_codes (id, service_code, service_name, points, valid_from, valid_to, insurance_type, is_active) VALUES
(gen_random_uuid(), '312000110', '特別管理加算', 2500, '2024-04-01', NULL, 'medical', true),
(gen_random_uuid(), '312000210', '長時間訪問看護加算', 5200, '2024-04-01', NULL, 'medical', true),
(gen_random_uuid(), '312000310', '複数名訪問看護加算（看護職員等）', 4500, '2024-04-01', NULL, 'medical', true),
(gen_random_uuid(), '312000410', '複数名訪問看護加算（准看護師）', 3800, '2024-04-01', NULL, 'medical', true),
(gen_random_uuid(), '312000510', '複数名訪問看護加算（看護補助者）', 3000, '2024-04-01', NULL, 'medical', true),
(gen_random_uuid(), '312000610', '夜間・早朝訪問看護加算', 2100, '2024-04-01', NULL, 'medical', true),
(gen_random_uuid(), '312000710', '深夜訪問看護加算', 4200, '2024-04-01', NULL, 'medical', true),
(gen_random_uuid(), '312000810', '緊急訪問看護加算', 2650, '2024-04-01', NULL, 'medical', true),
(gen_random_uuid(), '312000910', '24時間対応体制加算', 6400, '2024-04-01', NULL, 'medical', true),
(gen_random_uuid(), '312001010', '特別地域訪問看護加算', NULL, '2024-04-01', NULL, 'medical', true); -- 点数は基本療養費の15%加算

-- 理学療法士・作業療法士・言語聴覚士による訪問
INSERT INTO nursing_service_codes (id, service_code, service_name, points, valid_from, valid_to, insurance_type, is_active) VALUES
(gen_random_uuid(), '313000110', '理学療法士等による訪問看護', 2970, '2024-04-01', NULL, 'medical', true);

-- ターミナルケア加算
INSERT INTO nursing_service_codes (id, service_code, service_name, points, valid_from, valid_to, insurance_type, is_active) VALUES
(gen_random_uuid(), '314000110', 'ターミナルケア加算', 25000, '2024-04-01', NULL, 'medical', true);
```

**注**: 実際の診療報酬点数表は数百件以上のコードが存在するため、主要なものから順次投入する必要があります。

---

## 6. データ投入スクリプト

### TypeScriptスクリプト例

```typescript
// scripts/insertMasterData.ts

import { db } from '../server/db';
import {
  prefectureCodes,
  staffQualificationCodes,
  visitLocationCodes,
  receiptTypeCodes,
  nursingServiceCodes
} from '../shared/schema';

async function insertMasterData() {
  console.log('マスターデータの投入を開始します...');

  try {
    // 1. 都道府県コード
    console.log('都道府県コードを投入中...');
    await db.insert(prefectureCodes).values([
      { prefectureCode: '01', prefectureName: '北海道', displayOrder: 1, isActive: true },
      { prefectureCode: '02', prefectureName: '青森県', displayOrder: 2, isActive: true },
      // ... (47都道府県全て)
    ]);
    console.log('✓ 都道府県コード: 47件投入完了');

    // 2. 職員資格コード
    console.log('職員資格コードを投入中...');
    await db.insert(staffQualificationCodes).values([
      { qualificationCode: '01', qualificationName: '保健師', description: '保健師助産師看護師法に基づく保健師', isActive: true },
      { qualificationCode: '02', qualificationName: '助産師', description: '保健師助産師看護師法に基づく助産師', isActive: true },
      // ... (10件)
    ]);
    console.log('✓ 職員資格コード: 10件投入完了');

    // 3. 訪問場所コード
    console.log('訪問場所コードを投入中...');
    await db.insert(visitLocationCodes).values([
      { locationCode: '01', locationName: '居宅', description: '利用者の自宅', isActive: true },
      { locationCode: '02', locationName: '老人ホーム', description: '有料老人ホーム等', isActive: true },
      // ... (10件程度)
    ]);
    console.log('✓ 訪問場所コード: 10件投入完了');

    // 4. レセプト種別コード
    console.log('レセプト種別コードを投入中...');
    await db.insert(receiptTypeCodes).values([
      { receiptTypeCode: '3110', receiptTypeName: '訪問看護療養費（健康保険）', insuranceType: 'medical', description: '健康保険法に基づく訪問看護療養費', isActive: true },
      // ... (7件)
    ]);
    console.log('✓ レセプト種別コード: 7件投入完了');

    // 5. 訪問看護サービスコード（主要なもの）
    console.log('訪問看護サービスコードを投入中...');
    await db.insert(nursingServiceCodes).values([
      { serviceCode: '311000110', serviceName: '訪問看護基本療養費（Ⅰ）週3日まで', points: 5550, validFrom: new Date('2024-04-01'), validTo: null, insuranceType: 'medical', isActive: true },
      // ... (主要なもの50-100件程度)
    ]);
    console.log('✓ 訪問看護サービスコード: 投入完了');

    console.log('\nマスターデータの投入が完了しました！');

  } catch (error) {
    console.error('エラーが発生しました:', error);
    throw error;
  }
}

insertMasterData();
```

### 実行方法

```bash
npx tsx scripts/insertMasterData.ts
```

---

## 7. データ更新について

### 診療報酬改定時の対応

診療報酬改定（通常2年ごと）があった場合:

1. **有効期限の設定**: 旧コードの `validTo` を改定日前日に設定
2. **新コードの追加**: 新しいコードを `validFrom` = 改定日で追加
3. **点数の変更**: 点数が変更された場合も同様に、新レコードを追加

### 例

```sql
-- 令和6年4月改定前のコード（有効期限を設定）
UPDATE nursing_service_codes
SET valid_to = '2024-03-31'
WHERE service_code = '311000110' AND valid_from = '2022-04-01';

-- 令和6年4月改定後のコード（新規追加）
INSERT INTO nursing_service_codes (id, service_code, service_name, points, valid_from, valid_to, insurance_type, is_active)
VALUES (gen_random_uuid(), '311000110', '訪問看護基本療養費（Ⅰ）週3日まで', 5550, '2024-04-01', NULL, 'medical', true);
```

---

## 8. データメンテナンス

### 無効化

不要になったコードは削除せず、`isActive` を `false` に設定:

```sql
UPDATE nursing_service_codes
SET is_active = false, updated_at = NOW()
WHERE service_code = '311000110' AND valid_from = '2022-04-01';
```

### 一括インポート

CSVファイルからの一括インポート機能をUIに追加することを推奨。

---

## 変更履歴

| 日付 | 変更内容 | 担当者 |
|------|---------|--------|
| 2025-11-03 | 初版作成 | - |
