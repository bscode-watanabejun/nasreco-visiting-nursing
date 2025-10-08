import { db } from "./db";
import {
  specialManagementDefinitions,
  specialManagementFields,
  type InsertSpecialManagementDefinition,
  type InsertSpecialManagementField,
} from "../shared/schema";

/**
 * 特管マスタデータの初期投入スクリプト
 * Phase 1でハードコーディングしていた6項目をマスタテーブルに移行
 */

const INITIAL_DEFINITIONS: Omit<InsertSpecialManagementDefinition, "facilityId">[] = [
  {
    category: "oxygen",
    displayName: "在宅酸素療法",
    insuranceType: "medical_2500",
    monthlyPoints: 2500,
    description: "在宅酸素療法を実施している患者の管理",
    displayOrder: 1,
    isActive: true,
  },
  {
    category: "tracheostomy",
    displayName: "気管カニューレ",
    insuranceType: "medical_5000",
    monthlyPoints: 5000,
    description: "気管カニューレを使用している患者の管理",
    displayOrder: 2,
    isActive: true,
  },
  {
    category: "ventilator",
    displayName: "人工呼吸器",
    insuranceType: "medical_2500",
    monthlyPoints: 2500,
    description: "人工呼吸器を使用している患者の管理",
    displayOrder: 3,
    isActive: true,
  },
  {
    category: "tpn",
    displayName: "中心静脈栄養",
    insuranceType: "medical_2500",
    monthlyPoints: 2500,
    description: "中心静脈栄養を実施している患者の管理",
    displayOrder: 4,
    isActive: true,
  },
  {
    category: "pressure_ulcer",
    displayName: "褥瘡管理(D3以上)",
    insuranceType: "medical_2500",
    monthlyPoints: 2500,
    description: "D3以上の褥瘡がある患者の管理",
    displayOrder: 5,
    isActive: true,
  },
  {
    category: "artificial_anus",
    displayName: "人工肛門",
    insuranceType: "medical_2500",
    monthlyPoints: 2500,
    description: "人工肛門を造設している患者の管理",
    displayOrder: 6,
    isActive: true,
  },
];

type FieldDefinition = Omit<InsertSpecialManagementField, "definitionId">;

