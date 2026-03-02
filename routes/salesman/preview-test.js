import express from "express";
import { applyOfferEngine } from "../../services/offerEngine.js";

const router = express.Router();

/**
 * PREVIEW OFFER (NO DB WRITE)
 * POST /api/salesman/preview
 */
router.post("/", async (req, res) => {
  const { lines } = req.body;

  if (!lines || !lines.length) {
    return res.json({ total: 0 });
  }

  try {
    const { total } = await applyOfferEngine({ lines });
    res.json({ total });
  } catch (err) {
    console.error("PREVIEW API ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
