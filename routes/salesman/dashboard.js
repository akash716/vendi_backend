import express from "express";
import { db } from "../../config/db.js";

const router = express.Router();

/**
 * GET candies available for sale (stock > 0)
 */
router.get("/:stallId/candies", async (req, res) => {
  try {
    const { stallId } = req.params;

    const [rows] = await db.query(`
      SELECT 
        c.id AS candy_id,
        c.name,
        c.price,
        i.stock
      FROM stall_candies sc
      JOIN candies c ON c.id = sc.candy_id
      JOIN stall_candy_inventory i
        ON i.stall_id = sc.stall_id AND i.candy_id = sc.candy_id
      WHERE sc.stall_id = ?
        AND i.stock > 0
      ORDER BY c.name
    `, [stallId]);

    res.json(rows);
  } catch (err) {
    console.error("SALESMAN CANDIES ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * SELL candy (reduce stock)
 */
router.post("/:stallId/sell", async (req, res) => {
  try {
    const { stallId } = req.params;
    const { candyId, qty } = req.body;

    const [[row]] = await db.query(
      "SELECT stock FROM stall_candy_inventory WHERE stall_id = ? AND candy_id = ?",
      [stallId, candyId]
    );

    if (!row || row.stock < qty) {
      return res.status(400).json({ error: "Insufficient stock" });
    }

    await db.query(
      "UPDATE stall_candy_inventory SET stock = stock - ? WHERE stall_id = ? AND candy_id = ?",
      [qty, stallId, candyId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("SALE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
