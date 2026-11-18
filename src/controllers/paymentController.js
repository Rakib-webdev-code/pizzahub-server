import { getStripe } from "../config/stripe.js";
import { getDB } from "../config/db.js";
import { isPremium, idFilter } from "../utils/helpers.js";
import { MENU_STATUS, FREE_PLAN_ITEM_LIMIT } from "../utils/constants.js";

const users = () => getDB().collection("users");
const items = () => getDB().collection("menuItems");
const transactions = () => getDB().collection("transactions");

/* ---------- Checkout session তৈরি ---------- */

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

/* ---------- Webhook ---------- */

// নতুন ও পুরোনো Stripe API দুই ভার্সনেই কাজ করে
const periodEnd = (subscription) => {
  const ts =
    subscription.current_period_end ??
    subscription.items?.data?.[0]?.current_period_end;
  return ts
    ? new Date(ts * 1000)
    : new Date(Date.now() + 31 * 24 * 60 * 60 * 1000);
};

const activatePremium = (vendorId, expiresAt) =>
  users().updateOne(
    { _id: vendorId },
    {
      $set: {
        subscriptionPlan: "premium",
        subscriptionExpiresAt: expiresAt,
        updatedAt: new Date(),
      },
    }
  );

// stripeSessionId এর উপর upsert, তাই একই event দুবার এলেও transaction একটাই হবে
const saveTransaction = (data) =>
  transactions().updateOne(
    { stripeSessionId: data.stripeSessionId },
    { $setOnInsert: { ...data, createdAt: new Date() } },
    { upsert: true }
  );

const handleCheckoutCompleted = async (session) => {
  if (session.mode !== "subscription" || session.payment_status !== "paid") return;

  // metadata আমাদের server ই বসিয়েছে, আর signature verified, তাই বিশ্বাসযোগ্য
  const vendorId = session.metadata?.vendorId;
  const vendor = vendorId ? await users().findOne(idFilter(vendorId)) : null;

  if (!vendor || vendor.role !== "vendor") {
    console.warn("Webhook: vendor not found for session", session.id);
    return;
  }

  const subscription = await getStripe().subscriptions.retrieve(session.subscription);
  const expiresAt = periodEnd(subscription);

  await saveTransaction({
    vendorId: vendor._id,
    plan: "premium",
    amount: (session.amount_total || 0) / 100,
    currency: session.currency,
    stripeSessionId: session.id,
    stripeSubscriptionId: session.subscription,
    status: "paid",
  });

  await activatePremium(vendor._id, expiresAt);
};

// মাসিক renewal
const handleInvoicePaid = async (invoice) => {
  if (invoice.billing_reason !== "subscription_cycle") return;

  const subscriptionId =
    invoice.subscription ?? invoice.parent?.subscription_details?.subscription;
  if (!subscriptionId) return;

  const previous = await transactions().findOne(
    { stripeSubscriptionId: subscriptionId },
    { sort: { createdAt: -1 } }
  );
  if (!previous) return;

  const subscription = await getStripe().subscriptions.retrieve(subscriptionId);

  await saveTransaction({
    vendorId: previous.vendorId,
    plan: "premium",
    amount: (invoice.amount_paid || 0) / 100,
    currency: invoice.currency,
    stripeSessionId: `invoice_${invoice.id}`,
    stripeSubscriptionId: subscriptionId,
    status: "paid",
  });

  await activatePremium(previous.vendorId, periodEnd(subscription));
};

// Subscription শেষ বা বাতিল: free এ নামানো, ৩টার বেশি active আইটেম inactive করা
const handleSubscriptionDeleted = async (subscription) => {
  const vendorId = subscription.metadata?.vendorId;
  if (!vendorId) return;

  const vendor = await users().findOne(idFilter(vendorId));
  if (!vendor) return;

  await users().updateOne(
    { _id: vendor._id },
    {
      $set: {
        subscriptionPlan: "free",
        subscriptionExpiresAt: new Date(),
        updatedAt: new Date(),
      },
    }
  );

  const extra = await items()
    .find({
      vendorId: vendor._id,
      status: { $in: [MENU_STATUS.PENDING, MENU_STATUS.APPROVED] },
    })
    .sort({ createdAt: 1 })
    .skip(FREE_PLAN_ITEM_LIMIT)
    .project({ _id: 1 })
    .toArray();

  if (extra.length) {
    await items().updateMany(
      { _id: { $in: extra.map((i) => i._id) } },
      { $set: { status: MENU_STATUS.INACTIVE, updatedAt: new Date() } }
    );
  }
};

