# 🍕 PizzaHub Server

REST API for **PizzaHub**, a role-based pizza ordering and delivery platform. Customers discover pizza shops and place orders, vendors (restaurants) publish menu items and manage incoming orders, and admins moderate users, menu items and transactions.

This repository contains the **Express.js backend**. The Next.js frontend lives in a separate repository.

## 🔗 Links

| | |
|---|---|
| Live site | `<LIVE_SITE_URL>` |
| Live API | `<LIVE_SERVER_URL>` |
| Client repository | `<CLIENT_REPO_URL>` |
| Server repository | https://github.com/Rakib-webdev-code/pizzahub-server |

## ✨ Important Features

- **Better Auth + JWT verification**: every protected route verifies a Bearer token against Better Auth's public JWKS (signature, issuer, audience, expiry).
- **Server-side role-based access** for Admin, Vendor and Customer. Roles are always read from the database, never from the token or the request body.
- **Blocked-user enforcement** on every protected route, effective immediately after an admin blocks a user.
- **Menu management** with admin approval workflow (`pending → approved / rejected / inactive`).
- **Free vs Premium plans**: Free vendors can keep at most 3 active menu items, Premium vendors have no limit.
- **Order system** with duplicate-order prevention, own-item protection, vendor accept/reject (once, only while pending) and customer cancellation (only while pending).
- **Stripe Checkout (subscriptions)** for vendor Premium upgrades. Premium is activated **only after a verified Stripe webhook**, never from the frontend redirect.
- **Idempotent webhook handling**: the same Stripe event delivered twice creates one transaction.
- **Subscription lifecycle**: monthly renewals extend access, cancellation keeps Premium until the period ends, and expiry downgrades the vendor and deactivates items above the Free limit.
- **Advanced menu search**: text search, category and location filters, price range, sorting by price and rating, and pagination.
- **Optional features**: reviews and ratings (only after an accepted order), favorites / wishlist, order status history for a timeline, and email notification when an order is accepted or rejected.
- **Dashboard statistics** APIs with chart-ready data for all three roles.
- **Read-only transactions** for admins (no endpoint can edit a payment record).
- Request validation with Zod, Helmet, CORS allow-list and rate limiting.

## 🛠 Technology Stack

| Purpose | npm package |
|---|---|
| Web framework | `express` |
| Database driver | `mongodb` |
| JWT / JWKS verification | `jose` |
| Request validation | `zod` |
| Payments | `stripe` |
| Email | `nodemailer` |
| Security headers | `helmet` |
| CORS | `cors` |
| Rate limiting | `express-rate-limit` |
| Cookies | `cookie-parser` |
| Environment variables | `dotenv` |
| Dev auto-reload | `nodemon` (dev dependency) |

Runtime: Node.js (ES Modules) with Express 5 and MongoDB.

## 📁 Project Structure

```
pizzahub-server/
├── index.js                 # starts the server after connecting to MongoDB
├── scripts/
│   └── makeAdmin.js         # promotes an existing user to admin
└── src/
    ├── app.js               # middleware, webhook raw-body route, routers
    ├── config/              # db.js, stripe.js
    ├── controllers/         # menu, order, admin, payment, stats, favorite, review
    ├── middleware/          # verifyJWT, verifyUser, verifyRole, validate, errorHandler
    ├── routes/              # one router per resource, combined in routes/index.js
    ├── utils/               # constants, helpers, mailer
    └── validators/          # Zod schemas
```

## 🚀 Installation and Running Locally

**Prerequisites:** Node.js 20+, a MongoDB database (Atlas or local), and the PizzaHub client running (it hosts Better Auth).

```bash
# 1. Clone
git clone https://github.com/Rakib-webdev-code/pizzahub-server.git
cd pizzahub-server

# 2. Install dependencies
npm install

# 3. Create your environment file and fill in the values
cp .env.example .env        # on Windows PowerShell: copy .env.example .env

# 4. Start in development mode
npm run dev                 # or: npm start
```

The server runs on `http://localhost:5000` by default. Open it in the browser to see the health message.

