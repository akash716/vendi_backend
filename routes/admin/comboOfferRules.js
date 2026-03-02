import express from "express";
import { db } from "../../config/db.js";

const router = express.Router();

/* =====================================================
   GET RULES (OPTIONAL OFFER LIST FILTER)
===================================================== */
router.get("/", async (req, res) => {
  try {
    const { offer_list_id } = req.query;

    let query = `
      SELECT *
      FROM combo_offer_rules
      WHERE 1=1
    `;

    const params = [];

    if (offer_list_id) {
      query += " AND offer_list_id = ?";
      params.push(offer_list_id);
    }

    query += " ORDER BY created_at DESC";

    const [rules] = await db.query(query, params);

    for (const r of rules) {
      if (r.price_pattern) {
        try {
          r.price_pattern = JSON.parse(r.price_pattern);
        } catch {
          r.price_pattern = [];
        }
      }
    }

    res.json({ success: true, rules });

  } catch (err) {
    console.error("GET RULES ERROR:", err);
    res.status(500).json({ error: "Failed to load rules" });
  }
});


/* =====================================================
   CREATE RULE
===================================================== */
router.post("/", async (req, res) => {
  const {
    offer_list_id,
    unique_count,
    offer_price,
    price,
    price_pattern,
    valid_from,
    valid_to
  } = req.body;

  if (!offer_list_id || !unique_count || !offer_price) {
    return res.status(400).json({ error: "Invalid payload" });
  }

  const isMixed =
    Array.isArray(price_pattern) && price_pattern.length > 0;

  if (!isMixed && (price === null || price === undefined)) {
    return res.status(400).json({
      error: "price required for same-price combo"
    });
  }

  if (isMixed) {
    const totalQty = price_pattern.reduce(
      (s, p) => s + Number(p.qty || 0),
      0
    );

    if (totalQty !== Number(unique_count)) {
      return res.status(400).json({
        error: "price_pattern qty must match unique_count"
      });
    }
  }

  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    const patternJson = isMixed
      ? JSON.stringify(price_pattern)
      : null;

    const [existing] = await conn.query(
      `
      SELECT id
      FROM combo_offer_rules
      WHERE offer_list_id = ?
        AND unique_count = ?
        AND (
          (price IS NOT NULL AND price = ?)
          OR
          (price IS NULL AND price_pattern = ?)
        )
        AND is_active = 1
      `,
      [offer_list_id, unique_count, price ?? null, patternJson]
    );

    if (existing.length) {
      await conn.rollback();
      return res.status(400).json({
        error: "Similar active rule already exists in this offer list"
      });
    }

    await conn.query(
      `
      INSERT INTO combo_offer_rules
      (offer_list_id, unique_count, offer_price, price, price_pattern, is_active, valid_from, valid_to)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)
      `,
      [
        offer_list_id,
        unique_count,
        offer_price,
        isMixed ? null : price,
        isMixed ? patternJson : null,
        valid_from || null,
        valid_to || null
      ]
    );

    await conn.commit();

    res.json({ success: true });

  } catch (err) {
    await conn.rollback();
    console.error("CREATE RULE ERROR:", err);
    res.status(500).json({ error: "Failed to create rule" });
  } finally {
    conn.release();
  }
});


/* =====================================================
   UPDATE RULE
===================================================== */
router.put("/:id", async (req, res) => {
  const id = req.params.id;

  const {
    offer_list_id,
    unique_count,
    offer_price,
    price,
    price_pattern,
    valid_from,
    valid_to
  } = req.body;

  if (!offer_list_id || !unique_count || !offer_price) {
    return res.status(400).json({ error: "Invalid payload" });
  }

  const isMixed =
    Array.isArray(price_pattern) && price_pattern.length > 0;

  const patternJson = isMixed
    ? JSON.stringify(price_pattern)
    : null;

  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    const [existing] = await conn.query(
      `
      SELECT id
      FROM combo_offer_rules
      WHERE offer_list_id = ?
        AND unique_count = ?
        AND id != ?
        AND (
          (price IS NOT NULL AND price = ?)
          OR
          (price IS NULL AND price_pattern = ?)
        )
        AND is_active = 1
      `,
      [offer_list_id, unique_count, id, price ?? null, patternJson]
    );

    if (existing.length) {
      await conn.rollback();
      return res.status(400).json({
        error: "Similar active rule already exists in this offer list"
      });
    }

    await conn.query(
      `
      UPDATE combo_offer_rules
      SET offer_list_id = ?,
          unique_count = ?,
          offer_price = ?,
          price = ?,
          price_pattern = ?,
          valid_from = ?,
          valid_to = ?
      WHERE id = ?
      `,
      [
        offer_list_id,
        unique_count,
        offer_price,
        isMixed ? null : price,
        isMixed ? patternJson : null,
        valid_from || null,
        valid_to || null,
        id
      ]
    );

    await conn.commit();

    res.json({ success: true });

  } catch (err) {
    await conn.rollback();
    console.error("UPDATE RULE ERROR:", err);
    res.status(500).json({ error: "Failed to update rule" });
  } finally {
    conn.release();
  }
});


/* =====================================================
   TOGGLE ACTIVE / INACTIVE
===================================================== */
router.patch("/:id/status", async (req, res) => {
  try {
    const { is_active } = req.body;

    await db.query(
      `UPDATE combo_offer_rules SET is_active = ? WHERE id = ?`,
      [is_active ? 1 : 0, req.params.id]
    );

    res.json({ success: true });

  } catch (err) {
    console.error("STATUS UPDATE ERROR:", err);
    res.status(500).json({ error: "Failed to update status" });
  }
});


/* =====================================================
   SOFT DELETE (is_active = 0)
   DELETE /api/admin/combo-offer-rules/:id
===================================================== */
router.delete("/:id", async (req, res) => {
  try {
    await db.query(
      `UPDATE combo_offer_rules SET is_active = 0 WHERE id = ?`,
      [req.params.id]
    );

    res.json({ success: true });

  } catch (err) {
    console.error("SOFT DELETE ERROR:", err);
    res.status(500).json({ error: "Failed to deactivate rule" });
  }
});


/* =====================================================
   ✅ PERMANENT DELETE
   DELETE /api/admin/combo-offer-rules/:id/permanent
===================================================== */
router.delete("/:id/permanent", async (req, res) => {
  try {
    const [result] = await db.query(
      `DELETE FROM combo_offer_rules WHERE id = ?`,
      [req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Rule not found" });
    }

    res.json({ success: true });

  } catch (err) {
    console.error("PERMANENT DELETE ERROR:", err);
    res.status(500).json({ error: "Failed to permanently delete rule" });
  }
});

export default router;