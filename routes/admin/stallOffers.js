// routes/admin/stallOffers.js
import express from "express";
import { db } from "../../config/db.js";

const router = express.Router();

/**
 * GET assigned offers for a stall
 * Returns array of { offer_id }
 */
router.get("/:stallId", async (req, res) => {
  try {
    const { stallId } = req.params;

    const [rows] = await db.query(
      "SELECT offer_id FROM stall_combo_offers WHERE stall_id = ?",
      [stallId]
    );

    res.json(rows);
  } catch (err) {
    console.error("GET STALL OFFERS ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * ASSIGN offers to stall
 * Body: { offerIds: [] }
 */
router.post("/:stallId", async (req, res) => {
  try {
    const { stallId } = req.params;
    const { offerIds } = req.body;

    if (!Array.isArray(offerIds)) {
      return res.status(400).json({ error: "offerIds must be an array" });
    }

    // Remove old assignments
    await db.query(
      "DELETE FROM stall_combo_offers WHERE stall_id = ?",
      [stallId]
    );

    // Insert new assignments
    for (const offerId of offerIds) {
      await db.query(
        "INSERT INTO stall_combo_offers (stall_id, offer_id) VALUES (?, ?)",
        [stallId, offerId]
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error("SAVE STALL OFFERS ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
