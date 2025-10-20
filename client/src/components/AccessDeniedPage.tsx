import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AccessDeniedPageProps {
  message?: string;
  userFacility?: string;
  requestedFacility?: string;
  onReturnToMyFacility: () => void;
}

export function AccessDeniedPage({
  message = "この施設へのアクセス権限がありません",
  userFacility,
  requestedFacility,
  onReturnToMyFacility
}: AccessDeniedPageProps) {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-50 p-4">
      <div className="max-w-2xl w-full bg-white rounded-lg shadow-2xl p-8 sm:p-12">
        <div className="text-center">
          {/* Icon */}
          <div className="flex justify-center mb-6">
            <div className="rounded-full bg-red-100 p-6">
              <ShieldAlert className="h-16 w-16 text-red-600" />
            </div>
          </div>

          {/* Title */}
          <h1 className="text-3xl sm:text-4xl font-bold text-red-600 mb-4">
            アクセスが拒否されました
          </h1>

          {/* Message */}
          <p className="text-lg text-gray-700 mb-6">
            {message}
          </p>

          {/* Facility Info */}
          {userFacility && requestedFacility && (
            <div className="bg-gray-50 rounded-lg p-6 mb-8 text-left">
              <div className="space-y-3">
                <div>
                  <span className="text-sm font-semibold text-gray-600">あなたの施設:</span>
                  <p className="text-base font-medium text-gray-900 mt-1">{userFacility}</p>
                </div>
                <div className="border-t pt-3">
                  <span className="text-sm font-semibold text-gray-600">アクセスしようとした施設:</span>
                  <p className="text-base font-medium text-red-600 mt-1">{requestedFacility}</p>
                </div>
              </div>
            </div>
          )}

          {/* Explanation */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-8">
            <p className="text-sm text-gray-700">
              <strong>セキュリティ上の理由により、</strong>
              <br />
              ご自身の施設以外のデータにはアクセスできません。
              <br />
              正しい施設のURLからアクセスしてください。
            </p>
          </div>

          {/* Action Button */}
          <Button
            onClick={onReturnToMyFacility}
            size="lg"
            className="w-full sm:w-auto px-8 py-3 text-lg"
          >
            自分の施設に戻る
          </Button>

          {/* Additional Help */}
          <p className="text-sm text-gray-500 mt-6">
            このエラーが続く場合は、システム管理者にお問い合わせください。
          </p>
        </div>
      </div>
    </div>
  );
}
