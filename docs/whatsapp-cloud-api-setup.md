# إعداد WhatsApp Cloud API لفرع البساتين

تمت مراجعة وثائق Meta الرسمية المحدثة في يونيو 2026. يتطلب الإرسال التلقائي إنشاء تطبيق Meta بحالة استخدام WhatsApp، وربطه بحساب WhatsApp Business، ثم حفظ **WhatsApp Business Account ID** و**Phone Number ID** وإعداد webhook لاستقبال حالات الإرسال والتسليم والقراءة. رمز الاختبار مؤقت؛ الإنتاج يحتاج System User ورمز وصول دائم بصلاحيات `business_management` و`whatsapp_business_messaging` و`whatsapp_business_management`.

| المسار | ما يقدمه | المتطلبات والقيود |
|---|---|---|
| الربط المباشر مع Meta Cloud API | تحكم مباشر وتكلفة تكامل أقل | قد يتطلب نقل الرقم من تطبيق WhatsApp Business إلى المنصة؛ يجب التأكد أثناء التسجيل من أثر ذلك على التطبيق |
| ربط Coexistence عبر شريك حلول أو مزود تقني معتمد | يبقي تطبيق WhatsApp Business وCloud API على الرقم نفسه مع مزامنة الرسائل | وثائق Meta تشترط أن يتم Embedded Signup عبر Solution Partner أو Tech Provider، وقد توجد رسوم مزود إضافية |

ميزة **Coexistence** تدعم تطبيق WhatsApp Business الإصدار 2.24.17 فأحدث، وتسمح بالرسائل الفردية من التطبيق مع الإرسال الآلي عبر Cloud API، لكنها ليست مسار إعداد ذاتي بسيط لهذا الموقع ما لم يتم استخدام شريك معتمد أو بناء اعتماد Tech Provider كامل.

المصادر الرسمية:

- [WhatsApp Cloud API Get Started](https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started)
- [Onboard WhatsApp Business app users (Coexistence)](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users)
