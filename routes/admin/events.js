import express from "express";
import { db } from "../../config/db.js";

const router = express.Router();

/* =====================================================
   GET ALL EVENTS
===================================================== */
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        e.*,
        cl.name AS candy_list_name,
        ol.name AS offer_list_name
      FROM events e
      LEFT JOIN candy_lists cl ON cl.id = e.candy_list_id
      LEFT JOIN offer_lists ol ON ol.id = e.offer_list_id
      ORDER BY e.id DESC
    `);

    res.json(rows);
  } catch (err) {
    console.error("GET EVENTS ERROR:", err);
    res.status(500).json({ error: "Failed to load events" });
  }
});


/* =====================================================
   CREATE EVENT
===================================================== */
router.post("/", async (req, res) => {
  try {
    const {
      name,
      start_date,
      end_date,
      candy_list_id,
      offer_list_id
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Event name required" });
    }

    await db.query(
      `
      INSERT INTO events 
      (name, start_date, end_date, candy_list_id, offer_list_id)
      VALUES (?,?,?,?,?)
      `,
      [
        name.trim(),
        start_date || null,
        end_date || null,
        candy_list_id || null,
        offer_list_id || null
      ]
    );

    res.json({ success: true });

  } catch (err) {
    console.error("CREATE EVENT ERROR:", err);
    res.status(500).json({ error: "Failed to create event" });
  }
});


/* =====================================================
   UPDATE EVENT (Lists or Dates)
===================================================== */
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      start_date,
      end_date,
      candy_list_id,
      offer_list_id
    } = req.body;

    await db.query(
      `
      UPDATE events
      SET name = ?,
          start_date = ?,
          end_date = ?,
          candy_list_id = ?,
          offer_list_id = ?
      WHERE id = ?
      `,
      [
        name,
        start_date || null,
        end_date || null,
        candy_list_id || null,
        offer_list_id || null,
        id
      ]
    );

    res.json({ success: true });

  } catch (err) {
    console.error("UPDATE EVENT ERROR:", err);
    res.status(500).json({ error: "Failed to update event" });
  }
});


/* =====================================================
   ASSIGN EVENT TO STALL
   (Standardized – No stall_events table)
===================================================== */
router.post("/assign", async (req, res) => {
  try {
    const { stall_id, event_id } = req.body;

    if (!stall_id || !event_id) {
      return res.status(400).json({
        error: "stall_id and event_id required"
      });
    }

    await db.query(
      `
      UPDATE stalls
      SET event_id = ?
      WHERE id = ?
      `,
      [event_id, stall_id]
    );

    res.json({ success: true });

  } catch (err) {
    console.error("ASSIGN EVENT ERROR:", err);
    res.status(500).json({ error: "Failed to assign event" });
  }
});


/* =====================================================
   DELETE EVENT
===================================================== */
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    await db.query(
      "DELETE FROM events WHERE id = ?",
      [id]
    );

    res.json({ success: true });

  } catch (err) {
    console.error("DELETE EVENT ERROR:", err);
    res.status(500).json({ error: "Failed to delete event" });
  }
});

export default router;
