# Wenddy Candy Backend - AI Coding Guidelines

## Architecture Overview
- **Node.js Express API** with MySQL backend for candy vending system
- **ES Modules** (`"type": "module"` in package.json)
- **Connection Pool**: Use `db` from `config/db.js` for all database operations
- **Routes Structure**: `/api/admin/*` for CRUD, `/api/sales/*` for checkout, `/api/salesman/*` for POS operations

## Database Patterns
- **Transactions**: Always use `conn.beginTransaction()`, `conn.commit()`, `conn.rollback()` for multi-step operations
- **Inventory Locking**: Use `FOR UPDATE` on `stall_candy_inventory` queries to prevent race conditions
- **Combo Offers**: Stored in `combo_offer_rules` + `combo_offer_rule_candies` junction table
- **Sales Flow**: `sales` → `sale_items` → inventory deduction

## Offer Engine Rules
- **Single Source**: All pricing calculations via `services/offerEngine.js`
- **No Double Discount**: Manual combos get fixed price, auto-offers apply to remaining items only
- **Combo Logic**: Buy `unique_count` different candies at `price` each → pay `offer_price` total
- **Preview/Sell Consistency**: Both routes use identical `applyOfferEngine({ lines })`

## Code Conventions
- **Error Handling**: `try/catch` with `conn.rollback()` on failure, log errors with `console.error`
- **Validation**: Check array types with `Array.isArray()`, numeric safety with `Number()`
- **Imports**: Relative paths from file location (e.g., `import { db } from "../../config/db.js"`)
- **Response Format**: `{ success: true, ... }` or `{ error: "message" }`

## Key Files
- `services/offerEngine.js`: Core pricing logic - read for combo calculations
- `routes/salesman/sell.js`: Transactional sale processing with inventory updates
- `routes/admin/comboOfferRules.js`: Rule creation with duplicate prevention
- `config/db.js`: MySQL pool setup

## Development Workflow
- **Start**: `npm run dev` (nodemon) or `npm start`
- **Env Vars**: `.env` with `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_PORT`, `FRONTEND_URL`
- **Health Check**: GET `/` returns API status
- **Testing**: No tests yet - add to `test-2/` folder when implementing</content>
<parameter name="filePath">c:\Users\Lenovo\Downloads\wenddy-candy\server\.github\copilot-instructions.md