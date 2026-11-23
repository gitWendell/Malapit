import { z } from "zod";
export const receivingKinds = { gcash: "GCash", maya: "Maya", bank: "Bank transfer", qr: "QR Ph / wallet QR", cash: "Cash", other: "Other" } as const;
export type ReceivingKind = keyof typeof receivingKinds;
export const RECEIVING_LIMITS = { activePerOwner: 10, storedPerOwner: 100, storedTotal: 2000, qrBytes: 200 * 1024, qrDimension: 1200, qrDaily: 5, qrPerOwner: 20, qrTotal: 250, qrStorageBytes: 32 * 1024 * 1024 } as const;
export const receivingDetails = z.object({
  kind: z.enum(["gcash", "maya", "bank", "qr", "cash", "other"]),
  label: z.string().trim().max(70).default(""), accountName: z.string().trim().max(100).default(""),
  accountNumber: z.string().trim().max(100).default(""), instructions: z.string().trim().max(400).default(""),
  qrImageId: z.string().uuid().nullable().default(null),
}).superRefine((data, ctx) => {
  const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
  if (data.kind !== "cash" && data.accountName.length < 2) issue("accountName", "Add the receiving account name shown by the bank or wallet.");
  if (["bank", "other"].includes(data.kind) && data.label.length < 2) issue("label", "Add the bank name or payment service.");
  if (["gcash", "maya", "bank"].includes(data.kind) && !data.qrImageId && data.accountNumber.length < 5) issue("accountNumber", "Add the receiving account number or upload its QR image.");
  if (["gcash", "maya"].includes(data.kind) && data.accountNumber && !/^(09\d{9}|\+?639\d{9})$/.test(data.accountNumber.replace(/[\s-]/g, ""))) issue("accountNumber", "Use an 11-digit mobile number starting with 09, or +63 followed by the mobile number.");
  if (data.kind === "qr" && !data.qrImageId) issue("qrImageId", "Upload the receiving QR image from your bank or wallet.");
  if (data.kind === "other" && !data.accountNumber && !data.qrImageId && data.instructions.length < 5) issue("instructions", "Add an account, QR image or instructions for this option.");
  if (data.kind === "cash" && data.qrImageId) issue("qrImageId", "Choose a wallet, bank or QR option for this image.");
});
export type ReceivingDetails = z.infer<typeof receivingDetails>;
export const receivingCreate = z.object({ requestId: z.string().uuid(), details: receivingDetails, detailsConfirmed: z.literal(true) });
export const receivingChange = z.discriminatedUnion("action", [
  z.object({ action: z.literal("update"), version: z.string().datetime(), details: receivingDetails, detailsConfirmed: z.literal(true) }),
  z.object({ action: z.literal("archive"), version: z.string().datetime(), confirmed: z.literal(true) }),
]);
export type OwnerPaymentMethod = ReceivingDetails & { id: string; ownerId: string; createdAt: string; updatedAt: string; archivedAt: string | null };
export const paymentDestinationSchema = z.object({ id: z.string().uuid(), updatedAt: z.string().datetime(), kind: z.enum(["gcash", "maya", "bank", "qr", "cash", "other"]), label: z.string(), accountName: z.string(), accountNumber: z.string(), instructions: z.string(), qrImageId: z.string().uuid().nullable() });
export type PaymentDestination = z.infer<typeof paymentDestinationSchema>;
export const destinationSnapshot = (method: OwnerPaymentMethod): PaymentDestination => ({ id: method.id, updatedAt: method.updatedAt, kind: method.kind, label: method.label, accountName: method.accountName, accountNumber: method.accountNumber, instructions: method.instructions, qrImageId: method.qrImageId });
export function readDestination(value: string | null | undefined): PaymentDestination | null { try { return paymentDestinationSchema.parse(JSON.parse(value || "null")); } catch { return null; } }
export const receivingTitle = (method: Pick<ReceivingDetails, "kind" | "label">) => method.label ? (method.kind === "bank" || method.kind === "other" ? method.label : `${receivingKinds[method.kind]} · ${method.label}`) : receivingKinds[method.kind];
export const reportedMethod = (kind: ReceivingKind) => kind === "qr" ? "other" as const : kind;
export function qrPngError(bytes: Uint8Array): string | null {
  if (bytes.length > RECEIVING_LIMITS.qrBytes) return "This QR image is too large. Upload it again using the form.";
  const signature = [137,80,78,71,13,10,26,10];
  if (bytes.length < 45 || signature.some((value, i) => bytes[i] !== value) || new TextDecoder().decode(bytes.slice(12,16)) !== "IHDR") return "Choose a valid QR image using the upload form.";
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), width = view.getUint32(16), height = view.getUint32(20);
  if (view.getUint32(8) !== 13 || Math.min(width,height) < 96 || Math.max(width,height) > RECEIVING_LIMITS.qrDimension) return "Use a clear QR image between 96 and 1200 pixels per side.";
  return null;
}
