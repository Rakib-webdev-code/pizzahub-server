import { z } from "zod";
import { CATEGORIES } from "../utils/constants.js";

const menuItemSchema = z.object({
  itemName: z.string().trim().min(3, "Item name must be at least 3 characters").max(80),
  category: z.enum(CATEGORIES, { message: "Invalid category" }),
  description: z.string().trim().min(10, "Description must be at least 10 characters").max(1000),
  price: z.coerce.number().positive("Price must be greater than 0").max(100000),
  location: z.string().trim().min(2).max(100),
  images: z.array(z.url("Invalid image URL")).min(1, "At least one image is required").max(5),
});

export const createMenuItemSchema = menuItemSchema;

export const updateMenuItemSchema = menuItemSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "No fields provided to update",
  });

export const availabilitySchema = z.object({
  available: z.boolean(),
});