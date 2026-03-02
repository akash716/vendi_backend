import express from "express";
import { db } from "../../config/db.js";

const router = express.Router();

/* ======================================================
   GET INVENTORY (STALL BASED)
====================================================== */
router.get("/:stallId", async (req, res) => {
  try {
    const { stallId } = req.params;

    const [[stall]] = await db.query(
      `
      SELECT candy_list_id
      FROM stalls
      WHERE id = ?
      `,
      [stallId]
    );

    if (!stall || !stall.candy_list_id) {
      return res.json([]);
    }

    const [items] = await db.query(
      `
      SELECT 
        c.id AS candy_id,
        c.name,
        cli.price,
        IFNULL(i.stock, 0) AS stock
      FROM candy_list_items cli
      JOIN candies c ON c.id = cli.candy_id
      LEFT JOIN stall_candy_inventory i
        ON i.stall_id = ?
       AND i.candy_id = cli.candy_id
      WHERE cli.list_id = ?
      ORDER BY cli.price, c.name
      `,
      [stallId, stall.candy_list_id]
    );

    res.json(items);

  } catch (err) {
    console.error("GET INVENTORY ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ======================================================
   BULK UPDATE INVENTORY
====================================================== */
router.post("/:stallId/bulk", async (req, res) => {
  const connection = await db.getConnection();

  try {
    const { stallId } = req.params;
    const { items } = req.body;

    if (!Array.isArray(items)) {
      return res.status(400).json({ error: "Invalid payload" });
    }

    await connection.beginTransaction();

    for (const item of items) {
      const candyId = Number(item.candyId);
      const stock = Number(item.stock);

      if (isNaN(stock) || stock < 0) continue;

      await connection.query(
        `
        INSERT INTO stall_candy_inventory (stall_id, candy_id, stock)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE stock = VALUES(stock)
        `,
        [stallId, candyId, stock]
      );
    }

    await connection.commit();

    res.json({ success: true });

  } catch (err) {
    await connection.rollback();
    res.status(500).json({ error: "Inventory save failed" });
  } finally {
    connection.release();
  }
});

export default router;
