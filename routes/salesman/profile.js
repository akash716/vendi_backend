import express from "express";
import { db } from "../../config/db.js";

const router = express.Router();

/**
 * GET /api/salesman/:stallId/profile
 * Salesman ki profile + today's sales + all-time stats + recent bills
 */
router.get("/:stallId/profile", async (req, res) => {
  const { stallId } = req.params;

  try {
    /* 1. Stall details */
    const [[stall]] = await db.query(
      `SELECT id, name, company, location, salesman_name, created_at
       FROM stalls WHERE id = ? AND is_deleted = 0`,
      [stallId]
    );
    if (!stall) return res.status(404).json({ error: "Stall not found" });

    /* 2. Today's sales (IST — UTC+5:30) */
    const [[today]] = await db.query(`
      SELECT
        COUNT(*)        AS bills_today,
        COALESCE(SUM(total), 0) AS revenue_today
      FROM sales
      WHERE stall_id = ?
        AND DATE(CONVERT_TZ(created_at, '+00:00', '+05:30')) = DATE(CONVERT_TZ(NOW(), '+00:00', '+05:30'))
    `, [stallId]);

    /* 3. All-time stats */
    const [[allTime]] = await db.query(`
      SELECT
        COUNT(*)        AS total_bills,
        COALESCE(SUM(total), 0) AS total_revenue
      FROM sales
      WHERE stall_id = ?
    `, [stallId]);

    /* 4. All bills (no limit) */
    const [recentBills] = await db.query(`
      SELECT id, total, created_at
      FROM sales
      WHERE stall_id = ?
      ORDER BY created_at DESC
    `, [stallId]);

    res.json({
      stall,
      today: {
        bills:   Number(today.bills_today),
        revenue: Number(today.revenue_today)
      },
      allTime: {
        bills:   Number(allTime.total_bills),
        revenue: Number(allTime.total_revenue)
      },
      recentBills
    });

  } catch (err) {
    console.error("PROFILE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/salesman/:stallId/sale/:saleId
 * Salesman can void a sale + restore inventory
 */
router.delete("/:stallId/sale/:saleId", async (req, res) => {
  const { stallId, saleId } = req.params;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    /* verify sale belongs to this stall */
    const [[sale]] = await conn.query(
      "SELECT id FROM sales WHERE id = ? AND stall_id = ?",
      [saleId, stallId]
    );
    if (!sale) {
      await conn.rollback();
      return res.status(404).json({ error: "Sale not found" });
    }

    /* restore inventory */
    const [flavours] = await conn.query(`
      SELECT sif.candy_id, SUM(sif.qty) AS qty
      FROM sale_item_flavours sif
      JOIN sale_items si ON si.id = sif.sale_item_id
      WHERE si.sale_id = ?
      GROUP BY sif.candy_id
    `, [saleId]);

    for (const f of flavours) {
      await conn.query(
        `UPDATE stall_candy_inventory
         SET stock = stock + ?
         WHERE stall_id = ? AND candy_id = ?`,
        [f.qty, stallId, f.candy_id]
      );
    }

    /* delete sale records */
    await conn.query(`
      DELETE sif FROM sale_item_flavours sif
      JOIN sale_items si ON si.id = sif.sale_item_id
      WHERE si.sale_id = ?
    `, [saleId]);

    await conn.query("DELETE FROM sale_items WHERE sale_id = ?", [saleId]);
    await conn.query("DELETE FROM sales WHERE id = ?", [saleId]);

    await conn.commit();
    res.json({ success: true });

  } catch (err) {
    await conn.rollback();
    console.error("SALE DELETE ERROR:", err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

/**
 * GET /api/salesman/:stallId/sale/:saleId/items
 * Bill ke andar kaunse products hain — eye button ke liye
 */
router.get("/:stallId/sale/:saleId/items", async (req, res) => {
  const { stallId, saleId } = req.params;
  try {
    /* Verify sale belongs to this stall */
    const [[sale]] = await db.query(
      "SELECT id FROM sales WHERE id = ? AND stall_id = ?",
      [saleId, stallId]
    );
    if (!sale) return res.status(404).json({ error: "Sale not found" });

    const [rows] = await db.query(`
      SELECT
        si.id         AS sale_item_id,
        si.type,
        si.price      AS display_price,
        c.name        AS candy_name,
        sif.qty
      FROM sale_items si
      LEFT JOIN sale_item_flavours sif ON sif.sale_item_id = si.id
      LEFT JOIN candies c ON c.id = sif.candy_id
      WHERE si.sale_id = ?
      ORDER BY si.id, sif.id
    `, [saleId]);

    /* Group combos together */
    const comboMap = {};
    const singleItems = [];

    for (const r of rows) {
      const type = (r.type || "").toUpperCase();
      if (type === "COMBO") {
        if (!comboMap[r.sale_item_id]) {
          comboMap[r.sale_item_id] = { type: "COMBO", display_price: r.display_price, candies: [] };
        }
        if (r.candy_name) comboMap[r.sale_item_id].candies.push({ name: r.candy_name, qty: r.qty });
      } else {
        if (r.candy_name) {
          singleItems.push({ type: "SINGLE", candy_name: r.candy_name, qty: r.qty || 1, display_price: r.display_price });
        }
      }
    }

    const comboItems = Object.values(comboMap).map(co => ({
      type: "COMBO",
      candy_name: co.candies.map(c => `${c.name}${c.qty > 1 ? ` ×${c.qty}` : ""}`).join(", "),
      qty: 1,
      display_price: co.display_price,
    }));

    res.json([...comboItems, ...singleItems]);
  } catch (err) {
    console.error("BILL ITEMS ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
