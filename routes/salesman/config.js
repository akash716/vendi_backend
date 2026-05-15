// routes/salesman/config.js
import express from "express";
import { db } from "../../config/db.js";
const router = express.Router();

/**
 * GET /api/salesman/config/:stallId
 * Loads stall, assigned candy-list and offer-list, candies (from list) and offers (from offer list)
 * NOTE: image is fetched separately to avoid MySQL tmp table overflow with large base64 data
 */
router.get("/:stallId", async (req, res) => {
  const { stallId } = req.params;
  try {
    /* 1️⃣ STALL */
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

    /* 2️⃣ LOAD CANDIES — WITHOUT image column to avoid tmp table full error */
    const [candies] = await db.query(
      `
      SELECT
        c.id,
        c.code,
        c.name,
        cli.price,
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
        ON i.stall_id = ?
       AND i.candy_id = cli.candy_id
      WHERE cli.list_id = ?
      ORDER BY cli.price, c.code
      `,
      [stallId, candyListId]
    );

    /* 2b️⃣ FETCH IMAGES SEPARATELY (no JOIN/ORDER BY = no tmp table) */
    const candyIds = candies.map(c => c.id);
    let imageMap = {};
    if (candyIds.length > 0) {
      const [imgRows] = await db.query(
        "SELECT id, image FROM candies WHERE id IN (?)",
        [candyIds]
      );
      imgRows.forEach(r => { imageMap[r.id] = r.image; });
    }
    const candiesWithImages = candies.map(c => ({
      ...c,
      image: imageMap[c.id] || null,
    }));

    const uniquePrices = [...new Set(candiesWithImages.map(c => Number(c.price)))].sort((a, b) => a - b);

    /* 3️⃣ LOAD OFFERS */
    let offers = [];
    if (offerListId) {
      const [rows] = await db.query(
        `
        SELECT id, unique_count, offer_price, price, price_pattern
        FROM combo_offer_rules
        WHERE offer_list_id = ?
          AND is_active = 1
        ORDER BY unique_count DESC
        `,
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

    /* 4️⃣ ATTACH CANDIES TO OFFERS */
    for (const offer of offers) {
      if (offer.price !== null) {
        const basePrice = Number(offer.price);
        let targetPrice = uniquePrices.find(p => p === basePrice);
        if (!targetPrice && uniquePrices.length) {
          targetPrice = uniquePrices.reduce((closest, current) =>
            Math.abs(current - basePrice) < Math.abs(closest - basePrice) ? current : closest
          , uniquePrices[0]);
        }
        offer.candies = candiesWithImages.filter(c => Number(c.price) === targetPrice);
      } else if (offer.price_pattern?.length) {
        const mappedPrices = offer.price_pattern.map(p => {
          const basePrice = Number(p.price);
          let match = uniquePrices.find(u => u === basePrice);
          if (!match && uniquePrices.length) {
            match = uniquePrices.reduce((closest, current) =>
              Math.abs(current - basePrice) < Math.abs(closest - basePrice) ? current : closest
            , uniquePrices[0]);
          }
          return match;
        });
        offer.candies = candiesWithImages.filter(c => mappedPrices.includes(Number(c.price)));
      } else {
        offer.candies = [];
      }
    }

    res.json({ stall, candies: candiesWithImages, offers });
  } catch (err) {
    console.error("SALESMAN CONFIG ERROR:", err);
    res.status(500).json({ error: "Failed to load salesman config" });
  }
});

export default router;
