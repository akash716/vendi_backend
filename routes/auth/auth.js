/**
 * POST /api/auth/register  — create admin (only if no admin exists, or by existing admin)
 * POST /api/auth/login     — get JWT token
 * GET  /api/auth/me        — verify current admin
 */
import express from "express";
import { db } from "../../config/db.js";
import { hashPassword, verifyPassword, signToken, verifyToken } from "../../services/auth.js";
import { rateLimit, requireAdmin } from "../../middleware/authMiddleware.js";

const router  = express.Router();
const loginRL = rateLimit({ windowMs:15*60*1000, max:10, message:"Too many attempts. Wait 15 minutes." });
const regRL   = rateLimit({ windowMs:60*60*1000, max:5 });

/* ── register ── */
router.post("/register", regRL, async (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name?.trim() || !email?.trim() || !password)
      return res.status(400).json({ error:"Name, email and password required" });
    if (password.length < 6)
      return res.status(400).json({ error:"Password must be at least 6 characters" });

    // If an admin already exists, only another logged-in admin can add more
    const [[existing]] = await db.query("SELECT id FROM users WHERE role='ADMIN' LIMIT 1");
    if (existing) {
      const tok = (req.headers.authorization||"").replace("Bearer ","");
      const p   = tok ? verifyToken(tok) : null;
      if (!p || p.role !== "ADMIN")
        return res.status(403).json({ error:"An admin already exists. Log in first." });
    }

    const [[dup]] = await db.query("SELECT id FROM users WHERE email=?", [email.trim().toLowerCase()]);
    if (dup) return res.status(409).json({ error:"Email already registered" });

    const hashed = await hashPassword(password);
    const [r] = await db.query(
      "INSERT INTO users (name,email,password,role) VALUES (?,?,?,'ADMIN')",
      [name.trim(), email.trim().toLowerCase(), hashed]
    );

    const token = signToken({ id:r.insertId, name:name.trim(), email:email.trim().toLowerCase(), role:"ADMIN" });
    res.status(201).json({ token, name:name.trim(), email:email.trim().toLowerCase() });
  } catch(err) {
    console.error("REGISTER:",err);
    res.status(500).json({ error:"Server error" });
  }
});

/* ── login ── */
router.post("/login", loginRL, async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error:"Email and password required" });

    const [[user]] = await db.query(
      "SELECT id,name,email,password,role FROM users WHERE email=? AND role='ADMIN'",
      [email.trim().toLowerCase()]
    );

    // Always hash-compare to prevent timing attacks
    const dummy = "aabbccdd11223344:aaaabbbbccccddddaaaabbbbccccddddaaaabbbbccccddddaaaabbbbccccddddaaaabbbbccccddddaaaabbbbccccddddaaaabbbbccccddddaaaabbbbccccdddd";
    const ok    = user ? await verifyPassword(password, user.password) : (await verifyPassword("x", dummy), false);

    if (!user || !ok)
      return res.status(401).json({ error:"Invalid email or password" });

    const token = signToken({ id:user.id, name:user.name, email:user.email, role:user.role });
    res.json({ token, name:user.name, email:user.email });
  } catch(err) {
    console.error("LOGIN:",err);
    res.status(500).json({ error:"Server error" });
  }
});

/* ── me ── */
router.get("/me", requireAdmin, (req, res) => {
  res.json({ id:req.admin.id, name:req.admin.name, email:req.admin.email });
});

export default router;
