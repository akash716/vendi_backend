// routes/salesman/config.js
import express from "express";
import { db } from "../../config/db.js";
const router = express.Router();

/**
 * GET /api/salesman/config/:stallId
 * NO images in this response — images fetched one by one via /api/salesman/image/:candyId
 */
router.get("/:stallId", async (req, res) => {
  const { stallId } = req.params;
  try {
    const [[stall]] = await db.query(
      `SELECT * FROM stalls WHERE id = ? AND is_active = 1 AND is_deleted = 0`,
      [stallId]
    );
    if (!stall) return res.status(404).json({ error: "Stall not found" });

    const candyListId = stall.candy_list_id;
    const offerListId = stall.offer_list_id;
    if (!candyListId) {
      return res.status(400).json({ error: "Candy list not assigned to stall" });
    }

    // NO image column here — avoids tmp table overflow
    const [candies] = await db.query(
      `SELECT
        c.id, c.code, c.name, cli.price,
        IFNULL(i.stock, 0) AS stock,
        COALESCE(
          NULLIF(c.category, ''),
          CASE
            WHEN c.code LIKE 'MC%' THEN 'Milk'
            WHEN c.code LIKE 'DC%' THEN 'Dark'
            WHEN c.code LIKE 'DG%' THEN 'Dragee'
            ELSE NULL
          END
        ) AS category
       FROM candy_list_items cli
       JOIN candies c ON c.id = cli.candy_id
       LEFT JOIN stall_candy_inventory i
         ON i.stall_id = ? AND i.candy_id = cli.candy_id
       WHERE cli.list_id = ?
       ORDER BY cli.price, c.code`,
      [stallId, candyListId]
    );

    const uniquePrices = [...new Set(candies.map(c => Number(c.price)))].sort((a, b) => a - b);

    let offers = [];
    if (offerListId) {
      const [rows] = await db.query(
        `SELECT id, unique_count, offer_price, price, price_pattern
         FROM combo_offer_rules
         WHERE offer_list_id = ? AND is_active = 1
         ORDER BY unique_count DESC`,
        [offerListId]
      );
      offers = rows.map(r => {
        if (r.price_pattern) {
          try { r.price_pattern = JSON.parse(r.price_pattern); }
          catch { r.price_pattern = []; }
        }
        return r;
      });
    }

    for (const offer of offers) {
      if (offer.price !== null) {
        const basePrice = Number(offer.price);
        let targetPrice = uniquePrices.find(p => p === basePrice);
        if (!targetPrice && uniquePrices.length) {
          targetPrice = uniquePrices.reduce((a, b) =>
            Math.abs(b - basePrice) < Math.abs(a - basePrice) ? b : a);
        }
        offer.candies = candies.filter(c => Number(c.price) === targetPrice);
      } else if (offer.price_pattern?.length) {
        const mappedPrices = offer.price_pattern.map(p => {
          const bp = Number(p.price);
          let match = uniquePrices.find(u => u === bp);
          if (!match && uniquePrices.length) {
            match = uniquePrices.reduce((a, b) =>
              Math.abs(b - bp) < Math.abs(a - bp) ? b : a);
          }
          return match;
        });
        offer.candies = candies.filter(c => mappedPrices.includes(Number(c.price)));
      } else {
        offer.candies = [];
      }
    }

    res.json({ stall, candies, offers });
  } catch (err) {
    console.error("SALESMAN CONFIG ERROR:", err);
    res.status(500).json({ error: "Failed to load salesman config" });
  }
});

/**
 * GET /api/salesman/config/image/:candyId
 * Returns only the image for one candy — called lazily by frontend
 */
router.get("/image/:candyId", async (req, res) => {
  try {
    const [[row]] = await db.query(
      "SELECT image FROM candies WHERE id = ?",
      [req.params.candyId]
    );
    res.json({ image: row?.image || null });
  } catch (err) {
    res.status(500).json({ image: null });
  }
});

export default router;
