import "dotenv/config";
import express from "express";
import cors    from "cors";
import path    from "path";

import { requireAdmin, rateLimit } from "./middleware/authMiddleware.js";

/* ── Route imports ── */
import authRouter        from "./routes/auth/auth.js";
import stallRoutes       from "./routes/admin/stalls.js";
import stallTokenRouter  from "./routes/admin/stallToken.js";
import eventRoutes       from "./routes/admin/events.js";
import eventCandyRoutes  from "./routes/admin/eventCandies.js";
import offerRoutes       from "./routes/admin/offers.js";
import inventoryRoutes   from "./routes/admin/inventory.js";
import candies           from "./routes/admin/candies.js";
import stallCandies      from "./routes/admin/stallCandies.js";
import stallOffersRoutes from "./routes/admin/stallOffers.js";
import reportRoutes      from "./routes/admin/reports.js";
import comboOfferRules   from "./routes/admin/comboOfferRules.js";
import candyListsRoutes  from "./routes/admin/candyLists.js";
import offerListsRouter  from "./routes/admin/offerLists.js";
import categoriesRouter  from "./routes/admin/categories.js";
import billingRoutes     from "./routes/billing/bills.js";

import salesmanConfigRoutes from "./routes/salesman/config.js";
import salesmanRoutes       from "./routes/salesman/dashboard.js";
import salesmanSellRoutes   from "./routes/salesman/sell.js";
import previewRoutes        from "./routes/salesman/prieview.js";
import profileRouter        from "./routes/salesman/profile.js";
import checkoutRoutes       from "./routes/sales/checkout.js";

const app = express();

/* ─── CORS ─── */
const ALLOWED_ORIGINS = process.env.FRONTEND_URL
  ? [process.env.FRONTEND_URL]
  : ["http://localhost:5173","http://localhost:4173","http://localhost:3000"];

app.use(cors({
  origin: (origin, cb) => {
    // Allow no-origin (mobile apps, curl) and listed origins
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    // In dev/staging allow all — tighten in prod via FRONTEND_URL env
    if (process.env.NODE_ENV !== "production") return cb(null, true);
    cb(new Error("CORS: origin not allowed"));
  },
  credentials: true,
}));
app.use(express.json({ limit:"10mb" }));

/* ─── Security headers ─── */
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options","nosniff");
  res.setHeader("X-Frame-Options","DENY");
  res.setHeader("X-XSS-Protection","1; mode=block");
  next();
});

/* ─── Health ─── */
app.get("/", (_req, res) => res.send("🍫 Vendi Candy API running"));

/* ─── Auth (public) ─── */
app.use("/api/auth", authRouter);

/* ─── Stall token ─── */
/* /api/stall-token/resolve/:token  → PUBLIC (salesman verifies link) */
/* /api/stall-token/:stallId        → ADMIN only (generate) */
app.use("/api/stall-token", stallTokenRouter);

/* ─── Salesman routes (public — protected by encrypted token at config level) ─── */
app.use("/api/salesman/config",   salesmanConfigRoutes);
app.use("/api/salesman/preview",  previewRoutes);
app.use("/api/salesman",          salesmanSellRoutes);
app.use("/api/salesman/dashboard",salesmanRoutes);
app.use("/api/salesman",          profileRouter);
app.use("/api/sales/checkout",    checkoutRoutes);

/* ─── Admin routes (ALL protected by JWT) ─── */
app.use("/api/admin/stalls",          requireAdmin, stallRoutes);
app.use("/api/admin/stalls",          requireAdmin, stallCandies);
app.use("/api/admin/events",          requireAdmin, eventRoutes);
app.use("/api/admin/event-candies",   requireAdmin, eventCandyRoutes);
app.use("/api/admin/offers",          requireAdmin, offerRoutes);
app.use("/api/admin/inventory",       requireAdmin, inventoryRoutes);
app.use("/api/admin/candies",         requireAdmin, candies);
app.use("/api/admin/stall-offers",    requireAdmin, stallOffersRoutes);
app.use("/api/admin/reports",         requireAdmin, reportRoutes);
app.use("/api/admin/combo-offer-rules",requireAdmin, comboOfferRules);
app.use("/api/admin/candy-lists",     requireAdmin, candyListsRoutes);
app.use("/api/admin/offer-lists",     requireAdmin, offerListsRouter);
app.use("/api/admin/categories",      requireAdmin, categoriesRouter);
app.use("/api/billing",               requireAdmin, billingRoutes);

/* ─── Static uploads ─── */
app.use("/uploads", express.static(path.join(process.cwd(),"uploads")));

/* ─── 404 ─── */
app.use((_req, res) => res.status(404).json({ error:"Route not found" }));

/* ─── Error handler ─── */
app.use((err, _req, res, _next) => {
  console.error("UNHANDLED:",err);
  res.status(500).json({ error:"Internal server error" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🍫 Vendi API on port ${PORT}`));
