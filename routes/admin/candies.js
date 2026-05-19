import express from "express";
import multer  from "multer";
import { db }  from "../../config/db.js";
import { v2 as cloudinary } from "cloudinary";

// Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const router  = express.Router();

// multer — memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 5 * 1024 * 1024 }, // 5MB max
});

/* ── GET ALL CANDIES ── */
router.get("/", async (_req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        id, code, name, price, image,
        COALESCE(
          NULLIF(category, ''),
          CASE
            WHEN code LIKE 'MC%' THEN 'Milk'
            WHEN code LIKE 'DC%' THEN 'Dark'
            WHEN code LIKE 'DG%' THEN 'Dragee'
            ELSE NULL
          END
        ) AS category
      FROM candies
      ORDER BY category, name
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── CREATE CANDY ── */
router.post("/", async (req, res) => {
  try {
    const { name, category, price } = req.body;
    if (!name?.trim() || !price || !category?.trim()) {
      return res.status(400).json({ error: "Name, category & price required" });
    }
    const [[cat]] = await db.query(
      "SELECT prefix FROM candy_categories WHERE name = ?",
      [category.trim()]
    );
    if (!cat) return res.status(400).json({ error: "Invalid category" });
    const [[row]] = await db.query(
      "SELECT COUNT(*) AS c FROM candies WHERE code LIKE ?",
      [`${cat.prefix}%`]
    );
    const code = `${cat.prefix}${row.c + 1}`;
    const [result] = await db.query(
      "INSERT INTO candies (code, name, price, category) VALUES (?, ?, ?, ?)",
      [code, name.trim(), price, category.trim()]
    );
    res.json({ success: true, id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── UPDATE CANDY ── */
router.put("/:id", async (req, res) => {
  const { name, category, price } = req.body;
  if (!name || !price || !category) {
    return res.status(400).json({ error: "Invalid payload" });
  }
  try {
    await db.query(
      "UPDATE candies SET name=?, price=?, category=? WHERE id=?",
      [name, price, category, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── IMAGE UPLOAD — Cloudinary ── */
router.post("/:id/image", upload.single("image"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Image required" });
  try {
    const mime    = req.file.mimetype;
    const b64     = req.file.buffer.toString("base64");
    const dataUrl = `data:${mime};base64,${b64}`;

    // Cloudinary pe upload karo
    const result = await cloudinary.uploader.upload(dataUrl, {
      folder:    "vendi_candies",
      public_id: `candy_${req.params.id}`,
      overwrite: true,
    });

    // Sirf URL save karo DB mein
    await db.query(
      "UPDATE candies SET image=? WHERE id=?",
      [result.secure_url, req.params.id]
    );

    res.json({ success: true, image: result.secure_url });
  } catch (err) {
    console.error("CLOUDINARY UPLOAD ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ── DELETE CANDY ── */
router.delete("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [[inList]] = await db.query(
      "SELECT id FROM candy_list_items WHERE candy_id = ? LIMIT 1", [id]
    );
    if (inList) {
      return res.status(409).json({
        error: "Candy is assigned to one or more candy lists. Remove it from all lists first."
      });
    }

    // Cloudinary se bhi delete karo
    try {
      await cloudinary.uploader.destroy(`vendi_candies/candy_${id}`);
    } catch (e) {
      console.warn("Cloudinary delete failed:", e.message);
    }

    await db.query("DELETE FROM stall_candy_inventory WHERE candy_id=?", [id]);
    await db.query("DELETE FROM combo_offer_rule_candies WHERE candy_id=?", [id]);
    await db.query("DELETE FROM candies WHERE id=?", [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