export const stripeWebhook = async (req, res) => {
  const signature = req.headers["stripe-signature"];
  if (!signature) {
    return res.status(400).send("Missing Stripe signature");
  }
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(500).send("Webhook secret is not configured");
  }

  let event;
  try {
    // req.body এখানে raw Buffer (app.js এ express.raw দিয়ে)
    event = getStripe().webhooks.constructEvent(
      req.body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object);
        break;
      case "invoice.paid":
        await handleInvoicePaid(event.data.object);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object);
        break;
      default:
        break;
    }
  } catch (err) {
    console.error("Webhook handler failed:", err);
    // 500 দিলে Stripe নিজে থেকে আবার পাঠাবে (আমাদের handler idempotent)
    return res.status(500).send("Webhook handler failed");
  }

  res.json({ received: true });
};

/* ---------- Subscription পেজের জন্য ---------- */

// Success পেজ: Premium কিন্তু webhook ই চালু করে, এখানে শুধু অবস্থা দেখানো হয়
export const getCheckoutStatus = async (req, res) => {
  const sessionId = String(req.params.sessionId || "");
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) {
    return res.status(400).json({ success: false, message: "Invalid session ID" });
  }

  // শুধু নিজের transaction দেখা যাবে
  const tx = await transactions().findOne({
    stripeSessionId: sessionId,
    vendorId: req.user._id,
  });

  res.json({
    success: true,
    paid: Boolean(tx),
    transaction: tx
      ? {
          plan: tx.plan,
          amount: tx.amount,
          currency: tx.currency,
          status: tx.status,
          createdAt: tx.createdAt,
        }
      : null,
    subscription: {
      plan: isPremium(req.user) ? "premium" : "free",
      expiresAt: req.user.subscriptionExpiresAt,
    },
  });
};

export const getSubscription = async (req, res) => {
  const vendor = req.user;

  const activeItems = await items().countDocuments({
    vendorId: vendor._id,
    status: { $in: [MENU_STATUS.PENDING, MENU_STATUS.APPROVED] },
  });

  let cancelAtPeriodEnd = false;
  if (isPremium(vendor)) {
    const tx = await transactions().findOne(
      { vendorId: vendor._id, stripeSubscriptionId: { $ne: null } },
      { sort: { createdAt: -1 } }
    );
    if (tx?.stripeSubscriptionId) {
      try {
        const sub = await getStripe().subscriptions.retrieve(tx.stripeSubscriptionId);
        cancelAtPeriodEnd = Boolean(sub.cancel_at_period_end);
      } catch {
        // Stripe এ না পেলেও পেজ যেন ভেঙে না যায়
      }
    }
  }

  res.json({
    success: true,
    subscription: {
      plan: isPremium(vendor) ? "premium" : "free",
      expiresAt: vendor.subscriptionExpiresAt,
      cancelAtPeriodEnd,
      activeItems,
      itemLimit: isPremium(vendor) ? null : FREE_PLAN_ITEM_LIMIT,
    },
  });
};

// বর্তমান billing period শেষে বাতিল (তখন পর্যন্ত Premium থাকবে)
export const cancelSubscription = async (req, res) => {
  if (!isPremium(req.user)) {
    return res
      .status(400)
      .json({ success: false, message: "You do not have an active Premium subscription" });
  }

  // শুধু এই vendor এর নিজের subscription
  const tx = await transactions().findOne(
    { vendorId: req.user._id, stripeSubscriptionId: { $ne: null } },
    { sort: { createdAt: -1 } }
  );

  if (!tx) {
    return res
      .status(404)
      .json({ success: false, message: "Subscription record not found" });
  }

  await getStripe().subscriptions.update(tx.stripeSubscriptionId, {
    cancel_at_period_end: true,
  });

  res.json({
    success: true,
    message: "Your subscription will end at the end of the current billing period",
  });
};