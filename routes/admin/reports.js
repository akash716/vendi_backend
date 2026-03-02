import express from "express";
import { db } from "../../config/db.js";

const router = express.Router();

/* ===============================
   STALL SUMMARY
================================ */
router.get("/stall/summary", async (req, res) => {
  const { stall_id, start_date, end_date } = req.query;
  try {
    const [rows] = await db.query(`
      SELECT
        COUNT(DISTINCT s.id)                             AS total_bills,
        COALESCE(SUM(s.total), 0)                        AS total_revenue,
        ROUND(SUM(s.total) / COUNT(DISTINCT s.id), 2)   AS avg_bill
      FROM sales s
      WHERE s.stall_id = ?
        AND s.created_at BETWEEN ? AND DATE_ADD(?, INTERVAL 1 DAY)
    `, [stall_id, start_date, end_date]);
    res.json(rows[0]);
  } catch (err) {
    console.error("STALL SUMMARY ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ===============================
   STALL CANDY SALES
================================ */
router.get("/stall/candies", async (req, res) => {
  const { stall_id, start_date, end_date } = req.query;
  try {
    const [rows] = await db.query(`
      SELECT c.name, SUM(sif.qty) AS qty_sold
      FROM sales s
      JOIN sale_items si ON si.sale_id = s.id
      JOIN sale_item_flavours sif ON sif.sale_item_id = si.id
      JOIN candies c ON c.id = sif.candy_id
      WHERE s.stall_id = ?
        AND s.created_at BETWEEN ? AND DATE_ADD(?, INTERVAL 1 DAY)
      GROUP BY c.id, c.name
      ORDER BY qty_sold DESC
    `, [stall_id, start_date, end_date]);
    res.json(rows);
  } catch (err) {
    console.error("STALL CANDIES ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ===============================
   STALL COMBO SALES
================================ */
router.get("/stall/combos", async (req, res) => {
  const { stall_id, start_date, end_date } = req.query;
  try {
    const [rows] = await db.query(`
      SELECT
        COUNT(DISTINCT si.id) AS sold,
        si.price              AS combo_price
      FROM sales s
      JOIN sale_items si ON si.sale_id = s.id
      WHERE s.stall_id = ?
        AND si.type = 'COMBO'
        AND s.created_at BETWEEN ? AND DATE_ADD(?, INTERVAL 1 DAY)
      GROUP BY si.price
      ORDER BY sold DESC
    `, [stall_id, start_date, end_date]);
    res.json(rows);
  } catch (err) {
    console.error("STALL COMBOS ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ===============================
   STALL INVENTORY SNAPSHOT
================================ */
router.get("/stall/inventory", async (req, res) => {
  const { stall_id } = req.query;
  try {
    const [rows] = await db.query(`
      SELECT c.name, sci.stock
      FROM stall_candy_inventory sci
      JOIN candies c ON c.id = sci.candy_id
      WHERE sci.stall_id = ?
      ORDER BY c.name
    `, [stall_id]);
    res.json(rows);
  } catch (err) {
    console.error("INVENTORY ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ===============================
   OVERALL SUMMARY
================================ */
router.get("/overall/summary", async (req, res) => {
  const { start_date, end_date } = req.query;
  try {
    const [rows] = await db.query(`
      SELECT
        st.company,
        st.name                    AS stall_name,
        COUNT(DISTINCT s.id)       AS total_bills,
        COALESCE(SUM(s.total), 0)  AS total_revenue
      FROM sales s
      JOIN stalls st ON st.id = s.stall_id
      WHERE s.created_at BETWEEN ? AND DATE_ADD(?, INTERVAL 1 DAY)
        AND st.is_deleted = 0
      GROUP BY st.id, st.company, st.name
      ORDER BY total_revenue DESC
    `, [start_date, end_date]);
    res.json(rows);
  } catch (err) {
    console.error("OVERALL SUMMARY ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ===============================
   BILLS LIST
================================ */
router.get("/bills", async (req, res) => {
  const { start_date, end_date, stall_id } = req.query;
  try {
    let query = `
      SELECT
        s.id,
        st.name       AS stall,
        st.company,
        s.total,
        s.created_at
      FROM sales s
      JOIN stalls st ON st.id = s.stall_id
      WHERE s.created_at BETWEEN ? AND DATE_ADD(?, INTERVAL 1 DAY)
    `;
    const params = [start_date, end_date];
    if (stall_id) { query += " AND s.stall_id = ?"; params.push(stall_id); }
    query += " ORDER BY s.created_at DESC";
    const [rows] = await db.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error("BILLS LIST ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ===============================
   BILL DETAILS
================================ */
router.get("/bills/:billId", async (req, res) => {
  const { billId } = req.params;
  try {
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
    `, [billId]);

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
      display_price: co.display_price
    }));

    res.json([...comboItems, ...singleItems]);
  } catch (err) {
    console.error("BILL DETAIL ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ===============================
   ✅ DELETE BILL (VOID)
   Inventory restore + cascade delete
================================ */
router.delete("/bills/:billId", async (req, res) => {
  const { billId } = req.params;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Check sale exists
    const [[sale]] = await conn.query(
      `SELECT id, stall_id FROM sales WHERE id = ?`, [billId]
    );
    if (!sale) {
      await conn.rollback();
      return res.status(404).json({ error: "Bill not found" });
    }

    // Restore inventory
    const [flavours] = await conn.query(
      `SELECT sif.candy_id, sif.qty
       FROM sale_items si
       JOIN sale_item_flavours sif ON sif.sale_item_id = si.id
       WHERE si.sale_id = ?`, [billId]
    );
    for (const f of flavours) {
      await conn.query(
        `UPDATE stall_candy_inventory SET stock = stock + ?
         WHERE stall_id = ? AND candy_id = ?`,
        [f.qty, sale.stall_id, f.candy_id]
      );
    }

    // Cascade delete
    await conn.query(
      `DELETE sif FROM sale_item_flavours sif
       JOIN sale_items si ON si.id = sif.sale_item_id
       WHERE si.sale_id = ?`, [billId]
    );
    await conn.query(`DELETE FROM sale_items WHERE sale_id = ?`, [billId]);
    await conn.query(`DELETE FROM sales WHERE id = ?`, [billId]);

    await conn.commit();
    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    console.error("DELETE BILL ERROR:", err);
    res.status(500).json({ error: err.message || "Failed to delete bill" });
  } finally {
    conn.release();
  }
});

export default router;