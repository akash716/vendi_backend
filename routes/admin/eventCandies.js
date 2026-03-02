import express from "express";
import { db } from "../../config/db.js";

const router = express.Router();

/**
 * GET candies for event
 */
router.get("/:eventId", async (req, res) => {
  const [rows] = await db.query(`
    SELECT c.id, c.name, c.price,
      IF(ec.id IS NULL, 0, 1) AS enabled
    FROM candies c
    LEFT JOIN event_candies ec
      ON ec.candy_id = c.id
      AND ec.event_id = ?
  `, [req.params.eventId]);

  res.json(rows);
});

/**
 * SAVE event candies
 */
router.post("/", async (req, res) => {
  const { event_id, candy_ids } = req.body;

  // Clear previous
  await db.query("DELETE FROM event_candies WHERE event_id=?", [event_id]);

  // Insert new
  for (const candyId of candy_ids) {
    await db.query(
      "INSERT INTO event_candies (event_id, candy_id) VALUES (?,?)",
      [event_id, candyId]
    );
  }

  res.json({ success: true });
});

export default router;
