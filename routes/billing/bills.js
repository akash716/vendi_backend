import express from "express";
import { db } from "../../config/db.js";

const router = express.Router();

/* =====================================================
   🧾 CREATE BILL (SNAPSHOT FROM FRONTEND CART)
   POST /api/billing/create
===================================================== */
router.post("/create", async (req, res) => {
    const { stall_id, total, lines } = req.body;

    if (!stall_id || !Array.isArray(lines) || !lines.length) {
        return res.status(400).json({ error: "Invalid bill data" });
    }

    const conn = await db.getConnection();

    try {
        await conn.beginTransaction();

        // 1️⃣ Create bill header
        const [billRes] = await conn.query(
            `INSERT INTO bills (stall_id, total) VALUES (?, ?)`,
            [stall_id, Number(total || 0)]
        );

        const billId = billRes.insertId;

        // 2️⃣ Save each cart line as-is (snapshot)
        for (const line of lines) {
            await conn.query(
                `
        INSERT INTO bill_lines
          (bill_id, type, title, price, meta)
        VALUES (?, ?, ?, ?, ?)
        `,
                [
                    billId,
                    line.type,
                    // title priority: explicit title → name → fallback
                    line.title || line.name || (line.type === "COMBO" ? "Combo" : "Item"),
                    Number(line.price || 0),
                    JSON.stringify(line)
                ]
            );
        }

        await conn.commit();

        res.json({
            success: true,
            bill_id: billId
        });

    } catch (err) {
        await conn.rollback();
        console.error("BILL CREATE ERROR:", err.message);

        res.status(500).json({
            error: err.message || "Bill creation failed"
        });

    } finally {
        conn.release();
    }
});

/* =====================================================
   🧾 GET FULL BILL (UI FRIENDLY)
   GET /api/billing/:billId
===================================================== */
router.get("/:billId", async (req, res) => {
    const { billId } = req.params;

    try {
        // 1️⃣ Bill header
        const [[bill]] = await db.query(
            `
      SELECT
        b.id,
        b.stall_id,
        st.name AS stall_name,
        b.total,
        b.created_at
      FROM bills b
      JOIN stalls st ON st.id = b.stall_id
      WHERE b.id = ?
      `,
            [billId]
        );

        if (!bill) {
            return res.status(404).json({ error: "Bill not found" });
        }

        // 2️⃣ Bill lines (snapshot)
        const [lines] = await db.query(
            `
      SELECT
        id,
        type,
        title,
        price,
        meta
      FROM bill_lines
      WHERE bill_id = ?
      ORDER BY id
      `,
            [billId]
        );

        const parsedLines = lines.map(l => ({
            ...l,
            meta: typeof l.meta === "string" ? JSON.parse(l.meta) : l.meta
        }));

        res.json({
            bill,
            lines: parsedLines
        });


    } catch (err) {
        console.error("BILL FETCH ERROR:", err.message);
        res.status(500).json({
            error: err.message || "Failed to load bill"
        });
    }
});

export default router;
