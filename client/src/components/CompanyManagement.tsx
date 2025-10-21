import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
} from "@/components/ui/alert-dialog";
import {
  Building2,
  Plus,
  Edit,
  Trash2,
  Eye,
  MapPin,
  Phone,
  Mail,
  Globe,
  Users,
  Home,
  Copy,
  CheckCircle2
} from "lucide-react";
import { systemAdminApi, type CreateCompanyWithAdminRequest, type CompanyDetail } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import type { Company } from "@shared/schema";

interface CompanyFormData {
  companyName: string;
  companySlug: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  facilityName: string;
  facilitySlug: string;
  facilityAddress: string;
  facilityPhone: string;
  facilityEmail: string;
  adminUsername: string;
  adminEmail: string;
  adminFullName: string;
  adminPassword: string;
  adminPhone: string;
}

interface CompanyEditFormData {
  name: string;
  slug: string;
  address: string;
  phone: string;
  email: string;
}

const initialFormData: CompanyFormData = {
  companyName: "",
  companySlug: "",
  companyAddress: "",
  companyPhone: "",
  companyEmail: "",
  facilityName: "",
  facilitySlug: "headquarters",
  facilityAddress: "",
  facilityPhone: "",
  facilityEmail: "",
  adminUsername: "",
  adminEmail: "",
  adminFullName: "",
  adminPassword: "",
  adminPhone: "",
};

