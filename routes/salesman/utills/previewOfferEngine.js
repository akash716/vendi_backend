// import express from "express";
// import { applyOfferEngine } from "../../services/offerEngine.js";

// const router = express.Router();

// /**
//  * POST /api/salesman/preview
//  * 🔥 SINGLE SOURCE OF TRUTH
//  */
// router.post("/", async (req, res) => {
//   const { lines } = req.body;

//   if (!Array.isArray(lines) || lines.length === 0) {
//     return res.json({ total: 0 });
//   }

//   try {
//     const { total } = await applyOfferEngine({ lines });

//     res.json({
//       total: Number(total)
//     });
//   } catch (err) {
//     console.error("PREVIEW ERROR:", err);
//     res.status(500).json({
//       error: "Preview failed"
//     });
//   }
// });

// export default router;
