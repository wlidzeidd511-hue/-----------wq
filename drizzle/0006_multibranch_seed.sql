INSERT INTO `branches` (`id`, `slug`, `code`, `name`, `isActive`, `sortOrder`) VALUES
  (1, 'al-basatin', 'BAS', 'فرع البساتين', true, 1),
  (2, 'al-basiriyah', 'BSR', 'فرع البصيرية', true, 2);

INSERT INTO `branch_settings` (`branchId`, `displayName`, `phone`, `whatsappPhone`, `address`, `mapUrl`, `openingHours`, `warrantyPolicy`, `currency`, `invoicePrefix`)
SELECT 1, 'هاتف التميز - البساتين', `phone`, `whatsappPhone`, `address`, `mapUrl`, `openingHours`, `warrantyPolicy`, `currency`, 'BAS'
FROM `shop_settings` WHERE `id` = 1;

INSERT INTO `branch_settings` (`branchId`, `displayName`, `currency`, `invoicePrefix`)
VALUES (2, 'هاتف التميز - البصيرية', 'ر.س', 'BSR');

INSERT INTO `popup_messages` (`branchId`, `category`, `message`, `weight`, `isActive`) VALUES
  (NULL, 'in_repair', 'دخلنا معه في جلسة مصارحة.🤌🏻', 1, true),
  (NULL, 'in_repair', 'الجهاز للحين يسوي نفسه ما فيه شيء.', 1, true),
  (NULL, 'in_repair', 'لا تخاف… للحين محد قال “وش ذا؟” 😂', 1, true),
  (NULL, 'in_repair', 'بنرجعه لك وهو يقول: آسف.', 1, true),
  (NULL, 'in_repair', 'الجهاز يقول لا تصوروني وأنا كذا 😭', 1, true),
  (NULL, 'in_repair', 'عطنا شوي… لا تخرب علينا التركيز.', 1, true),
  (NULL, 'in_repair', 'الفني للحين يحاول يفهم شخصية جهازك 😂', 1, true),
  (NULL, 'in_repair', 'الجهاز عنيد شوي… بس حنا أعند.', 1, true),
  (NULL, 'in_repair', 'للحين الأمور ماشية… إلا مزاج الفني 😭', 1, true),
  (NULL, 'in_repair', 'باقي شوي ونخلص هوشاتنا معه.', 1, true),
  (NULL, 'in_repair', 'نبي نكسب ثقته أول 😂', 1, true),
  (NULL, 'in_repair', 'الجهاز يقول: تكفون خلوني أرجع لراعيي.', 1, true),
  (NULL, 'in_repair', 'للحين ما اعترف بالمشكلة 😂', 1, true),
  (NULL, 'in_repair', 'إذا الجهاز تكلم… بنبلغك.', 1, true),
  (NULL, 'in_repair', 'شكله زعلان منك أكثر منا 😭', 1, true),
  (NULL, 'in_repair', 'لاتخاف ترا ماخليناه ريموت 🥴', 1, true),
  (NULL, 'ready', 'يلا تعال… خلصنا سواليف معه.', 1, true),
  (NULL, 'ready', 'ترى صار يسأل: وين راعيي؟', 1, true),
  (NULL, 'ready', 'خلاص ما عاد له عذر يقعد عندنا 😂', 1, true),
  (NULL, 'ready', 'تعال قبل يطلب نت عندنا 😭', 1, true),
  (NULL, 'ready', 'ترى تعود على المكان شوي.', 1, true),
  (NULL, 'ready', 'خلاص سوينا اللي علينا… دورك الان', 1, true),
  (NULL, 'ready', 'تعال قبل نخليه موظف عندنا ي 😂', 1, true),
  (NULL, 'ready', 'إذا تأخرت يمكن نخليه موظف عندنا 😭', 1, true),
  (NULL, 'before_rating', 'لا تسرق النجوم كلها 😂', 1, true),
  (NULL, 'before_rating', 'عطنا اللي تستحقه… ووعد ما نزعل.', 1, true),
  (NULL, 'before_rating', 'إذا فرحتك الخدمة… ورنا.🩵', 1, true),
  (NULL, 'before_rating', 'لا تستحي من الخمس 😂', 1, true),
  (NULL, 'before_rating', 'إذا عندك ملاحظة… لا تخبيها.', 1, true),
  (NULL, 'after_delivery', 'إذا أحد سألك من صلح جهازك… لا تسوي نفسك ناسي 😂', 1, true),
  (NULL, 'after_delivery', 'نبي نشوفك… بس بدون جهاز خربان 😭', 1, true),
  (NULL, 'after_delivery', 'إذا الجهاز صار مؤدب… ترى من تربيتنا 😎', 1, true),
  (NULL, 'after_delivery', 'روح جربه… وإذا ابتسمت نعتبر مهمتنا نجحت.', 1, true),
  (NULL, 'after_delivery', 'انتبه لا يطيح منك أول خمس دقائق 😂', 1, true),
  (NULL, 'after_delivery', 'الله يستر عليك وعليه 😭🩵', 1, true),
  (NULL, 'before_scratch', 'شد الحيل… يمكن تضبط.', 1, true),
  (NULL, 'before_scratch', 'الحظ يراقبك 👀', 1, true),
  (NULL, 'before_scratch', 'إذا ربحت لا تنسى من وقف معك 😂', 1, true),
  (NULL, 'before_scratch', 'لا تناظر واجد… اكشط.', 1, true),
  (NULL, 'before_scratch', 'لا تقول غش إذا خسرت 😭', 1, true),
  (NULL, 'before_scratch', 'الحين الحقيقة بتبان.', 1, true),
  (NULL, 'before_scratch', 'يا أبيض يا أسود 😂', 1, true),
  (NULL, 'before_scratch', 'بسم الله… والباقي على الحظ.', 1, true),
  (NULL, 'scratch_win', 'وقففففف… مبرووووك 😂🔥', 1, true),
  (NULL, 'scratch_win', 'ياخي شكلك واسطة عند الحظ.', 1, true),
  (NULL, 'scratch_win', 'لا تعلم أحد… خلهم يجربون 😭', 1, true),
  (NULL, 'scratch_win', 'تعال قبل نراجع القرار 😂', 1, true),
  (NULL, 'scratch_win', 'واضح إنك محظوظ اليوم.', 1, true),
  (NULL, 'scratch_win', 'مبروك يا وحش.', 1, true),
  (NULL, 'scratch_win', 'ياخي حتى الشاشة فرحت لك 😂', 1, true),
  (NULL, 'scratch_win', 'لا عاد تجرب اليوم… كفاية حظ 😭', 1, true),
  (NULL, 'scratch_win', 'واضح إن الدعوات شغالة.', 1, true),
  (NULL, 'scratch_win', 'تستاهلها والله.', 1, true),
  (NULL, 'scratch_loss', 'الحظ يقول: مو اليوم.', 1, true),
  (NULL, 'scratch_loss', 'لا تزعل… بكرة يوم جديد 😭', 1, true),
  (NULL, 'scratch_loss', 'خلاص لا تطالع في الشاشة 😂', 1, true),
  (NULL, 'scratch_loss', 'يمكن ضغطت بقوة زيادة 😭', 1, true),
  (NULL, 'scratch_loss', 'الجائزة راحت مع واحد أسرع منك 😂', 1, true),
  (NULL, 'scratch_loss', 'شكلك جيت بدري على الحظ.', 1, true),
  (NULL, 'scratch_loss', 'لا تكسر الجوال تكفى 😂', 1, true),
  (NULL, 'scratch_loss', 'خيرها بغيرها.', 1, true),
  (NULL, 'scratch_loss', 'ترى ما نضحك… شوي بس 😭', 1, true),
  (NULL, 'scratch_loss', 'الحظ مسوي زحمة اليوم.', 1, true);

INSERT INTO `whatsapp_templates` (`branchId`, `eventType`, `bodyPreview`, `isActive`) VALUES
  (NULL, 'account_created', 'تم إنشاء حسابك في هاتف التميز. بيانات الدخول: {{credentials}}', true),
  (NULL, 'invoice_created', 'تم إنشاء فاتورة رقم {{order_number}} في فرع {{branch_name}}.', true),
  (NULL, 'order_ready', 'جهازك للطلب رقم {{order_number}} جاهز للاستلام.', true),
  (NULL, 'order_delivered', 'تم تسليم جهازك. الضمان حتى {{warranty_date}} ولمدة {{warranty_days}} يومًا.', true),
  (NULL, 'scratch_won', 'مبروك! فزت بجائزة {{prize_name}}. الكود صالح حتى {{expiry_date}}.', true);

INSERT INTO `system_jobs` (`jobKey`, `cronExpression`, `isEnabled`) VALUES
  ('monthly_scratch_codes', '0 5 0 1 * *', true),
  ('daily_encrypted_backup', '0 30 1 * * *', true);
