import { getStripe } from "../config/stripe.js";
import { isPremium } from "../utils/helpers.js";

export const createCheckoutSession = async (req, res) => {
  const vendor = req.user; // টোকেন থেকে পাওয়া, body থেকে কখনো নয়

  if (isPremium(vendor)) {
    return res.status(400).json({
      success: false,
      message: "You already have an active Premium subscription",
    });
  }

  const clientUrl = (process.env.CLIENT_URL || "http://localhost:3000")
    .split(",")[0]
    .trim();
  const amount = Number(process.env.PREMIUM_PRICE_CENTS) || 999;
  const currency = (process.env.STRIPE_CURRENCY || "usd").toLowerCase();

  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    customer_email: vendor.email,
    client_reference_id: vendor.id,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency,
          unit_amount: amount,
          recurring: { interval: "month" },
          product_data: {
            name: "PizzaHub Premium",
            description:
              "Unlimited menu items, Premium badge and featured homepage placement",
          },
        },
      },
    ],
    metadata: { vendorId: vendor.id, plan: "premium" },
    subscription_data: { metadata: { vendorId: vendor.id, plan: "premium" } },
    success_url: `${clientUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${clientUrl}/payment/cancel`,
  });

  res.json({ success: true, url: session.url, sessionId: session.id });
};