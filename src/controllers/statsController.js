import { getDB } from "../config/db.js";
import { MENU_STATUS, ORDER_STATUS, ROLES } from "../utils/constants.js";
import { isPremium } from "../utils/helpers.js";

const col = (name) => getDB().collection(name);
const sum = (obj) => Object.values(obj).reduce((a, b) => a + b, 0);

// status অনুযায়ী গণনা, সব status এ ০ দিয়ে শুরু
const statusCounts = async (collection, match, statuses) => {
  const rows = await col(collection)
    .aggregate([{ $match: match }, { $group: { _id: "$status", count: { $sum: 1 } } }])
    .toArray();

  const result = Object.fromEntries(Object.values(statuses).map((s) => [s, 0]));
  rows.forEach((r) => {
    if (r._id in result) result[r._id] = r.count;
  });
  return result;
};

// শেষ N দিনের প্রতিদিনের সংখ্যা (চার্টের জন্য)
const dailySeries = async (collection, match, days = 14) => {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - (days - 1));

  const rows = await col(collection)
    .aggregate([
      { $match: { ...match, createdAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
    ])
    .toArray();

  const map = new Map(rows.map((r) => [r._id, r.count]));
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(since);
    d.setUTCDate(since.getUTCDate() + i);
    const key = d.toISOString().slice(0, 10);
    return { date: key, count: map.get(key) || 0 };
  });
};

// শেষ N মাসের হিসাব (সংখ্যা অথবা কোনো ফিল্ডের যোগফল)
const monthlySeries = async (collection, match, months = 6, sumField = null) => {
  const since = new Date();
  since.setUTCDate(1);
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCMonth(since.getUTCMonth() - (months - 1));

  const rows = await col(collection)
    .aggregate([
      { $match: { ...match, createdAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
          value: { $sum: sumField ? `$${sumField}` : 1 },
        },
      },
    ])
    .toArray();

  const map = new Map(rows.map((r) => [r._id, r.value]));
  return Array.from({ length: months }, (_, i) => {
    const d = new Date(Date.UTC(since.getUTCFullYear(), since.getUTCMonth() + i, 1));
    const key = d.toISOString().slice(0, 7);
    return { month: key, value: map.get(key) || 0 };
  });
};

export const vendorStats = async (req, res) => {
  const vendorId = req.user._id;

  const [itemCounts, orderCounts, ordersTrend, revenueRows] = await Promise.all([
    statusCounts("menuItems", { vendorId }, MENU_STATUS),
    statusCounts("orders", { vendorId }, ORDER_STATUS),
    dailySeries("orders", { vendorId }, 14),
    col("orders")
      .aggregate([
        { $match: { vendorId, status: ORDER_STATUS.ACCEPTED } },
        { $group: { _id: null, total: { $sum: "$itemSnapshot.price" } } },
      ])
      .toArray(),
  ]);

  res.json({
    success: true,
    stats: {
      totalItems: sum(itemCounts),
      activeItems: itemCounts[MENU_STATUS.APPROVED],
      pendingItems: itemCounts[MENU_STATUS.PENDING],
      pendingOrders: orderCounts[ORDER_STATUS.PENDING],
      acceptedOrders: orderCounts[ORDER_STATUS.ACCEPTED],
      subscriptionPlan: isPremium(req.user) ? "premium" : "free",
      acceptedOrdersValue: revenueRows[0]?.total || 0,
    },
    charts: { ordersByStatus: orderCounts, itemsByStatus: itemCounts, ordersTrend },
  });
};

export const customerStats = async (req, res) => {
  const customerId = req.user._id;

  const [orderCounts, ordersTrend] = await Promise.all([
    statusCounts("orders", { customerId }, ORDER_STATUS),
    dailySeries("orders", { customerId }, 14),
  ]);

  res.json({
    success: true,
    stats: {
      totalOrders: sum(orderCounts),
      pendingOrders: orderCounts[ORDER_STATUS.PENDING],
      acceptedOrders: orderCounts[ORDER_STATUS.ACCEPTED],
      rejectedOrders: orderCounts[ORDER_STATUS.REJECTED],
      cancelledOrders: orderCounts[ORDER_STATUS.CANCELLED],
    },
    charts: { ordersByStatus: orderCounts, ordersTrend },
  });
};

export const adminStats = async (req, res) => {
  const [
    totalUsers,
    totalVendors,
    totalCustomers,
    menuByStatus,
    ordersByStatus,
    totalTransactions,
    revenueRows,
    userGrowth,
    revenueByMonth,
  ] = await Promise.all([
    col("users").countDocuments({}),
    col("users").countDocuments({ role: ROLES.VENDOR }),
    col("users").countDocuments({ role: ROLES.CUSTOMER }),
    statusCounts("menuItems", {}, MENU_STATUS),
    statusCounts("orders", {}, ORDER_STATUS),
    col("transactions").countDocuments({}),
    col("transactions")
      .aggregate([
        { $match: { status: "paid" } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ])
      .toArray(),
    monthlySeries("users", {}, 6),
    monthlySeries("transactions", { status: "paid" }, 6, "amount"),
  ]);

  res.json({
    success: true,
    stats: {
      totalUsers,
      totalVendors,
      totalCustomers,
      totalMenuItems: sum(menuByStatus),
      pendingMenuItems: menuByStatus[MENU_STATUS.PENDING],
      totalTransactions,
      totalRevenue: revenueRows[0]?.total || 0,
    },
    charts: { menuByStatus, ordersByStatus, userGrowth, revenueByMonth },
  });
};