import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Building2,
  Plus,
  Edit,
  ExternalLink,
  MapPin,
  Phone,
  Mail,
  Globe,
  Settings,
  Trash2
} from "lucide-react";
import { facilityApi, type CreateFacilityRequest } from "@/lib/api";
import { useTenant } from "@/contexts/TenantContext";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useToast } from "@/hooks/use-toast";
import type { Facility } from "@shared/schema";

interface FacilityFormData {
  name: string;
  slug: string;
  address: string;
  phone: string;
  email: string;
  isHeadquarters: boolean;
}

const initialFormData: FacilityFormData = {
  name: "",
  slug: "",
  address: "",
  phone: "",
  email: "",
  isHeadquarters: false,
};

export function FacilityManagement() {
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [formData, setFormData] = useState<FacilityFormData>(initialFormData);
  const [selectedFacility, setSelectedFacility] = useState<Facility | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSlugWarning, setShowSlugWarning] = useState(false);
  const [originalSlug, setOriginalSlug] = useState<string>("");

  const { data: currentUser } = useCurrentUser();

  // Get company slug for URL preview
  const companySlug = currentUser?.facility?.company?.slug;

  // Fetch facilities
  const { data: facilities, isLoading, refetch, error } = useQuery({
    queryKey: ["facilities"],
    queryFn: facilityApi.getFacilities,
  });

  const handleInputChange = (field: keyof FacilityFormData, value: string | boolean) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));

    // Auto-generate slug from name
    if (field === 'name' && typeof value === 'string') {
      const slug = value
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
      setFormData(prev => ({ ...prev, slug }));
    }
  };

  const handleCreateFacility = async () => {
    if (!formData.name || !formData.slug) return;

    setIsSubmitting(true);
    try {
      const facilityData: CreateFacilityRequest = {
        name: formData.name,
        slug: formData.slug,
        address: formData.address,
        phone: formData.phone,
        email: formData.email,
        isHeadquarters: formData.isHeadquarters,
      };

      await facilityApi.createFacility(facilityData);
      setIsCreateDialogOpen(false);
      setFormData(initialFormData);
      refetch();
      toast({
        title: "登録完了",
        description: "施設を登録しました",
      });
    } catch (error) {
      console.error('Failed to create facility:', error);
      toast({
        title: "エラー",
        description: "施設の登録に失敗しました",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditFacility = (facility: Facility) => {
    setSelectedFacility(facility);
    setOriginalSlug(facility.slug); // 元のスラッグを保存
    setFormData({
      name: facility.name,
      slug: facility.slug,
      address: facility.address || "",
      phone: facility.phone || "",
      email: facility.email || "",
      isHeadquarters: facility.isHeadquarters,
    });
    setIsEditDialogOpen(true);
  };

  const handleUpdateFacility = async () => {
    if (!selectedFacility || !formData.name || !formData.slug) return;

    // URLスラッグが変更された場合、警告を表示
    if (originalSlug !== formData.slug) {
      setShowSlugWarning(true);
      return;
    }

    await performUpdate();
  };

  const performUpdate = async () => {
    if (!selectedFacility || !formData.name || !formData.slug) return;

    setIsSubmitting(true);
    try {
      await facilityApi.updateFacility(selectedFacility.id, {
        name: formData.name,
        slug: formData.slug,
        address: formData.address,
        phone: formData.phone,
        email: formData.email,
        isHeadquarters: formData.isHeadquarters,
      });
      setIsEditDialogOpen(false);
      setShowSlugWarning(false);
      setSelectedFacility(null);
      setFormData(initialFormData);
      setOriginalSlug("");
      refetch();
      toast({
        title: "更新完了",
        description: "施設情報を更新しました",
      });
    } catch (error) {
      console.error('Failed to update facility:', error);
      toast({
        title: "エラー",
        description: "施設情報の更新に失敗しました",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeactivateFacility = async (facility: Facility) => {
    setIsSubmitting(true);
    try {
      const result = await facilityApi.deactivateFacility(facility.id);

      refetch();

      // Show warnings if any
      if (result.warnings && result.warnings.length > 0) {
        toast({
          title: "施設を削除しました",
          description: (
            <div className="space-y-1">
              <p>施設は無効化されました</p>
              {result.warnings.map((warning, idx) => (
                <p key={idx} className="text-sm text-yellow-600">⚠ {warning}</p>
              ))}
            </div>
          ),
        });
      } else {
        toast({
          title: "削除完了",
          description: "施設を削除しました",
        });
      }
    } catch (error: any) {
      console.error('Failed to deactivate facility:', error);
      toast({
        title: "エラー",
        description: error.message || "施設の削除に失敗しました",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleViewFacility = (slug: string) => {
    // Generate path-based URL: /companySlug/facilitySlug
    const companySlug = currentUser?.facility?.company?.slug;

    if (companySlug) {
      const facilityUrl = `/${companySlug}/${slug}`;
      console.log('[FacilityManagement] Opening facility URL:', facilityUrl);
      window.open(facilityUrl, '_blank');
    } else {
      toast({
        title: "エラー",
        description: "企業情報が見つかりません",
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    setFormData(initialFormData);
    setSelectedFacility(null);
  };

  if (isLoading) {
    return (
      <div className="space-y-6 p-4 lg:p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Building2 className="mx-auto h-12 w-12 mb-4 opacity-50 text-red-500" />
          <p className="text-muted-foreground">施設データの取得に失敗しました</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 lg:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold">施設管理</h1>
          <p className="text-muted-foreground">
            医療施設の作成・編集・管理
          </p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="h-4 w-4 mr-2" />
              新規施設
            </Button>
          </DialogTrigger>
          <FacilityFormDialog
            title="新規施設作成"
            description="新しい医療施設を追加します"
            formData={formData}
            onInputChange={handleInputChange}
            onSubmit={handleCreateFacility}
            isSubmitting={isSubmitting}
            companySlug={companySlug}
          />
        </Dialog>
      </div>

      {/* Facilities Grid */}
      <div className="grid gap-6">
        {facilities && facilities.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {facilities.map((facility) => (
              <Card key={facility.id} className="transition-all hover:shadow-lg">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-orange-100 text-orange-600">
                        <Building2 className="h-5 w-5" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{facility.name}</CardTitle>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge
                            variant={facility.isHeadquarters ? "default" : "secondary"}
                            className="text-xs"
                          >
                            {facility.isHeadquarters ? "本社" : "施設"}
                          </Badge>
                          <span className="text-sm text-muted-foreground">/{facility.slug}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  {/* Contact Information */}
                  {facility.address && (
                    <div className="flex items-start gap-2 text-sm">
                      <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <span className="text-muted-foreground">{facility.address}</span>
                    </div>
                  )}
                  {facility.phone && (
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">{facility.phone}</span>
                    </div>
                  )}
                  {facility.email && (
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">{facility.email}</span>
                    </div>
                  )}

                  {/* URL */}
                  <div className="flex items-center gap-2 text-sm">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <code className="text-xs bg-muted px-2 py-1 rounded">
                      {companySlug && `/${companySlug}/${facility.slug}`}
                    </code>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2 pt-4 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditFacility(facility)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewFacility(facility.slug)}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>

                    {/* Delete Button - only for corporate admin */}
                    {currentUser?.role === 'corporate_admin' && !facility.isHeadquarters && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="ml-auto text-destructive hover:text-destructive"
                            disabled={isSubmitting}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>施設を削除しますか？</AlertDialogTitle>
                            <AlertDialogDescription>
                              <div className="space-y-3">
                                <p>
                                  <strong>{facility.name}</strong> を削除します。
                                </p>
                                <p>
                                  この操作により施設は無効化されます。施設に紐づく利用者データや記録は保持されますが、
                                  施設一覧には表示されなくなります。
                                </p>
                                <div className="rounded-md bg-destructive/10 p-3 border border-destructive/20">
                                  <p className="text-sm font-semibold text-destructive">
                                    ⚠️ 重要：この操作は復元できません
                                  </p>
                                  <p className="text-sm text-destructive/90 mt-1">
                                    削除した施設を再度有効化することはできません。慎重に実行してください。
                                  </p>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  ※ 本社施設、企業内の最後の施設は削除できません。
                                </p>
                              </div>
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>キャンセル</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDeactivateFacility(facility)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              削除する
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">施設が登録されていません</h3>
              <p className="text-muted-foreground text-center mb-6">
                最初の医療施設を作成して、システムの利用を開始しましょう。
              </p>
              <Button onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                新規施設作成
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <FacilityFormDialog
          title="施設編集"
          description="施設情報を編集します"
          formData={formData}
          onInputChange={handleInputChange}
          onSubmit={handleUpdateFacility}
          isSubmitting={isSubmitting}
          isEdit
          companySlug={companySlug}
        />
      </Dialog>

      {/* URL Slug Change Warning Dialog */}
      <AlertDialog open={showSlugWarning} onOpenChange={setShowSlugWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>URLスラッグを変更しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              <div className="space-y-3">
                <p className="font-semibold text-destructive">
                  ⚠️ 稼働中の施設のURLを変更すると、業務に影響があります
                </p>
                <div className="space-y-2 text-sm">
                  <p>変更前: <code className="bg-muted px-2 py-1 rounded">/{companySlug}/{originalSlug}</code></p>
                  <p>変更後: <code className="bg-muted px-2 py-1 rounded">/{companySlug}/{formData.slug}</code></p>
                </div>
                <div className="space-y-1 text-sm">
                  <p className="font-semibold">影響:</p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>既存のブックマークURLが無効になります</li>
                    <li>ログイン中のユーザーがページ遷移時にエラーになる可能性があります</li>
                    <li>外部システムからの連携リンクが切れる可能性があります</li>
                  </ul>
                </div>
                <div className="space-y-1 text-sm">
                  <p className="font-semibold">推奨対応:</p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>事前に全ユーザーに新URLを周知してください</li>
                    <li>業務時間外（深夜など）に変更してください</li>
                    <li>変更後、全ユーザーにログアウト→再ログインを依頼してください</li>
                  </ul>
                </div>
                <p className="text-sm text-muted-foreground">
                  ※ データベースのデータや権限設定には影響ありません（内部的にはUUIDで管理されています）
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowSlugWarning(false);
              // 元のスラッグに戻す
              setFormData(prev => ({ ...prev, slug: originalSlug }));
            }}>
              キャンセル
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={performUpdate}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              理解した上で変更する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Reusable Form Dialog Component
interface FacilityFormDialogProps {
  title: string;
  description: string;
  formData: FacilityFormData;
  onInputChange: (field: keyof FacilityFormData, value: string | boolean) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  isEdit?: boolean;
  companySlug?: string;
}

function FacilityFormDialog({
  title,
  description,
  formData,
  onInputChange,
  onSubmit,
  isSubmitting,
  isEdit = false,
  companySlug,
}: FacilityFormDialogProps) {
  return (
    <DialogContent className="sm:max-w-[500px]">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-4">
        <div className="space-y-2">
          <Label htmlFor="name">施設名 *</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => onInputChange('name', e.target.value)}
            placeholder="例: 東京本院"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="slug">URLスラッグ *</Label>
          <div className="flex items-center gap-2">
            <Input
              id="slug"
              value={formData.slug}
              onChange={(e) => onInputChange('slug', e.target.value)}
              placeholder="例: tokyo-honin"
              className="flex-1"
            />
          </div>
          {companySlug && formData.slug && (
            <p className="text-xs text-muted-foreground">
              URL例: /{companySlug}/{formData.slug}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            英数字とハイフンのみ使用可能
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="address">住所</Label>
          <Textarea
            id="address"
            value={formData.address}
            onChange={(e) => onInputChange('address', e.target.value)}
            placeholder="例: 東京都渋谷区神宮前1-1-1"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="phone">電話番号</Label>
            <Input
              id="phone"
              value={formData.phone}
              onChange={(e) => onInputChange('phone', e.target.value)}
              placeholder="例: 03-1234-5678"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">メールアドレス</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => onInputChange('email', e.target.value)}
              placeholder="例: info@facility.com"
            />
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Switch
            id="headquarters"
            checked={formData.isHeadquarters}
            onCheckedChange={(checked) => onInputChange('isHeadquarters', checked)}
          />
          <Label htmlFor="headquarters">本社として設定</Label>
        </div>
      </div>

      <DialogFooter>
        <Button
          onClick={onSubmit}
          disabled={isSubmitting || !formData.name || !formData.slug}
        >
          {isSubmitting ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
              {isEdit ? '更新中...' : '作成中...'}
            </>
          ) : (
            isEdit ? '更新' : '作成'
          )}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}