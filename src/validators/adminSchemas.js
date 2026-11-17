import { z } from "zod";

export const menuStatusSchema = z.object({
  status: z.enum(["approved", "rejected", "inactive"], {
    message: "Status must be approved, rejected or inactive",
  }),
  rejectionReason: z.string().trim().max(300).optional(),
});

export const blockSchema = z.object({
  isBlocked: z.boolean({ message: "isBlocked must be true or false" }),
});