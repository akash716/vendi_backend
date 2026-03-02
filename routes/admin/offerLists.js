import express from "express";
import { db } from "../../config/db.js";

const router = express.Router();

/* =====================================================
   GET ALL OFFER LISTS
===================================================== */
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT *
      FROM offer_lists
      ORDER BY id DESC
    `);

    res.json(rows);

  } catch (err) {
    console.error("GET OFFER LISTS ERROR:", err);
    res.status(500).json({ error: "Failed to load offer lists" });
  }
});


/* =====================================================
   GET SINGLE OFFER LIST (WITH RULES)
===================================================== */
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const [[list]] = await db.query(
      "SELECT * FROM offer_lists WHERE id = ?",
      [id]
    );

    if (!list) {
      return res.status(404).json({ error: "Offer list not found" });
    }

    const [rules] = await db.query(
      `
      SELECT *
      FROM combo_offer_rules
      WHERE offer_list_id = ?
      ORDER BY created_at DESC
      `,
      [id]
    );

    for (const rule of rules) {
      if (rule.price_pattern) {
        try {
          rule.price_pattern = JSON.parse(rule.price_pattern);
        } catch {
          rule.price_pattern = [];
        }
      }
    }

    res.json({ list, rules });

  } catch (err) {
    console.error("GET OFFER LIST ERROR:", err);
    res.status(500).json({ error: "Failed to load offer list" });
  }
});


/* =====================================================
   CREATE OFFER LIST
===================================================== */
router.post("/", async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Name required" });
    }

    const [result] = await db.query(
      "INSERT INTO offer_lists (name) VALUES (?)",
      [name.trim()]
    );

    res.json({ id: result.insertId });

  } catch (err) {
    console.error("CREATE OFFER LIST ERROR:", err);
    res.status(500).json({ error: "Failed to create offer list" });
  }
});


/* =====================================================
   RENAME OFFER LIST
===================================================== */
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Name required" });
    }

    await db.query(
      "UPDATE offer_lists SET name = ? WHERE id = ?",
      [name.trim(), id]
    );

    res.json({ success: true });

  } catch (err) {
    console.error("RENAME OFFER LIST ERROR:", err);
    res.status(500).json({ error: "Failed to rename offer list" });
  }
});


/* =====================================================
   SAFE DELETE OFFER LIST
===================================================== */
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // 🔥 Check if assigned to any stall
    const [used] = await db.query(
      "SELECT id FROM stalls WHERE offer_list_id = ? LIMIT 1",
      [id]
    );

    if (used.length > 0) {
      return res.status(400).json({
        error: "Cannot delete. Offer list is assigned to a stall."
      });
    }

    // Soft delete rules (keep history)
    await db.query(
      "UPDATE combo_offer_rules SET is_active = 0 WHERE offer_list_id = ?",
      [id]
    );

    await db.query(
      "DELETE FROM offer_lists WHERE id = ?",
      [id]
    );

    res.json({ success: true });

  } catch (err) {
    console.error("DELETE OFFER LIST ERROR:", err);
    res.status(500).json({ error: "Failed to delete offer list" });
  }
});

export default router;
