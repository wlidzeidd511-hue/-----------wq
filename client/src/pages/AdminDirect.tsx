import { useEffect } from "react";
import { useLocation } from "wouter";

export default function AdminDirect() {
  const [, navigate] = useLocation();

  useEffect(() => {
    // حفظ جلسة المالك مباشرة
    localStorage.setItem("adminSession", "true");
    localStorage.setItem("adminLoginTime", Date.now().toString());
    
    // إعادة توجيه لوحة التحكم
    navigate("/dashboard");
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500 mx-auto mb-4"></div>
        <p className="text-slate-600">جاري الدخول...</p>
      </div>
    </div>
  );
}
