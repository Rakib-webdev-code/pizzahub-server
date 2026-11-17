// Zod schema দিয়ে body যাচাই, সফল হলে req.validated এ পরিষ্কার ডাটা
export const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) return next(result.error);
  req.validated = result.data;
  next();
};