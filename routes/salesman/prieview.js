import express from "express";
import { db } from "../../config/db.js";
import { applyOfferEngine } from "../../services/offerEngine.js";

const router = express.Router();

/**
 * POST /api/salesman/preview
 * ✅ FIX 1: offer_list_id directly stall se lo (event chain nahi)
 * ✅ FIX 2: offer_list_id null ho to sirf sum karo, sab offers mat apply karo
 */
router.post("/", async (req, res) => {
  const { lines, stallId } = req.body;

  if (!Array.isArray(lines) || lines.length === 0) {
    return res.json({ total: 0 });
  }

  try {
    let comboTotal = 0;
    const itemLines = [];
    const comboCandyIds = new Set();

    /* =========================
       LOAD OFFER LIST ID
       ✅ FIX: directly stall.offer_list_id
    ========================= */
    let offer_list_id = null;

    if (stallId) {
      const [[stall]] = await db.query(
        "SELECT offer_list_id FROM stalls WHERE id = ?",
        [stallId]
      );
      offer_list_id = stall?.offer_list_id || null;
    }

    /* =========================
       SPLIT COMBO & ITEM
    ========================= */
    for (const line of lines) {

      /* ===== COMBO ===== */
      if (line.type === "COMBO") {
        comboTotal += Number(line.price || 0);

        if (Array.isArray(line.items)) {
          for (const it of line.items) {
            if (it?.candy_id) {
              comboCandyIds.add(it.candy_id);
            }
          }
        }
        continue;
      }

      /* ===== ITEM ===== */
      if (line.type === "ITEM") {
        const it = line.items?.[0];
        if (!it?.candy_id) continue;

        if (!comboCandyIds.has(it.candy_id)) {
          itemLines.push(line);
        }
      }
    }

    /* =========================
       ITEM TOTAL VIA ENGINE
       ✅ FIX: offer_list_id null ho to
          engine ko call hi mat karo — 
          warna saare active rules apply ho jayenge
    ========================= */
    let itemTotal = 0;

    if (itemLines.length) {
      if (offer_list_id) {
        const result = await applyOfferEngine({
          lines: itemLines,
          offer_list_id
        });
        itemTotal = Number(result.total || 0);
      } else {
        // no offer list — plain sum
        itemTotal = itemLines.reduce(
          (s, line) => s + Number(line.price || 0),
          0
        );
      }
    }

    const total = comboTotal + itemTotal;
    res.json({ total });

  } catch (err) {
    console.error("PREVIEW ERROR:", err);
    res.status(500).json({ error: "Preview failed" });
  }
});

export default router;