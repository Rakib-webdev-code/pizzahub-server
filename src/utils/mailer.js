import nodemailer from "nodemailer";
import { escapeHtml } from "./helpers.js";

let transporter;

// SMTP সেট না থাকলে null, তখন email ছাড়াই বাকি সব ঠিকমতো চলে
const getTransporter = () => {
  if (transporter) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;

  const port = Number(SMTP_PORT) || 465;
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    connectionTimeout: 8000,
    socketTimeout: 10000,
  });
  return transporter;
};

export const sendOrderStatusEmail = async ({
  to,
  customerName,
  itemName,
  status,
  restaurantName,
  deliveryDate,
}) => {
  const mailer = getTransporter();
  if (!mailer || !to) return false;

  const accepted = status === "accepted";
  const subject = accepted
    ? "Your PizzaHub order was accepted 🍕"
    : "Update on your PizzaHub order";

  const headline = accepted ? "Great news! Your order is accepted" : "Your order was not accepted";
  const detail = accepted
    ? `${escapeHtml(restaurantName)} has accepted your order and will prepare it for delivery on <b>${escapeHtml(deliveryDate)}</b>.`
    : `Unfortunately ${escapeHtml(restaurantName)} could not accept your order this time. You can browse other items on PizzaHub and try again.`;

  const html = `
  <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;border:1px solid #eee;border-radius:12px;overflow:hidden">
    <div style="background:#F4511E;color:#fff;padding:20px 24px;font-size:20px;font-weight:bold">PizzaHub</div>
    <div style="padding:24px;color:#202124">
      <h2 style="margin:0 0 12px">${headline}</h2>
      <p>Hi ${escapeHtml(customerName)},</p>
      <p>${detail}</p>
      <p style="background:#FFF7ED;padding:12px 16px;border-radius:8px"><b>Item:</b> ${escapeHtml(itemName)}</p>
      <p style="color:#6B7280;font-size:13px">Thank you for ordering with PizzaHub.</p>
    </div>
  </div>`;

  await mailer.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to,
    subject,
    html,
  });
  return true;
};