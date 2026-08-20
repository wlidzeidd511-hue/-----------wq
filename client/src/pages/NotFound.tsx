import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Home } from "lucide-react";
import { useLocation } from "wouter";
import { STORE_APP_ICON_URL } from "@shared/siteConfig";

export default function NotFound() {
  const [, setLocation] = useLocation();

  const handleGoHome = () => {
    setLocation("/");
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-sky-50 to-white" dir="rtl">
      <Card className="w-full max-w-lg mx-4 shadow-lg border-0 bg-white/80 backdrop-blur-sm">
        <CardContent className="pt-8 pb-8 text-center">
          <div className="flex justify-center mb-6">
            <div className="relative flex flex-col items-center gap-3">
              <img src={STORE_APP_ICON_URL} alt="الشعار الرسمي لهاتف التميز" className="h-24 w-24 rounded-3xl object-contain shadow-md ring-1 ring-sky-100" />
              <AlertCircle className="h-8 w-8 text-amber-500" />
            </div>
          </div>

          <h1 className="text-4xl font-bold text-slate-900 mb-2">404</h1>

          <h2 className="text-xl font-semibold text-slate-700 mb-4">
            الصفحة غير موجودة
          </h2>

          <p className="text-slate-600 mb-8 leading-relaxed">
            الرابط الذي فتحته غير متاح حاليًا.
            <br />
            ارجع للرئيسية وتابع خدمتك من هناك.
          </p>

          <div
            id="not-found-button-group"
            className="flex flex-col sm:flex-row gap-3 justify-center"
          >
            <Button
              onClick={handleGoHome}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg transition-all duration-200 shadow-md hover:shadow-lg"
            >
              <Home className="w-4 h-4 ml-2" />
              العودة للرئيسية
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