const FIELD_DEFINITIONS: Record<string, FieldDefinition[]> = {
  oxygen: [
    {
      fieldName: "flow_rate",
      fieldLabel: "酸素流量(L/分)",
      fieldType: "number",
      isRequired: false,
      displayOrder: 1,
    },
    {
      fieldName: "spo2",
      fieldLabel: "SpO2(%)",
      fieldType: "number",
      isRequired: false,
      displayOrder: 2,
    },
    {
      fieldName: "usage_hours",
      fieldLabel: "使用時間",
      fieldType: "select",
      fieldOptions: { options: ["24時間", "夜間のみ", "間欠"] },
      isRequired: false,
      displayOrder: 3,
    },
  ],
  tracheostomy: [
    {
      fieldName: "cannula_type",
      fieldLabel: "カニューレの種類",
      fieldType: "text",
      isRequired: false,
      displayOrder: 1,
    },
    {
      fieldName: "cannula_size",
      fieldLabel: "サイズ",
      fieldType: "text",
      isRequired: false,
      displayOrder: 2,
    },
    {
      fieldName: "change_frequency",
      fieldLabel: "交換頻度",
      fieldType: "text",
      isRequired: false,
      displayOrder: 3,
    },
    {
      fieldName: "secretion_amount",
      fieldLabel: "分泌物の量",
      fieldType: "select",
      fieldOptions: { options: ["少量", "中等量", "多量"] },
      isRequired: false,
      displayOrder: 4,
    },
  ],
  ventilator: [
    {
      fieldName: "ventilator_type",
      fieldLabel: "人工呼吸器の種類",
      fieldType: "text",
      isRequired: false,
      displayOrder: 1,
    },
    {
      fieldName: "mode",
      fieldLabel: "モード",
      fieldType: "text",
      isRequired: false,
      displayOrder: 2,
    },
    {
      fieldName: "settings",
      fieldLabel: "設定値",
      fieldType: "textarea",
      isRequired: false,
      displayOrder: 3,
    },
  ],
  tpn: [
    {
      fieldName: "catheter_type",
      fieldLabel: "カテーテルの種類",
      fieldType: "text",
      isRequired: false,
      displayOrder: 1,
    },
    {
      fieldName: "infusion_volume",
      fieldLabel: "輸液量(mL/日)",
      fieldType: "number",
      isRequired: false,
      displayOrder: 2,
    },
    {
      fieldName: "insertion_site",
      fieldLabel: "挿入部位の状態",
      fieldType: "select",
      fieldOptions: { options: ["良好", "発赤あり", "腫脹あり", "浸出液あり"] },
      isRequired: false,
      displayOrder: 3,
    },
  ],
  pressure_ulcer: [
    {
      fieldName: "location",
      fieldLabel: "部位",
      fieldType: "text",
      isRequired: false,
      displayOrder: 1,
    },
    {
      fieldName: "stage",
      fieldLabel: "深達度",
      fieldType: "select",
      fieldOptions: { options: ["D3", "D4", "D5", "不明"] },
      isRequired: false,
      displayOrder: 2,
    },
    {
      fieldName: "size",
      fieldLabel: "サイズ(cm)",
      fieldType: "text",
      isRequired: false,
      displayOrder: 3,
    },
    {
      fieldName: "treatment",
      fieldLabel: "処置内容",
      fieldType: "textarea",
      isRequired: false,
      displayOrder: 4,
    },
  ],
  artificial_anus: [
    {
      fieldName: "stoma_type",
      fieldLabel: "ストーマの種類",
      fieldType: "select",
      fieldOptions: { options: ["結腸ストーマ", "回腸ストーマ", "尿路ストーマ"] },
      isRequired: false,
      displayOrder: 1,
    },
    {
      fieldName: "stoma_condition",
      fieldLabel: "ストーマの状態",
      fieldType: "select",
      fieldOptions: { options: ["良好", "発赤あり", "浮腫あり", "出血あり", "陥没"] },
      isRequired: false,
      displayOrder: 2,
    },
    {
      fieldName: "skin_condition",
      fieldLabel: "周囲皮膚の状態",
      fieldType: "select",
      fieldOptions: { options: ["良好", "発赤あり", "びらんあり", "浸軟あり"] },
      isRequired: false,
      displayOrder: 3,
    },
    {
      fieldName: "output_volume",
      fieldLabel: "排泄量",
      fieldType: "select",
      fieldOptions: { options: ["少量", "中等量", "多量"] },
      isRequired: false,
      displayOrder: 4,
    },
  ],
};

async function seedSpecialManagement() {
  console.log("🌱 特管マスタデータの初期投入を開始します...");

  try {
    // facilityIdをnullとして定義を挿入（全施設共通のマスタデータとして扱う）
    for (const definition of INITIAL_DEFINITIONS) {
      console.log(`  📝 ${definition.displayName} を追加中...`);

      const [inserted] = await db
        .insert(specialManagementDefinitions)
        .values({
          ...definition,
          facilityId: null, // 全施設共通
        })
        .returning();

      console.log(`    ✅ ID: ${inserted.id}`);

      // フィールド定義の挿入
      const fields = FIELD_DEFINITIONS[definition.category];
      if (fields && fields.length > 0) {
        console.log(`    📋 ${fields.length}個のフィールドを追加中...`);

        for (const field of fields) {
          await db.insert(specialManagementFields).values({
            definitionId: inserted.id,
            ...field,
          });
          console.log(`      - ${field.fieldLabel}`);
        }
      }
    }

    console.log("\n✅ 特管マスタデータの初期投入が完了しました！");
    console.log(
      `   合計 ${INITIAL_DEFINITIONS.length} 項目と ${Object.values(FIELD_DEFINITIONS).flat().length} フィールドを登録しました。`
    );
  } catch (error) {
    console.error("❌ エラーが発生しました:", error);
    throw error;
  }

  process.exit(0);
}

// スクリプト実行
seedSpecialManagement();
