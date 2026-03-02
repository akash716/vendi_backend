import express from "express";
import { db } from "../../config/db.js";
import { applyOfferEngine } from "../../services/offerEngine.js";

const router = express.Router();

/**
 * POST /api/salesman/:stallId/sell
 * ✅ SERVER IS SOURCE OF TRUTH
 * ✅ OFFERS CALCULATED ON BACKEND
 * ✅ FIX: sale_items.type — ITEM → SINGLE (DB enum only has SINGLE/COMBO)
 * ✅ FIX: offer_list_id null ho to engine skip, plain sum karo
 */
router.post("/:stallId/sell", async (req, res) => {
  const { stallId } = req.params;
  const { lines } = req.body;

  if (!Array.isArray(lines) || lines.length === 0) {
    return res.status(400).json({ error: "Cart empty" });
  }

  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    /* =========================
       1️⃣ GET STALL OFFER LIST
    ========================= */
    const [[stall]] = await conn.query(
      `SELECT offer_list_id FROM stalls WHERE id = ?`,
      [stallId]
    );

    if (!stall) throw new Error("Stall not found");

    const offer_list_id = stall.offer_list_id;

    /* =========================
       2️⃣ APPLY OFFER ENGINE
       ✅ FIX: offer_list_id null ho to
          engine skip karo warna saare
          active rules apply ho jayenge
    ========================= */
    let total;

    if (offer_list_id) {
      const result = await applyOfferEngine({ lines, offer_list_id });
      total = result.total;
    } else {
      // no offer list — plain sum of all line prices
      total = lines.reduce((s, l) => s + Number(l.price || 0), 0);
    }

    if (isNaN(total) || total === undefined || total === null) {
      // Fallback: sum up all line prices directly
      total = lines.reduce((s, l) => s + Number(l.price || 0), 0);
    }
    if (isNaN(total)) throw new Error("Invalid total from offer engine");

    /* =========================
       3️⃣ CREATE SALE
    ========================= */
    const [saleRes] = await conn.query(
      `INSERT INTO sales (stall_id, total) VALUES (?, ?)`,
      [stallId, total]
    );

    const saleId = saleRes.insertId;

    /* =========================
       4️⃣ SAVE SALE ITEMS + INVENTORY
       ✅ FIX: type "ITEM" → "SINGLE"
          DB enum: SINGLE | COMBO
       ✅ FIX: COMBO mein jo candy_ids hain
          unki ITEM lines skip karo (double save nahi)
    ========================= */

    // COMBO lines mein jo candy_ids hain collect karo
    const comboCandyIds = new Set();
    for (const line of lines) {
      if (line.type === "COMBO") {
        for (const it of line.items || []) {
          if (it?.candy_id) comboCandyIds.add(Number(it.candy_id));
        }
      }
    }

    for (const line of lines) {

      // ✅ map frontend type to DB enum
      const dbType = line.type === "ITEM" ? "SINGLE" : "COMBO";

      // ✅ FIX: ITEM line jo already COMBO mein hai, skip karo
      if (line.type === "ITEM") {
        const it = line.items?.[0];
        if (it?.candy_id && comboCandyIds.has(Number(it.candy_id))) {
          continue; // ye candy combo mein save hogi, yahan mat karo
        }
      }

      const [itemRes] = await conn.query(
        `INSERT INTO sale_items (sale_id, type, price) VALUES (?, ?, ?)`,
        [saleId, dbType, Number(line.price || 0)]
      );

      const saleItemId = itemRes.insertId;

      for (const it of line.items || []) {
        const qty = Number(it.qty || 1);

        const [[row]] = await conn.query(
          `SELECT stock FROM stall_candy_inventory
           WHERE stall_id = ? AND candy_id = ? FOR UPDATE`,
          [stallId, it.candy_id]
        );

        if (!row || row.stock < qty) {
          throw new Error(`Out of stock for candy_id ${it.candy_id}`);
        }

        await conn.query(
          `UPDATE stall_candy_inventory SET stock = stock - ?
           WHERE stall_id = ? AND candy_id = ?`,
          [qty, stallId, it.candy_id]
        );

        await conn.query(
          `INSERT INTO sale_item_flavours (sale_item_id, candy_id, qty)
           VALUES (?, ?, ?)`,
          [saleItemId, it.candy_id, qty]
        );
      }
    }

    await conn.commit();
    res.json({ success: true, total });

  } catch (err) {
    await conn.rollback();
    console.error("SELL ERROR:", err.message);
    res.status(500).json({ error: err.message || "Checkout failed" });
  } finally {
    conn.release();
  }
});

export default router;