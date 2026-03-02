import express from "express";
import { db } from "../../config/db.js";
import { encryptStallToken, decryptStallToken } from "../../services/auth.js";
import { requireAdmin } from "../../middleware/authMiddleware.js";

const router = express.Router();

/* Admin: generate encrypted token for a stall — requires JWT */
router.get("/:stallId", requireAdmin, async (req, res) => {
  try {
    const stallId = Number(req.params.stallId);
    const [[stall]] = await db.query(
      "SELECT id, name FROM stalls WHERE id = ? AND is_deleted = 0", [stallId]
    );
    if (!stall) return res.status(404).json({ error: "Stall not found" });
    const token = encryptStallToken(stallId);
    res.json({ token, url: `/salesman/${token}`, stallId: stall.id, stallName: stall.name });
  } catch(err) {
    console.error("STALL TOKEN:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* Public: resolve token → stallId (no auth needed — salesman uses this) */
router.get("/resolve/:token", async (req, res) => {
  try {
    const data = decryptStallToken(req.params.token);
    if (!data) return res.status(401).json({ error: "Invalid or expired stall link" });

    const [[stall]] = await db.query(
      "SELECT id, name, is_active FROM stalls WHERE id = ? AND is_deleted = 0", [data.stallId]
    );
    if (!stall)           return res.status(404).json({ error: "Stall not found" });
    if (!stall.is_active) return res.status(403).json({ error: "This stall is currently inactive" });

    res.json({ stallId: stall.id, stallName: stall.name });
  } catch(err) {
    console.error("RESOLVE TOKEN:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
