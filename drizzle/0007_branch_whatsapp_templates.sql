INSERT INTO `whatsapp_templates` (`branchId`, `eventType`, `bodyPreview`, `isActive`)
SELECT b.id, t.eventType, t.bodyPreview, true
FROM `branches` b
CROSS JOIN (
  SELECT 'account_created' AS eventType, 'تم إنشاء حسابك في هاتف التميز - {{branch_name}}. بيانات الدخول: {{credentials}}' AS bodyPreview
  UNION ALL SELECT 'invoice_created', 'تم إنشاء فاتورة رقم {{order_number}} في {{branch_name}}. رابط المتابعة: {{tracking_url}}'
  UNION ALL SELECT 'order_ready', 'جهازك للطلب رقم {{order_number}} جاهز للاستلام من {{branch_name}}.'
  UNION ALL SELECT 'order_delivered', 'تم تسليم جهازك للطلب رقم {{order_number}} من {{branch_name}}.'
  UNION ALL SELECT 'warranty_activated', 'تم تفعيل ضمان الطلب رقم {{order_number}} لمدة {{warranty_days}} يومًا وحتى {{warranty_date}}.'
  UNION ALL SELECT 'scratch_won', 'مبروك! فزت بجائزة {{prize_name}}. الكود {{code}} صالح حتى {{expiry_date}}.'
) t
ON DUPLICATE KEY UPDATE `bodyPreview` = VALUES(`bodyPreview`), `isActive` = true;

INSERT INTO `whatsapp_templates` (`branchId`, `eventType`, `bodyPreview`, `isActive`)
VALUES (NULL, 'warranty_activated', 'تم تفعيل ضمان الطلب رقم {{order_number}} لمدة {{warranty_days}} يومًا وحتى {{warranty_date}}.', true)
ON DUPLICATE KEY UPDATE `bodyPreview` = VALUES(`bodyPreview`), `isActive` = true;
