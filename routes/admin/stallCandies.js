// routes/admin/stallCandies.js
import express from "express";
import { db } from "../../config/db.js";

const router = express.Router();

/**
 * GET all candies + assigned candies for a stall
 */
router.get("/:stallId/candies", async (req, res) => {
  try {
    const { stallId } = req.params;

    const [allCandies] = await db.query(
      "SELECT id, name, price FROM candies ORDER BY name"
    );

    const [assigned] = await db.query(
      "SELECT candy_id FROM stall_candies WHERE stall_id = ?",
      [stallId]
    );

    res.json({
      allCandies,
      assignedCandyIds: assigned.map(a => a.candy_id),
    });
  } catch (err) {
    console.error("STALL CANDIES GET ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * ASSIGN candies to stall
 * ALSO AUTO-CREATE INVENTORY ROWS
 */
router.post("/:stallId/candies", async (req, res) => {
  try {
    const { stallId } = req.params;
    const { candyIds } = req.body;

    if (!Array.isArray(candyIds)) {
      return res.status(400).json({ error: "candyIds must be an array" });
    }

    // Remove old mappings
    await db.query(
      "DELETE FROM stall_candies WHERE stall_id = ?",
      [stallId]
    );

    // Insert new mappings + inventory rows
    for (const candyId of candyIds) {
      // mapping
      await db.query(
        "INSERT INTO stall_candies (stall_id, candy_id) VALUES (?, ?)",
        [stallId, candyId]
      );

      // inventory row (auto-create if missing)
      await db.query(
        `
        INSERT INTO stall_candy_inventory (stall_id, candy_id, stock)
        VALUES (?, ?, 0)
        ON DUPLICATE KEY UPDATE stock = stock
        `,
        [stallId, candyId]
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error("STALL CANDIES SAVE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
