// services/offerEngine.js
import { db } from "../config/db.js";

export async function applyOfferEngine({ lines, offer_list_id, debug = false }) {

  if (debug) console.log("====== OFFER ENGINE START ======");

  /* =========================
     ✅ FIX: offer_list_id null ho to
        engine ko saare active rules
        apply nahi karne chahiye —
        sirf normal sum return karo
  ========================= */
  if (!offer_list_id) {
    const units = buildUnits(lines);
    const total = units.reduce((s, u) => s + u.price, 0);
    return { lines, total, appliedOffers: [] };
  }

  /* =========================
     1️⃣ BUILD UNIT LIST
  ========================= */
  const units = buildUnits(lines);

  if (debug) console.log("UNITS BUILT:", units);

  if (!units.length) {
    return { lines, total: 0, appliedOffers: [] };
  }

  const normalTotal = units.reduce((s, u) => s + u.price, 0);

  /* =========================
     2️⃣ LOAD OFFERS — scoped to offer_list_id
  ========================= */
  const [offersRaw] = await db.query(
    `SELECT * FROM combo_offer_rules
     WHERE is_active = 1 AND offer_list_id = ?`,
    [offer_list_id]
  );

  if (!offersRaw.length) {
    if (debug) console.log("NO OFFERS FOUND");
    return { lines, total: normalTotal, appliedOffers: [] };
  }

  /* =========================
     3️⃣ FILTER BY DATE
  ========================= */
  const now = new Date();

  let offers = offersRaw.filter(o => {
    if (o.valid_from && new Date(o.valid_from) > now) return false;
    if (o.valid_to && new Date(o.valid_to) < now) return false;
    return true;
  });

  if (!offers.length) {
    if (debug) console.log("NO VALID OFFERS BY DATE");
    return { lines, total: normalTotal, appliedOffers: [] };
  }

  /* =========================
     4️⃣ NORMALIZE JSON FIELDS
  ========================= */
  offers = offers.map(o => {
    const copy = { ...o };

    if (copy.required_candies && typeof copy.required_candies === "string") {
      try { copy.required_candies = JSON.parse(copy.required_candies); }
      catch { copy.required_candies = null; }
    }

    if (copy.price_pattern && typeof copy.price_pattern === "string") {
      try { copy.price_pattern = JSON.parse(copy.price_pattern); }
      catch { copy.price_pattern = null; }
    }

    return copy;
  });

  /* =========================
     5️⃣ SORT OFFERS
     unique_count DESC → sabse bada combo pehle try karo
  ========================= */
  offers.sort((a, b) => {
    if (Number(b.unique_count) !== Number(a.unique_count)) {
      return Number(b.unique_count) - Number(a.unique_count);
    }
    return Number(b.priority || 0) - Number(a.priority || 0);
  });

  if (debug) {
    console.log("OFFERS:", offers.map(o => ({
      id: o.id,
      unique_count: o.unique_count,
      offer_price: o.offer_price
    })));
  }

  /* =========================
     6️⃣ APPLY OFFERS
  ========================= */
  let remaining = [...units];
  let totalOfferAmount = 0;
  const appliedOffers = [];

  for (const offer of offers) {

    let keepApplying = true;

    while (keepApplying) {
      const result = tryApplyOffer(remaining, offer);

      if (!result.matched) {
        keepApplying = false;
      } else {
        remaining = result.remaining;
        totalOfferAmount += Number(offer.offer_price);

        appliedOffers.push({
          offer_id: offer.id,
          offer_price: Number(offer.offer_price)
        });

        if (debug) {
          console.log("APPLIED OFFER:", offer.id);
          console.log("REMAINING:", remaining);
        }
      }
    }
  }

  /* =========================
     7️⃣ ADD REMAINING ITEMS
  ========================= */
  const remainingTotal = remaining.reduce((s, u) => s + u.price, 0);
  const finalTotal = totalOfferAmount + remainingTotal;

  if (debug) {
    console.log("FINAL TOTAL:", finalTotal);
    console.log("====== OFFER ENGINE END ======");
  }

  return { lines, total: finalTotal, appliedOffers };
}


/* ===================================================
   HELPER: units build karo lines se
=================================================== */
function buildUnits(lines) {
  const units = [];

  for (const line of (lines || [])) {
    if (!Array.isArray(line.items)) continue;

    for (const item of line.items) {
      const qty = Number(item.qty || 1);

      // price: use item.price if valid, fallback to line.price (COMBO lines may not have item.price)
      let price = Number(item.price);
      if (isNaN(price)) price = Number(line.price) || 0;

      for (let i = 0; i < qty; i++) {
        units.push({
          candy_id: Number(item.candy_id),
          price
        });
      }
    }
  }

  return units;
}


/* ===================================================
   MATCH FUNCTION
=================================================== */
function tryApplyOffer(units, offer) {

  if (!Array.isArray(units) || units.length === 0) {
    return { matched: false };
  }

  const required = offer.required_candies;
  const price = offer.price != null ? Number(offer.price) : null;
  const pricePattern = offer.price_pattern;

  /* =========================
     1️⃣ LIST BASED (specific candy IDs)
  ========================= */
  if (required && Array.isArray(required) && required.length) {

    const countMap = {};
    units.forEach(u => {
      countMap[u.candy_id] = (countMap[u.candy_id] || 0) + 1;
    });

    const sumReq = required.reduce((s, r) => s + Number(r.qty || 0), 0);

    if (Number(offer.unique_count) !== sumReq) {
      return { matched: false };
    }

    for (const r of required) {
      if ((countMap[Number(r.candy_id)] || 0) < Number(r.qty)) {
        return { matched: false };
      }
    }

    const remaining = [...units];

    for (const r of required) {
      let remove = Number(r.qty);
      for (let i = remaining.length - 1; i >= 0 && remove > 0; i--) {
        if (remaining[i].candy_id === Number(r.candy_id)) {
          remaining.splice(i, 1);
          remove--;
        }
      }
    }

    return { matched: true, remaining };
  }

  /* =========================
     2️⃣ SAME PRICE
  ========================= */
  if (price !== null) {

    const priceCount = {};
    units.forEach(u => {
      priceCount[u.price] = (priceCount[u.price] || 0) + 1;
    });

    if ((priceCount[price] || 0) < Number(offer.unique_count)) {
      return { matched: false };
    }

    const remaining = [...units];
    let remove = Number(offer.unique_count);

    for (let i = remaining.length - 1; i >= 0 && remove > 0; i--) {
      if (remaining[i].price === price) {
        remaining.splice(i, 1);
        remove--;
      }
    }

    return { matched: true, remaining };
  }

  /* =========================
     3️⃣ MIXED PRICE
  ========================= */
  if (pricePattern && Array.isArray(pricePattern)) {

    const needed = pricePattern.reduce((s, p) => s + Number(p.qty || 0), 0);

    if (Number(offer.unique_count) !== needed) {
      return { matched: false };
    }

    const priceCount = {};
    units.forEach(u => {
      priceCount[u.price] = (priceCount[u.price] || 0) + 1;
    });

    for (const p of pricePattern) {
      if ((priceCount[Number(p.price)] || 0) < Number(p.qty)) {
        return { matched: false };
      }
    }

    const remaining = [...units];

    for (const p of pricePattern) {
      let remove = Number(p.qty);
      for (let i = remaining.length - 1; i >= 0 && remove > 0; i--) {
        if (remaining[i].price === Number(p.price)) {
          remaining.splice(i, 1);
          remove--;
        }
      }
    }

    return { matched: true, remaining };
  }

  return { matched: false };
}