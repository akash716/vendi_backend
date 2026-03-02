import express from "express";
import multer from "multer";
import path from "path";
import { db } from "../../config/db.js";

const router = express.Router();

/* ── MULTER ── */
const storage = multer.diskStorage({
  destination: "uploads/candies",
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + ext);
  }
});
const upload = multer({ storage });

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

    // get category prefix from DB
    const [[cat]] = await db.query(
      "SELECT prefix FROM candy_categories WHERE name = ?",
      [category.trim()]
    );

    if (!cat) {
      return res.status(400).json({ error: "Invalid category" });
    }

    const prefix = cat.prefix;

    // auto-generate code: PREFIX + next number
    const [[row]] = await db.query(
      "SELECT COUNT(*) AS c FROM candies WHERE code LIKE ?",
      [`${prefix}%`]
    );
    const code = `${prefix}${row.c + 1}`;

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

/* ── IMAGE UPLOAD ── */
router.post("/:id/image", upload.single("image"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Image required" });
  }
  const imagePath = `/uploads/candies/${req.file.filename}`;
  await db.query("UPDATE candies SET image=? WHERE id=?", [imagePath, req.params.id]);
  res.json({ success: true, image: imagePath });
});

export default router;

/* ── DELETE CANDY ── */
router.delete("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    // Check if candy is in any candy list
    const [[inList]] = await db.query(
      "SELECT id FROM candy_list_items WHERE candy_id = ? LIMIT 1", [id]
    );
    if (inList) {
      return res.status(409).json({
        error: "Candy is assigned to one or more candy lists. Remove it from all lists first."
      });
    }

    // Delete dependent rows then candy
    await db.query("DELETE FROM stall_candy_inventory WHERE candy_id=?", [id]);
    await db.query("DELETE FROM combo_offer_rule_candies WHERE candy_id=?", [id]);
    await db.query("DELETE FROM candies WHERE id=?", [id]);

    res.json({ success: true });
  } catch (err) {
    console.error("DELETE CANDY:", err);
    res.status(500).json({ error: err.message });
  }
});