export function CompanyManagement() {
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [formData, setFormData] = useState<CompanyFormData>(initialFormData);
  const [editFormData, setEditFormData] = useState<CompanyEditFormData>({
    name: "",
    slug: "",
    address: "",
    phone: "",
    email: ""
  });
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [companyDetail, setCompanyDetail] = useState<CompanyDetail | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [originalSlug, setOriginalSlug] = useState<string>("");
  const [showSlugWarning, setShowSlugWarning] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState<string>("");
  const [copiedLoginUrl, setCopiedLoginUrl] = useState(false);

  // Fetch companies
  const { data: companies, isLoading, refetch, error } = useQuery({
    queryKey: ["system-admin-companies"],
    queryFn: systemAdminApi.getCompanies,
  });

  // Auto-generate slug from name
  const handleInputChange = (field: keyof CompanyFormData, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));

    // Auto-generate company slug from name
    if (field === 'companyName') {
      const slug = value
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
      setFormData(prev => ({
        ...prev,
        companySlug: slug,
        facilityName: prev.facilityName || `${value}本社`,
        adminUsername: slug ? `${slug}_admin` : '',
      }));
    }

    // Auto-generate admin username from company slug
    if (field === 'companySlug' && value) {
      setFormData(prev => ({
        ...prev,
        adminUsername: `${value}_admin`
      }));
    }
  };

  // Generate random password
  const generatePassword = () => {
    const length = 12;
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    let password = "";
    for (let i = 0; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    setFormData(prev => ({ ...prev, adminPassword: password }));
    setGeneratedPassword(password);
  };

  // Handle create company
  const handleCreateCompany = async () => {
    if (!formData.companyName || !formData.companySlug || !formData.adminUsername ||
        !formData.adminEmail || !formData.adminFullName || !formData.adminPassword) {
      toast({
        title: "エラー",
        description: "必須項目を入力してください",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const requestData: CreateCompanyWithAdminRequest = {
        companyName: formData.companyName,
        companySlug: formData.companySlug,
        companyAddress: formData.companyAddress,
        companyPhone: formData.companyPhone,
        companyEmail: formData.companyEmail,
        facilityName: formData.facilityName || `${formData.companyName}本社`,
        facilitySlug: formData.facilitySlug,
        facilityAddress: formData.facilityAddress || formData.companyAddress,
        facilityPhone: formData.facilityPhone || formData.companyPhone,
        facilityEmail: formData.facilityEmail || formData.companyEmail,
        adminUsername: formData.adminUsername,
        adminEmail: formData.adminEmail,
        adminFullName: formData.adminFullName,
        adminPassword: formData.adminPassword,
        adminPhone: formData.adminPhone,
      };

      const result = await systemAdminApi.createCompany(requestData);

      setIsCreateDialogOpen(false);
      setFormData(initialFormData);
      setGeneratedPassword("");
      refetch();

      toast({
        title: "企業作成完了",
        description: (
          <div className="space-y-2">
            <p>企業「{result.company.name}」を作成しました</p>
            <p className="text-sm">ログインURL: {result.loginUrl}</p>
            <p className="text-sm">管理者: {result.adminUser.username}</p>
          </div>
        ),
      });
    } catch (error: any) {
      console.error('Failed to create company:', error);
      toast({
        title: "エラー",
        description: error.message || "企業の作成に失敗しました",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle view detail
  const handleViewDetail = async (company: Company) => {
    try {
      const detail = await systemAdminApi.getCompanyDetail(company.id);
      setCompanyDetail(detail);
      setIsDetailDialogOpen(true);
    } catch (error) {
      console.error('Failed to get company detail:', error);
      toast({
        title: "エラー",
        description: "企業詳細の取得に失敗しました",
        variant: "destructive",
      });
    }
  };

  // Handle edit
  const handleEditCompany = (company: Company) => {
    setSelectedCompany(company);
    setOriginalSlug(company.slug);
    setEditFormData({
      name: company.name,
      slug: company.slug,
      address: company.address || "",
      phone: company.phone || "",
      email: company.email || "",
    });
    setIsEditDialogOpen(true);
  };

  // Handle update
  const handleUpdateCompany = async () => {
    if (!selectedCompany) return;

    // Check if slug changed
    if (originalSlug !== editFormData.slug) {
      setShowSlugWarning(true);
      return;
    }

    await performUpdate();
  };

  const performUpdate = async () => {
    if (!selectedCompany) return;

    setIsSubmitting(true);
    try {
      await systemAdminApi.updateCompany(selectedCompany.id, editFormData);

      setIsEditDialogOpen(false);
      setShowSlugWarning(false);
      setSelectedCompany(null);
      setOriginalSlug("");
      refetch();

      toast({
        title: "更新完了",
        description: "企業情報を更新しました",
      });
    } catch (error: any) {
      console.error('Failed to update company:', error);
      toast({
        title: "エラー",
        description: error.message || "企業情報の更新に失敗しました",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle delete
  const handleDeleteCompany = (company: Company) => {
    setSelectedCompany(company);
    setIsDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!selectedCompany) return;

    setIsSubmitting(true);
    try {
      await systemAdminApi.deleteCompany(selectedCompany.id);

      setIsDeleteDialogOpen(false);
      setSelectedCompany(null);
      refetch();

      toast({
        title: "削除完了",
        description: "企業を削除しました",
      });
    } catch (error: any) {
      console.error('Failed to delete company:', error);
      toast({
        title: "エラー",
        description: error.message || "企業の削除に失敗しました",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Copy login URL to clipboard
  const copyLoginUrl = (slug: string, facilitySlug: string = "headquarters") => {
    const url = `${window.location.origin}/${slug}/${facilitySlug}/login`;
    navigator.clipboard.writeText(url);
    setCopiedLoginUrl(true);
    setTimeout(() => setCopiedLoginUrl(false), 2000);
    toast({
      title: "コピーしました",
      description: "ログインURLをクリップボードにコピーしました",
    });
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
          <p className="text-muted-foreground">企業データの取得に失敗しました</p>
          <p className="text-sm text-red-600 mt-2">エラー詳細: {error instanceof Error ? error.message : String(error)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 lg:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold">企業管理</h1>
          <p className="text-muted-foreground">
            システム全体の企業を管理します
          </p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          新規企業作成
        </Button>
      </div>

      {/* Companies Grid */}
      <div className="grid gap-6">
        {companies && companies.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {companies.map((company) => (
              <Card key={company.id} className="transition-all hover:shadow-lg">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-blue-100 text-blue-600">
                        <Building2 className="h-5 w-5" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{company.name}</CardTitle>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-sm text-muted-foreground">/{company.slug}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  {/* Contact Information */}
                  {company.address && (
                    <div className="flex items-start gap-2 text-sm">
                      <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <span className="text-muted-foreground">{company.address}</span>
                    </div>
                  )}
                  {company.phone && (
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">{company.phone}</span>
                    </div>
                  )}
                  {company.email && (
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">{company.email}</span>
                    </div>
                  )}

                  {/* URL */}
                  <div className="flex items-center gap-2 text-sm">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <code className="text-xs bg-muted px-2 py-1 rounded flex-1">
                      /{company.slug}/headquarters
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => copyLoginUrl(company.slug)}
                    >
                      {copiedLoginUrl ? (
                        <CheckCircle2 className="h-3 w-3 text-green-600" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2 pt-4 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewDetail(company)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditCompany(company)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="ml-auto text-destructive hover:text-destructive"
                      onClick={() => handleDeleteCompany(company)}
                      disabled={isSubmitting}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">企業が登録されていません</h3>
              <p className="text-muted-foreground text-center mb-6">
                最初の企業を作成して、システムの利用を開始しましょう。
              </p>
              <Button onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                新規企業作成
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>新規企業作成</DialogTitle>
            <DialogDescription>
              企業、本社施設、初期管理者を一括で作成します
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Company Info */}
            <div className="space-y-4">
              <h3 className="font-semibold flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                企業情報
              </h3>
              <div className="space-y-3 pl-6">
                <div className="space-y-2">
                  <Label htmlFor="companyName">企業名 *</Label>
                  <Input
                    id="companyName"
                    value={formData.companyName}
                    onChange={(e) => handleInputChange('companyName', e.target.value)}
                    placeholder="例: 社会福祉グループ"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="companySlug">URLスラッグ *</Label>
                  <Input
                    id="companySlug"
                    value={formData.companySlug}
                    onChange={(e) => handleInputChange('companySlug', e.target.value)}
                    placeholder="例: shakenfuku"
                  />
                  <p className="text-xs text-muted-foreground">
                    英数字とハイフンのみ。URL: /{formData.companySlug || "slug"}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="companyAddress">住所</Label>
                  <Textarea
                    id="companyAddress"
                    value={formData.companyAddress}
                    onChange={(e) => handleInputChange('companyAddress', e.target.value)}
                    placeholder="例: 東京都新宿区西新宿1-1-1"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="companyPhone">電話番号</Label>
                    <Input
                      id="companyPhone"
                      value={formData.companyPhone}
                      onChange={(e) => handleInputChange('companyPhone', e.target.value)}
                      placeholder="例: 03-1234-5678"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="companyEmail">メール</Label>
                    <Input
                      id="companyEmail"
                      type="email"
                      value={formData.companyEmail}
                      onChange={(e) => handleInputChange('companyEmail', e.target.value)}
                      placeholder="例: info@company.com"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Facility Info */}
            <div className="space-y-4">
              <h3 className="font-semibold flex items-center gap-2">
                <Home className="h-4 w-4" />
                本社施設
              </h3>
              <div className="space-y-3 pl-6">
                <div className="space-y-2">
                  <Label htmlFor="facilityName">施設名 *</Label>
                  <Input
                    id="facilityName"
                    value={formData.facilityName}
                    onChange={(e) => handleInputChange('facilityName', e.target.value)}
                    placeholder="例: 社会福祉グループ本社"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="facilitySlug">施設スラッグ</Label>
                  <Input
                    id="facilitySlug"
                    value={formData.facilitySlug}
                    onChange={(e) => handleInputChange('facilitySlug', e.target.value)}
                    placeholder="headquarters"
                  />
                  <p className="text-xs text-muted-foreground">
                    デフォルト: headquarters
                  </p>
                </div>
              </div>
            </div>

            {/* Admin User Info */}
            <div className="space-y-4">
              <h3 className="font-semibold flex items-center gap-2">
                <Users className="h-4 w-4" />
                初期管理者
              </h3>
              <div className="space-y-3 pl-6">
                <div className="space-y-2">
                  <Label htmlFor="adminUsername">ユーザー名 *</Label>
                  <Input
                    id="adminUsername"
                    value={formData.adminUsername}
                    onChange={(e) => handleInputChange('adminUsername', e.target.value)}
                    placeholder="例: shakenfuku_admin"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="adminEmail">メールアドレス *</Label>
                  <Input
                    id="adminEmail"
                    type="email"
                    value={formData.adminEmail}
                    onChange={(e) => handleInputChange('adminEmail', e.target.value)}
                    placeholder="例: admin@company.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="adminFullName">フルネーム *</Label>
                  <Input
                    id="adminFullName"
                    value={formData.adminFullName}
                    onChange={(e) => handleInputChange('adminFullName', e.target.value)}
                    placeholder="例: 本社管理者"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="adminPassword">パスワード *</Label>
                  <div className="flex gap-2">
                    <Input
                      id="adminPassword"
                      type="text"
                      value={formData.adminPassword}
                      onChange={(e) => handleInputChange('adminPassword', e.target.value)}
                      placeholder="パスワードを入力"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={generatePassword}
                    >
                      自動生成
                    </Button>
                  </div>
                  {generatedPassword && (
                    <p className="text-xs text-orange-600">
                      生成されたパスワードをメモしてください: {generatedPassword}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="adminPhone">電話番号</Label>
                  <Input
                    id="adminPhone"
                    value={formData.adminPhone}
                    onChange={(e) => handleInputChange('adminPhone', e.target.value)}
                    placeholder="例: 090-1234-5678"
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCreateDialogOpen(false)}
              disabled={isSubmitting}
            >
              キャンセル
            </Button>
            <Button
              onClick={handleCreateCompany}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                  作成中...
                </>
              ) : (
                '作成'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{companyDetail?.name}</DialogTitle>
            <DialogDescription>企業詳細情報</DialogDescription>
          </DialogHeader>

          {companyDetail && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium">URLスラッグ</p>
                  <p className="text-sm text-muted-foreground">/{companyDetail.slug}</p>
                </div>
                <div>
                  <p className="text-sm font-medium">登録日</p>
                  <p className="text-sm text-muted-foreground">
                    {companyDetail.createdAt ? new Date(companyDetail.createdAt).toLocaleDateString('ja-JP') : '-'}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold">統計情報</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-3 bg-muted rounded-lg">
                    <p className="text-2xl font-bold">{companyDetail.statistics.facilityCount}</p>
                    <p className="text-xs text-muted-foreground">施設数</p>
                  </div>
                  <div className="text-center p-3 bg-muted rounded-lg">
                    <p className="text-2xl font-bold">{companyDetail.statistics.userCount}</p>
                    <p className="text-xs text-muted-foreground">ユーザー数</p>
                  </div>
                  <div className="text-center p-3 bg-muted rounded-lg">
                    <p className="text-2xl font-bold">{companyDetail.statistics.patientCount}</p>
                    <p className="text-xs text-muted-foreground">利用者数</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold">施設一覧</h4>
                <div className="space-y-2">
                  {companyDetail.facilities.map((facility) => (
                    <div key={facility.id} className="flex items-center justify-between p-2 bg-muted rounded">
                      <div className="flex items-center gap-2">
                        <Home className="h-4 w-4" />
                        <span className="text-sm">{facility.name}</span>
                        {facility.isHeadquarters && (
                          <Badge variant="default" className="text-xs">本社</Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">/{facility.slug}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>企業編集</DialogTitle>
            <DialogDescription>企業の基本情報を編集します</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="editName">企業名 *</Label>
              <Input
                id="editName"
                value={editFormData.name}
                onChange={(e) => setEditFormData(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editSlug">URLスラッグ *</Label>
              <Input
                id="editSlug"
                value={editFormData.slug}
                onChange={(e) => setEditFormData(prev => ({ ...prev, slug: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                ⚠️ スラッグの変更は既存URLに影響します
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="editAddress">住所</Label>
              <Textarea
                id="editAddress"
                value={editFormData.address}
                onChange={(e) => setEditFormData(prev => ({ ...prev, address: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="editPhone">電話番号</Label>
                <Input
                  id="editPhone"
                  value={editFormData.phone}
                  onChange={(e) => setEditFormData(prev => ({ ...prev, phone: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editEmail">メール</Label>
                <Input
                  id="editEmail"
                  type="email"
                  value={editFormData.email}
                  onChange={(e) => setEditFormData(prev => ({ ...prev, email: e.target.value }))}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsEditDialogOpen(false)}
              disabled={isSubmitting}
            >
              キャンセル
            </Button>
            <Button
              onClick={handleUpdateCompany}
              disabled={isSubmitting}
            >
              {isSubmitting ? '更新中...' : '更新'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Slug Warning Dialog */}
      <AlertDialog open={showSlugWarning} onOpenChange={setShowSlugWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>URLスラッグを変更しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              <div className="space-y-3">
                <p className="font-semibold text-destructive">
                  ⚠️ 稼働中の企業のURLを変更すると、全施設に影響があります
                </p>
                <div className="space-y-2 text-sm">
                  <p>変更前: <code className="bg-muted px-2 py-1 rounded">/{originalSlug}</code></p>
                  <p>変更後: <code className="bg-muted px-2 py-1 rounded">/{editFormData.slug}</code></p>
                </div>
                <div className="space-y-1 text-sm">
                  <p className="font-semibold">影響:</p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>全施設のURLが変更されます</li>
                    <li>既存のブックマークURLが無効になります</li>
                    <li>全ユーザーが影響を受けます</li>
                  </ul>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowSlugWarning(false);
              setEditFormData(prev => ({ ...prev, slug: originalSlug }));
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

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>企業を削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              <div className="space-y-3">
                <p>
                  <strong>{selectedCompany?.name}</strong> を完全に削除します。
                </p>
                <div className="rounded-md bg-destructive/10 p-3 border border-destructive/20">
                  <p className="text-sm font-semibold text-destructive">
                    ⚠️ 警告：この操作は復元できません
                  </p>
                  <p className="text-sm text-destructive/90 mt-1">
                    以下のデータが完全に削除されます：
                  </p>
                  <ul className="text-sm text-destructive/90 mt-2 ml-4 list-disc space-y-1">
                    <li>本社を含むすべての施設</li>
                    <li>すべてのユーザーアカウント</li>
                    <li>すべての利用者データと看護記録</li>
                    <li>スケジュール、契約、レセプトなどすべての業務データ</li>
                  </ul>
                </div>
                <p className="text-sm text-muted-foreground">
                  ※ 本社以外のアクティブな施設が存在する場合は、先に施設管理から削除してください。
                </p>
                <p className="text-sm text-muted-foreground">
                  ※ 論理削除済みの施設も自動的に物理削除されます。
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={isSubmitting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isSubmitting ? '削除中...' : '完全に削除する'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
