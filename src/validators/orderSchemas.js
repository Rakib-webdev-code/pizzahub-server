import { z } from "zod";

const isRealDate = (s) => {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

// টাইমজোন ভুলে আজকের তারিখ যেন আটকে না যায়, তাই ১ দিনের ছাড়
const minAllowedDate = () => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

export const createOrderSchema = z.object({
  itemId: z.string().min(1, "Item is required"),
  deliveryDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Delivery date must be in YYYY-MM-DD format")
    .refine(isRealDate, "Invalid delivery date")
    .refine((d) => d >= minAllowedDate(), "Delivery date cannot be in the past"),
  deliveryAddress: z
    .string()
    .trim()
    .min(10, "Delivery address must be at least 10 characters")
    .max(300),
  message: z.string().trim().max(500).optional().default(""),
});

export const decisionSchema = z.object({
  action: z.enum(["accept", "reject"], {
    message: "Action must be accept or reject",
  }),
});