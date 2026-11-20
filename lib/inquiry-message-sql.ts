// Explicit outer-table names keep correlated previews scoped to each inquiry.
export const inquiryReplySql = "coalesce((SELECT body FROM inquiry_messages WHERE inquiry_id = inquiries.id AND role IN ('owner','reviewer') ORDER BY seq DESC LIMIT 1), inquiries.reply)";
export const inquiryLastMessageSql = "(SELECT json_object('body',body,'senderName',sender_name,'role',role,'createdAt',created_at) FROM inquiry_messages WHERE inquiry_id = inquiries.id ORDER BY seq DESC LIMIT 1)";
export const inquiryActivitySql = "coalesce((SELECT created_at FROM inquiry_messages WHERE inquiry_id = inquiries.id ORDER BY seq DESC LIMIT 1), inquiries.created_at)";
