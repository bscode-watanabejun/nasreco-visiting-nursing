import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Construction, ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";

interface ComingSoonProps {
  featureName: string;
  description?: string;
}

export default function ComingSoon({ featureName, description }: ComingSoonProps) {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-[calc(100vh-4rem)] w-full flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="rounded-full bg-orange-100 p-4">
              <Construction className="h-12 w-12 text-orange-600" />
            </div>
          </div>
          <CardTitle className="text-2xl sm:text-3xl">
            {featureName}は今後開発予定です
          </CardTitle>
          <CardDescription className="text-base mt-2">
            {description || `現在、${featureName}の開発を進めています。近日中にリリース予定ですので、今しばらくお待ちください。`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center pb-6">
          <Button
            onClick={() => setLocation("/")}
            className="w-full sm:w-auto"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            ダッシュボードに戻る
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
