import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useBasePath } from "@/hooks/useBasePath";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { AlertCircle, FileText, CreditCard, ChevronRight, CheckCircle } from "lucide-react";

type NotificationSchedule = {
  id: string;
  scheduledDate: string;
  scheduledStartTime: string;
  scheduledEndTime: string;
  purpose: string;
  patient: {
    id: string;
    lastName: string;
    firstName: string;
  };
  nurse: {
    id: string;
    fullName: string;
  } | null;
};

type NotificationDoctorOrder = {
  id: string;
  endDate: string;
  daysRemaining: number;
  patient: {
    id: string;
    lastName: string;
    firstName: string;
  };
  medicalInstitution: {
    id: string;
    name: string;
    doctorName: string;
  };
};

type NotificationInsuranceCard = {
  id: string;
  validUntil: string;
  daysRemaining: number;
  cardType: string;
  patient: {
    id: string;
    lastName: string;
    firstName: string;
  };
};

type NotificationData = {
  schedulesWithoutRecords: NotificationSchedule[];
  expiringDoctorOrders: NotificationDoctorOrder[];
  expiringInsuranceCards: NotificationInsuranceCard[];
};

interface NotificationPanelProps {
  onClose?: () => void;
}

export function NotificationPanel({ onClose }: NotificationPanelProps) {
  const [, setLocation] = useLocation();
  const basePath = useBasePath();

  const { data, isLoading } = useQuery<NotificationData>({
    queryKey: ["/api/notifications/list"],
    refetchInterval: 60000, // Refetch every 60 seconds
  });

  const handleScheduleClick = (schedule: NotificationSchedule) => {
    setLocation(`${basePath}/records?mode=create&scheduleId=${schedule.id}&patientId=${schedule.patient.id}`);
    onClose?.();
  };

  const handleDoctorOrderClick = (order: NotificationDoctorOrder) => {
    setLocation(`${basePath}/patients/${order.patient.id}`);
    onClose?.();
  };

  const handleInsuranceCardClick = (card: NotificationInsuranceCard) => {
    setLocation(`${basePath}/patients/${card.patient.id}`);
    onClose?.();
  };

  const handleViewAll = (section: 'schedules' | 'doctorOrders' | 'insuranceCards') => {
    if (section === 'schedules') {
      setLocation(`${basePath}/schedules-without-records`);
    } else if (section === 'doctorOrders') {
      setLocation(`${basePath}/patients`); // TODO: 専用ページがあれば変更
    } else {
      setLocation(`${basePath}/insurance-cards`);
    }
    onClose?.();
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ja-JP', {
      month: '2-digit',
      day: '2-digit',
    });
  };

  const formatTime = (timeStr: string) => {
    const time = new Date(timeStr);
    return time.toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <div className="w-80 p-4">
        <div className="text-center text-sm text-muted-foreground">読み込み中...</div>
      </div>
    );
  }

  const hasNotifications =
    (data?.schedulesWithoutRecords?.length ?? 0) > 0 ||
    (data?.expiringDoctorOrders?.length ?? 0) > 0 ||
    (data?.expiringInsuranceCards?.length ?? 0) > 0;

  if (!hasNotifications) {
    return (
      <div className="w-80 p-6">
        <div className="flex flex-col items-center justify-center text-center space-y-2">
          <CheckCircle className="h-12 w-12 text-green-500" />
          <p className="text-sm font-medium">通知はありません</p>
          <p className="text-xs text-muted-foreground">すべての業務が完了しています</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-80 sm:w-96">
      <ScrollArea className="h-[400px]">
        <div className="p-4 space-y-4">
          {/* 記録未作成スケジュール */}
          {data?.schedulesWithoutRecords && data.schedulesWithoutRecords.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-destructive" />
                <h3 className="text-sm font-semibold">記録未作成 ({data.schedulesWithoutRecords.length}件)</h3>
              </div>
              <div className="space-y-1">
                {data.schedulesWithoutRecords.slice(0, 3).map((schedule) => (
                  <button
                    key={schedule.id}
                    onClick={() => handleScheduleClick(schedule)}
                    className="w-full text-left px-3 py-2 rounded-md hover:bg-accent transition-colors text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">
                          {formatDate(schedule.scheduledDate)} {formatTime(schedule.scheduledStartTime)}
                        </div>
                        <div className="text-muted-foreground truncate">
                          {schedule.patient.lastName} {schedule.patient.firstName}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground ml-1" />
                    </div>
                  </button>
                ))}
                {data.schedulesWithoutRecords.length > 3 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleViewAll('schedules')}
                    className="w-full text-xs"
                  >
                    すべて表示 ({data.schedulesWithoutRecords.length}件) →
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* 指示書期限切れ間近 */}
          {data?.expiringDoctorOrders && data.expiringDoctorOrders.length > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-orange-500" />
                  <h3 className="text-sm font-semibold">指示書期限切れ間近 ({data.expiringDoctorOrders.length}件)</h3>
                </div>
                <div className="space-y-1">
                  {data.expiringDoctorOrders.slice(0, 3).map((order) => (
                    <button
                      key={order.id}
                      onClick={() => handleDoctorOrderClick(order)}
                      className="w-full text-left px-3 py-2 rounded-md hover:bg-accent transition-colors text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">
                            {order.patient.lastName} {order.patient.firstName}
                          </div>
                          <div className="text-muted-foreground truncate">
                            {formatDate(order.endDate)} (あと{order.daysRemaining}日)
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground ml-1" />
                      </div>
                    </button>
                  ))}
                  {data.expiringDoctorOrders.length > 3 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleViewAll('doctorOrders')}
                      className="w-full text-xs"
                    >
                      すべて表示 ({data.expiringDoctorOrders.length}件) →
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}

          {/* 保険証期限切れ間近 */}
          {data?.expiringInsuranceCards && data.expiringInsuranceCards.length > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-blue-500" />
                  <h3 className="text-sm font-semibold">保険証期限切れ間近 ({data.expiringInsuranceCards.length}件)</h3>
                </div>
                <div className="space-y-1">
                  {data.expiringInsuranceCards.slice(0, 3).map((card) => (
                    <button
                      key={card.id}
                      onClick={() => handleInsuranceCardClick(card)}
                      className="w-full text-left px-3 py-2 rounded-md hover:bg-accent transition-colors text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">
                            {card.patient.lastName} {card.patient.firstName}
                          </div>
                          <div className="text-muted-foreground truncate">
                            {formatDate(card.validUntil!)} (あと{card.daysRemaining}日)
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground ml-1" />
                      </div>
                    </button>
                  ))}
                  {data.expiringInsuranceCards.length > 3 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleViewAll('insuranceCards')}
                      className="w-full text-xs"
                    >
                      すべて表示 ({data.expiringInsuranceCards.length}件) →
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