### Local Stripe webhook testing

```bash
stripe listen --forward-to localhost:5000/api/payments/webhook
```

Copy the `whsec_...` value it prints into `STRIPE_WEBHOOK_SECRET`.

### Creating the admin account

Admin accounts cannot be created through public registration. Register a normal account on the client, then promote it directly in the database:

```bash
npm run make-admin -- your-email@example.com
```

## 🔐 Environment Variables

Only the **names** are listed here. Real values live in `.env`, which is git-ignored and never committed.

| Variable | Purpose |
|---|---|
| `PORT` | Server port (default `5000`) |
| `NODE_ENV` | `development` or `production` |
| `CLIENT_URL` | Allowed frontend origin(s) for CORS, comma-separated |
| `MONGODB_URI` | MongoDB connection string |
| `DB_NAME` | Database name (must match the client's Better Auth database) |
| `BETTER_AUTH_URL` | Client URL that serves Better Auth (JWKS, issuer, audience) |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `PREMIUM_PRICE_CENTS` | Monthly Premium price in cents |
| `STRIPE_CURRENCY` | Currency code, for example `usd` |
| `SMTP_HOST` | SMTP host for order emails |
| `SMTP_PORT` | SMTP port |
| `SMTP_USER` | SMTP username |
| `SMTP_PASS` | SMTP password / app password |
| `MAIL_FROM` | Sender shown in emails |

Google OAuth credentials, the Better Auth secret and the ImgBB API key are configured in the client repository.

## 🗄 Database Design

Better Auth manages its own auth collections. This server uses four business collections and does not create extras.

| Collection | Main fields |
|---|---|
| `users` (Better Auth) | name, email, image, role, isBlocked, businessName, subscriptionPlan, subscriptionExpiresAt, favorites |
| `menuItems` | vendorId, itemName, category, description, price, location, images, status, avgRating, reviewCount, reviews[], createdAt |
| `orders` | itemId, vendorId, customerId, itemSnapshot, deliveryDate, deliveryAddress, message, status, statusHistory[], createdAt |
| `transactions` | vendorId, plan, amount, currency, stripeSessionId, stripeSubscriptionId, status, createdAt |

Reviews, favorites and the order status history are stored as fields inside the existing collections.

## 📡 API Reference

All routes are prefixed with `/api`. `401` means missing, invalid or expired token. `403` means blocked user, wrong role or not the owner.

### Public

| Method | Endpoint | Description |
|---|---|---|
| GET | `/menu-items` | Approved items with search, filter, sort, pagination |
| GET | `/menu-items/featured` | Featured items (Premium vendors first) |
| GET | `/menu-items/locations` | Locations for the filter dropdown |

### Any logged-in user

| Method | Endpoint | Description |
|---|---|---|
| GET | `/users/me` | Current user and role |
| GET | `/menu-items/:id` | Item details (non-approved items only visible to owner and admin) |
| GET | `/orders/:id` | Order details (customer, vendor of that order, or admin) |

### Vendor

| Method | Endpoint | Description |
|---|---|---|
| POST | `/menu-items` | Create item (starts as `pending`, Free plan limit applies) |
| GET | `/menu-items/mine` | Own items with approval status |
| PATCH | `/menu-items/:id` | Update own item (goes back to `pending`) |
| PATCH | `/menu-items/:id/availability` | Toggle available / unavailable |
| DELETE | `/menu-items/:id` | Delete own item |
| GET | `/orders/vendor` | Orders for own items |
| PATCH | `/orders/:id/decision` | `{ "action": "accept" \| "reject" }`, pending orders only, once |
| GET | `/payments/subscription` | Plan, expiry, usage |
| POST | `/payments/create-checkout-session` | Start Stripe Checkout for Premium |
| GET | `/payments/checkout-status/:sessionId` | Payment confirmation for the success page |
| POST | `/payments/cancel-subscription` | Cancel at period end |
| GET | `/stats/vendor` | Overview numbers and chart data |

### Customer

| Method | Endpoint | Description |
|---|---|---|
| POST | `/orders` | Place an order |
| GET | `/orders/my` | Own orders |
| PATCH | `/orders/:id/cancel` | Cancel own pending order |
| GET / POST / DELETE | `/favorites`, `/favorites/:itemId` | Wishlist |
| GET | `/menu-items/:id/review-eligibility` | Can this customer review the item |
| POST / DELETE | `/menu-items/:id/reviews` | Add or delete own review |
| GET | `/stats/customer` | Overview numbers and chart data |

### Admin

| Method | Endpoint | Description |
|---|---|---|
| GET | `/admin/users`, `/admin/users/:id` | List (search, role filter) and details |
| PATCH | `/admin/users/:id/block` | `{ "isBlocked": true \| false }` |
| GET | `/admin/menu-items` | All items (search, status, category) |
| PATCH | `/admin/menu-items/:id/status` | Approve, reject or deactivate |
| DELETE | `/admin/menu-items/:id` | Delete an item |
| GET | `/admin/transactions` | Read-only transactions |
| GET | `/stats/admin` | Platform overview and chart data |

### Stripe

| Method | Endpoint | Description |
|---|---|---|
| POST | `/payments/webhook` | Stripe webhook (raw body, signature verified) |

## 🏆 Challenge Requirements

### 1. Advanced search and sorting

`GET /api/menu-items`

| Query parameter | Description |
|---|---|
| `search` | Case-insensitive match on name, description and category |
| `category` | One of the six categories |
| `location` | Case-insensitive match on location |
| `minPrice`, `maxPrice` | Price range |
| `sort` | `newest` (default), `price_asc`, `price_desc`, `rating` |
| `page`, `limit` | Pagination (default `limit=9`, max `50`) |

Example: `/api/menu-items?search=pizza&category=Meat%20Lovers&sort=price_asc&page=1`

How it works: a MongoDB aggregation runs `$match` (only `approved` items plus the filters) → `$lookup` vendor (blocked vendors are excluded and Premium status is computed) → `$sort` (with `_id` as a tiebreaker for stable pages) → `$facet` to return the page of results and the total count in one query. User-supplied search text is regex-escaped.

### 2. JWT verification middleware flow

```
Request ──► verifyJWT ──► verifyUser ──► verifyRole(...roles) ──► controller
```

1. **`verifyJWT`** reads `Authorization: Bearer <token>` and verifies it with `jose` against Better Auth's public JWKS. It checks the signature, issuer, audience and expiry. A missing, invalid or expired token returns **401**. On success only the user's identity is stored in `req.auth`.
2. **`verifyUser`** loads the user from MongoDB. An unknown user returns **401**, a blocked user returns **403**. Role and plan come from the database, so changes take effect immediately.
3. **`verifyRole`** compares the database role with the roles allowed for the route and returns **403** on mismatch.
4. **Controllers** verify resource ownership (for example a vendor can only change their own items and orders) and never trust user IDs or roles sent by the client.

### 3. Stripe webhook flow

1. The vendor calls `POST /payments/create-checkout-session`. The vendor ID comes from the verified token, so nobody can create a session for another vendor.
2. Stripe redirects to the client success or cancel page. **The redirect alone never activates Premium.**
3. Stripe calls `POST /payments/webhook`. The route is mounted before `express.json()` so the raw body is available, and the signature is verified with `STRIPE_WEBHOOK_SECRET`.
4. `checkout.session.completed` saves the transaction (upsert on `stripeSessionId`, so replays are harmless) and activates Premium until the period end.
5. `invoice.paid` handles monthly renewals, and `customer.subscription.deleted` downgrades the vendor and deactivates items above the Free limit.

## 🧪 Testing Payments

Use Stripe test mode with card `4242 4242 4242 4242`, any future expiry date, any CVC and any ZIP code.

## 📜 Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start with nodemon |
| `npm start` | Start with Node |
| `npm run make-admin -- <email>` | Promote an existing user to admin |

## 👤 Author

**Md Rakib**
