import express from "express";
import { db } from "../../config/db.js";

const router = express.Router();

/* ── GET ALL ── */
router.get("/", async (_req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM candy_categories ORDER BY name ASC"
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── CREATE ── */
router.post("/", async (req, res) => {
  try {
    const { name, prefix } = req.body;
    if (!name?.trim() || !prefix?.trim()) {
      return res.status(400).json({ error: "Name and prefix required" });
    }

    const cleanName   = name.trim();
    const cleanPrefix = prefix.trim().toUpperCase();

    // duplicate check
    const [[dupName]] = await db.query(
      "SELECT id FROM candy_categories WHERE name = ?", [cleanName]
    );
    if (dupName) return res.status(400).json({ error: "Category name already exists" });

    const [[dupPrefix]] = await db.query(
      "SELECT id FROM candy_categories WHERE prefix = ?", [cleanPrefix]
    );
    if (dupPrefix) return res.status(400).json({ error: "Prefix already in use" });

    const [result] = await db.query(
      "INSERT INTO candy_categories (name, prefix) VALUES (?, ?)",
      [cleanName, cleanPrefix]
    );
    res.json({ success: true, id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── DELETE ── */
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // check if any candy uses this category
    const [[cat]] = await db.query(
      "SELECT name, prefix FROM candy_categories WHERE id = ?", [id]
    );
    if (!cat) return res.status(404).json({ error: "Category not found" });

    const [[usage]] = await db.query(
      "SELECT COUNT(*) AS c FROM candies WHERE category = ?", [cat.name]
    );
    if (usage.c > 0) {
      return res.status(400).json({
        error: `Cannot delete — ${usage.c} candies use this category`
      });
    }

    await db.query("DELETE FROM candy_categories WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
