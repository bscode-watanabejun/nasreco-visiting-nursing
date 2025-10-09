-- テストクリニックの全データを削除するスクリプト
-- 依存関係の逆順で削除（外部キー制約を考慮）

-- 施設IDを取得
DO $$
DECLARE
  test_clinic_id varchar;
BEGIN
  SELECT id INTO test_clinic_id FROM facilities WHERE slug = 'test-clinic';

  IF test_clinic_id IS NULL THEN
    RAISE NOTICE 'テストクリニックが見つかりません';
  ELSE
    RAISE NOTICE 'テストクリニック ID: %', test_clinic_id;

    -- 1. 看護記録添付ファイル（nursing_recordsに依存）
    DELETE FROM nursing_record_attachments
    WHERE nursing_record_id IN (
      SELECT id FROM nursing_records WHERE facility_id = test_clinic_id
    );
    RAISE NOTICE '✓ 看護記録添付ファイルを削除しました';

    -- 2. 看護記録
    DELETE FROM nursing_records WHERE facility_id = test_clinic_id;
    RAISE NOTICE '✓ 看護記録を削除しました';

    -- 3. スケジュール
    DELETE FROM schedules WHERE facility_id = test_clinic_id;
    RAISE NOTICE '✓ スケジュールを削除しました';

    -- 4. 訪問（visits）
    DELETE FROM visits WHERE facility_id = test_clinic_id;
    RAISE NOTICE '✓ 訪問を削除しました';

    -- 5. 加算管理
    DELETE FROM additional_payments WHERE facility_id = test_clinic_id;
    RAISE NOTICE '✓ 加算管理データを削除しました';

    -- 6. 投薬情報
    DELETE FROM medications WHERE facility_id = test_clinic_id;
    RAISE NOTICE '✓ 投薬情報を削除しました';

    -- 7. 訪問看護報告書（新規追加）
    DELETE FROM care_reports WHERE facility_id = test_clinic_id;
    RAISE NOTICE '✓ 訪問看護報告書を削除しました';

    -- 8. 契約書・同意書（新規追加）
    DELETE FROM contracts WHERE facility_id = test_clinic_id;
    RAISE NOTICE '✓ 契約書・同意書を削除しました';

    -- 9. 居宅サービス計画書
    DELETE FROM service_care_plans WHERE facility_id = test_clinic_id;
    RAISE NOTICE '✓ 居宅サービス計画書を削除しました';

    -- 10. 訪問看護計画書
    DELETE FROM care_plans WHERE facility_id = test_clinic_id;
    RAISE NOTICE '✓ 訪問看護計画書を削除しました';

    -- 11. 訪問看護指示書
    DELETE FROM doctor_orders WHERE facility_id = test_clinic_id;
    RAISE NOTICE '✓ 訪問看護指示書を削除しました';

    -- 12. 保険証
    DELETE FROM insurance_cards WHERE facility_id = test_clinic_id;
    RAISE NOTICE '✓ 保険証情報を削除しました';

    -- 13. 患者
    DELETE FROM patients WHERE facility_id = test_clinic_id;
    RAISE NOTICE '✓ 患者データを削除しました';

    -- 14. 建物
    DELETE FROM buildings WHERE facility_id = test_clinic_id;
    RAISE NOTICE '✓ 建物データを削除しました';

    -- 15. ケアマネージャー
    DELETE FROM care_managers WHERE facility_id = test_clinic_id;
    RAISE NOTICE '✓ ケアマネージャーマスタを削除しました';

    -- 16. 医療機関
    DELETE FROM medical_institutions WHERE facility_id = test_clinic_id;
    RAISE NOTICE '✓ 医療機関マスタを削除しました';

    -- ユーザーは削除しない（既存のまま維持）

    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ テストクリニックのデータクリーンアップが完了しました';
    RAISE NOTICE '========================================';
  END IF;
END $$;
