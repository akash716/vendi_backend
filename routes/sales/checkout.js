import express from "express";
import { db } from "../../config/db.js";
import { applyOfferEngine } from "../../services/offerEngine.js";

const router = express.Router();

router.post("/", async (req, res) => {
  const { stall_id, event_id, lines } = req.body;

  if (!lines || lines.length === 0) {
    return res.status(400).json({ error: "Cart is empty" });
  }

  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    /* ===============================
       1️⃣ GET STALL → OFFER LIST
    =============================== */
    const [[stall]] = await conn.query(
      `SELECT offer_list_id FROM stalls WHERE id=?`,
      [stall_id]
    );

    if (!stall) throw new Error("Stall not found");

    const offer_list_id = stall.offer_list_id;

    /* ===============================
       2️⃣ APPLY OFFER ENGINE (SERVER SIDE)
    =============================== */
    const { total } = await applyOfferEngine({
      lines,
      offer_list_id
    });

    /* ===============================
       3️⃣ CREATE SALE (SERVER TOTAL)
    =============================== */
    const [saleRes] = await conn.query(
      `INSERT INTO sales (stall_id, event_id, total)
       VALUES (?,?,?)`,
      [stall_id, event_id, total]
    );

    const saleId = saleRes.insertId;

    /* ===============================
       4️⃣ SAVE SALE ITEMS
    =============================== */
    for (const line of lines) {

      const saleItemPrice =
        line.type === "COMBO" ? 0 : line.price;

      const [lineRes] = await conn.query(
        `INSERT INTO sale_items (sale_id, type, offer_id, price)
         VALUES (?,?,?,?)`,
        [saleId, line.type, line.offer_id || null, saleItemPrice]
      );

      const saleItemId = lineRes.insertId;

      for (const it of line.items) {

        const [rows] = await conn.query(
          `SELECT stock FROM stall_candy_inventory
           WHERE stall_id=? AND candy_id=?
           FOR UPDATE`,
          [stall_id, it.candy_id]
        );

        if (!rows.length || rows[0].stock < it.qty) {
          throw new Error("Out of stock");
        }

        await conn.query(
          `UPDATE stall_candy_inventory
           SET stock = stock - ?
           WHERE stall_id=? AND candy_id=?`,
          [it.qty, stall_id, it.candy_id]
        );

        await conn.query(
          `INSERT INTO sale_item_flavours
           (sale_item_id, candy_id, qty)
           VALUES (?,?,?)`,
          [saleItemId, it.candy_id, it.qty]
        );
      }
    }

    await conn.commit();
    conn.release();

    res.json({
      success: true,
      sale_id: saleId,
      total
    });

  } catch (err) {
    await conn.rollback();
    conn.release();
    res.status(500).json({ error: err.message });
  }
});

export default router;
