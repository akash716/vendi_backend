// routes/admin/stalls.js
import express from "express";
import { db } from "../../config/db.js";

const router = express.Router();

/* ---------------------------------------------------
   SPECIFIC: stall -> candies and other specific routes
   Note: you may still have separate files for stall-candies
   mounted under the same base path. Keep that behavior.
--------------------------------------------------- */

/**
 * GET all stalls
 */
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.query(
      `
      SELECT *
      FROM stalls
      WHERE is_deleted = 0
      ORDER BY created_at DESC
      `
    );

    res.json(rows);
  } catch (err) {
    console.error("GET STALLS ERROR:", err);
    res.status(500).json({ error: "Failed to load stalls" });
  }
});

/**
 * CREATE stall
 */
router.post("/", async (req, res) => {
  try {
    const { name, company, location, salesman_name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Stall name required" });
    }

    await db.query(
      "INSERT INTO stalls (name, company, location, salesman_name) VALUES (?,?,?,?)",
      [name.trim(), company || null, location || null, salesman_name || null]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("STALL CREATE ERROR:", err);
    res.status(500).json({ error: "Failed to create stall" });
  }
});

/**
 * ACTIVATE / DEACTIVATE stall
 */
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;

    await db.query(
      "UPDATE stalls SET is_active = ? WHERE id = ?",
      [is_active ? 1 : 0, id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("STALL UPDATE ERROR:", err);
    res.status(500).json({ error: "Failed to update stall" });
  }
});

/**
 * ARCHIVE (soft delete) stall
 */
router.put("/:id/archive", async (req, res) => {
  try {
    const { id } = req.params;

    await db.query(
      `
      UPDATE stalls
      SET is_deleted = 1, is_active = 0
      WHERE id = ?
      `,
      [id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("ARCHIVE STALL ERROR:", err);
    res.status(500).json({ error: "Failed to archive stall" });
  }
});

/**
 * PUT /api/admin/stalls/:id/lists
 * Assign candy_list_id and offer_list_id to a stall (nullable)
 * Body: { candy_list_id: number|null, offer_list_id: number|null }
 */
router.put("/:id/lists", async (req, res) => {
  try {
    const { id } = req.params;
    const { candy_list_id, offer_list_id } = req.body;

    // ensure stall exists
    const [[stall]] = await db.query(
      "SELECT id FROM stalls WHERE id = ?",
      [id]
    );

    if (!stall) {
      return res.status(404).json({ error: "Stall not found" });
    }

    await db.query(
      `UPDATE stalls
       SET candy_list_id = ?, offer_list_id = ?
       WHERE id = ?`,
      [candy_list_id || null, offer_list_id || null, id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("UPDATE STALL LISTS ERROR:", err);
    res.status(500).json({ error: "Failed to update stall lists", details: err.message });
  }
});

/**
 * PUT /api/admin/stalls/:id/salesman
 * Update salesman name for a stall
 */
router.put("/:id/salesman", async (req, res) => {
  try {
    const { id } = req.params;
    const { salesman_name } = req.body;

    await db.query(
      "UPDATE stalls SET salesman_name = ? WHERE id = ?",
      [salesman_name || null, id]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
