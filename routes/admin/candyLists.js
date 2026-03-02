import express from "express";
import { db } from "../../config/db.js";

const router = express.Router();

/* =========================
   GET ALL LISTS
========================= */
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM candy_lists ORDER BY id DESC"
    );
    res.json(rows);
  } catch (err) {
    console.error("GET LISTS ERROR:", err);
    res.status(500).json({ error: "Failed to load lists" });
  }
});

/* =========================
   GET SINGLE LIST WITH ITEMS
========================= */
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const [[list]] = await db.query(
      "SELECT * FROM candy_lists WHERE id = ?",
      [id]
    );

    if (!list) {
      return res.status(404).json({ error: "List not found" });
    }

    const [items] = await db.query(
      `
      SELECT
        cli.id,
        cli.candy_id,
        cli.price,
        c.name,
        c.image
      FROM candy_list_items cli
      JOIN candies c ON c.id = cli.candy_id
      WHERE cli.list_id = ?
      ORDER BY c.name
      `,
      [id]
    );

    res.json({ list, items });

  } catch (err) {
    console.error("GET SINGLE LIST ERROR:", err);
    res.status(500).json({ error: "Failed to load list" });
  }
});

/* =========================
   CREATE LIST
========================= */
router.post("/", async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Name required" });
    }

    const [result] = await db.query(
      "INSERT INTO candy_lists (name) VALUES (?)",
      [name.trim()]
    );

    res.json({ id: result.insertId });

  } catch (err) {
    console.error("CREATE LIST ERROR:", err);
    res.status(500).json({ error: "Failed to create list" });
  }
});

/* =========================
   ADD CANDY TO LIST
========================= */
router.post("/:id/add", async (req, res) => {
  try {
    const { id } = req.params;
    const { candy_id, price } = req.body;

    if (!candy_id || price === undefined || price === null) {
      return res.status(400).json({ error: "Candy and price required" });
    }

    const [[exists]] = await db.query(
      `SELECT id FROM candy_list_items
       WHERE list_id = ? AND candy_id = ?`,
      [id, candy_id]
    );

    if (exists) {
      return res.status(400).json({ error: "Candy already in list" });
    }

    await db.query(
      `INSERT INTO candy_list_items (list_id, candy_id, price)
       VALUES (?, ?, ?)`,
      [id, candy_id, price]
    );

    res.json({ success: true });

  } catch (err) {
    console.error("ADD CANDY ERROR:", err);
    res.status(500).json({ error: "Failed to add candy" });
  }
});

/* =========================
   UPDATE ITEM PRICE
========================= */
router.put("/item/:itemId", async (req, res) => {
  try {
    const { itemId } = req.params;
    const { price } = req.body;

    if (price === undefined || price === null) {
      return res.status(400).json({ error: "Price required" });
    }

    await db.query(
      "UPDATE candy_list_items SET price = ? WHERE id = ?",
      [price, itemId]
    );

    res.json({ success: true });

  } catch (err) {
    console.error("UPDATE PRICE ERROR:", err);
    res.status(500).json({ error: "Failed to update price" });
  }
});

/* =========================
   REMOVE CANDY FROM LIST
========================= */
router.delete("/item/:itemId", async (req, res) => {
  try {
    const { itemId } = req.params;

    await db.query(
      "DELETE FROM candy_list_items WHERE id = ?",
      [itemId]
    );

    res.json({ success: true });

  } catch (err) {
    console.error("DELETE ITEM ERROR:", err);
    res.status(500).json({ error: "Failed to remove candy" });
  }
});

/* =========================
   DELETE LIST
========================= */
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    await db.query(
      "DELETE FROM candy_list_items WHERE list_id = ?",
      [id]
    );

    await db.query(
      "DELETE FROM candy_lists WHERE id = ?",
      [id]
    );

    res.json({ success: true });

  } catch (err) {
    console.error("DELETE LIST ERROR:", err);
    res.status(500).json({ error: "Failed to delete list" });
  }
});

export default router;
