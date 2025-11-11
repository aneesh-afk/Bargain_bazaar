// server.js

// 1. Setup Express and MySQL Connection
const express = require('express');
const mysql = require('mysql2/promise'); // Using promise wrapper for easier async/await and transactions (Exp4)
const bodyParser = require('body-parser');

const app = express();
const port = 3000;

// Middleware
app.use(bodyParser.json()); 
app.use(bodyParser.urlencoded({ extended: true })); 

// CORS configuration
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*'); 
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Database Connection Configuration (*** UPDATE THESE CREDENTIALS ***)
let db;
try {
    db = mysql.createPool({
        host: 'localhost',
        user: 'root', 
        password: 'Aneesh#0253', // Replace with your actual password
        database: 'bazaar_db',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    });
    console.log('✅ MySQL Connection Pool created successfully.');
} catch (err) {
    console.error('❌ Error creating connection pool:', err.stack);
}

// --- Utility Functions (DELIVERY REMOVED) ---

/**
 * Maps a role string to the corresponding stakeholder table and ID column names.
 */
function getTableName(role) {
    if (role === 'customer') return { table: 'CUSTOMER', nameColumn: 'Name', idColumn: 'Customer_ID' };
    if (role === 'shopkeeper') return { table: 'SHOPKEEPER', nameColumn: 'Name', idColumn: 'Seller_ID' };
    // Delivery Partner role removed
    return null; 
}

/**
 * Inserts the user's name into their respective stakeholder table.
 */
async function insertStakeholder(role, name) {
    const roleInfo = getTableName(role);
    if (!roleInfo) throw new Error('Invalid role specified');

    // Note: We rely on the Stakeholder tables (CUSTOMER, SHOPKEEPER, etc.) having AUTO_INCREMENT PKs.
    const query = `INSERT INTO ${roleInfo.table} (${roleInfo.nameColumn}) VALUES (?)`;
    
    const [result] = await db.execute(query, [name]);
    return result.insertId;
}

// =================================
// 2. API Routes
// =================================


// --- EXP 2 & EXP 7: DDL, Constraints, View ---
/**
 * GET /api/setup-db: Demonstrates DDL (Create, Drop, Check, Alter) and View (Exp 2 & 7).
 * WARNING: This route modifies the database schema. Only run once!
 */
app.get('/api/setup-db', async (req, res) => {
    try {
        // EXP 2: CREATE TABLE with constraints (NOT NULL, PRIMARY KEY, CHECK)
        const createTableQuery = `
            CREATE TABLE TEMP_PRODUCT_CHECK (
                ProductID INT PRIMARY KEY,
                Name VARCHAR(255) NOT NULL,
                Price DECIMAL(10, 2) NOT NULL,
                Stock INT NOT NULL,
                -- EXP 2: CHECK CONSTRAINT 
                CONSTRAINT price_range CHECK (Price > 0), 
                CONSTRAINT stock_positive CHECK (Stock >= 0)
            );
        `;
        await db.execute(createTableQuery);

        // EXP 2: ALTER TABLE and ADD CONSTRAINT (UNIQUE KEY)
        await db.execute('ALTER TABLE TEMP_PRODUCT_CHECK ADD COLUMN SKU VARCHAR(50);');
        await db.execute('ALTER TABLE TEMP_PRODUCT_CHECK ADD CONSTRAINT unique_sku UNIQUE (SKU);');

        // EXP 7: CREATE VIEW 
        const createViewQuery = `
            CREATE OR REPLACE VIEW HighValueProducts AS
            SELECT Product_Name, Standard_Price 
            FROM PRODUCT 
            WHERE Standard_Price > 20000;
        `;
        await db.execute(createViewQuery);
        
        res.status(200).json({ success: true, message: 'DDL Demonstration complete. Table TEMP_PRODUCT_CHECK and View HighValueProducts created.' });
    } catch (error) {
        console.error('DDL Error:', error);
        res.status(500).json({ success: false, message: 'DDL setup failed. Table may already exist or schema issue.' });
    }
});


// --- EXP 3: DML (Update, Delete) ---

/**
 * PUT /api/update-product/:id: Demonstrates DML UPDATE (Exp 3).
 */
app.put('/api/update-product/:id', async (req, res) => {
    const productId = req.params.id;
    const { newMaxPrice } = req.body; // Example: Update only Max_Price

    try {
        const updateQuery = 'UPDATE PRODUCT SET Max_Price = ? WHERE Product_ID = ?';
        const [result] = await db.execute(updateQuery, [newMaxPrice, productId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: `Product ID ${productId} not found.` });
        }
        res.status(200).json({ success: true, message: `Product ${productId} Max Price updated to ${newMaxPrice}.` });
    } catch (error) {
        console.error('Update Error:', error);
        res.status(500).json({ success: false, message: 'Failed to update product.' });
    }
});

/**
 * DELETE /api/delete-offer/:id: Demonstrates DML DELETE (Exp 3).
 */
app.delete('/api/delete-offer/:id', async (req, res) => {
    const offerId = req.params.id;

    try {
        // Exp 3: DELETE statement
        const deleteQuery = 'DELETE FROM OFFER WHERE Offer_ID = ?';
        const [result] = await db.execute(deleteQuery, [offerId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: `Offer ID ${offerId} not found.` });
        }
        res.status(200).json({ success: true, message: `Offer ${offerId} successfully deleted.` });
    } catch (error) {
        console.error('Delete Error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete offer.' });
    }
});


// --- EXP 4: TCL (Transaction Control Language) ---

/**
 * POST /api/transaction-accept-offer/:id: Demonstrates Transaction Control (COMMIT/ROLLBACK) (Exp 4).
 * Logic: 1. Start Transaction -> 2. Insert Order -> 3. Update Offer Status -> 4. Update Leaderboard -> 5. COMMIT/ROLLBACK
 */
app.post('/api/transaction-accept-offer/:id', async (req, res) => {
    const offerId = req.params.id;
    const connection = await db.getConnection(); // Get a specific connection for the transaction

    try {
        // EXP 4: BEGIN TRANSACTION
        await connection.beginTransaction(); 

        // 1. Get Offer Details
        const [offers] = await connection.execute('SELECT Customer_ID, Product_ID, Offered_Price FROM OFFER WHERE Offer_ID = ? AND Status = "Pending"', [offerId]);
        if (offers.length === 0) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: 'Offer not found or already processed.' });
        }
        const { Customer_ID, Product_ID, Offered_Price } = offers[0];

        // 2. Insert Order (DML INSERT)
        const orderQuery = 'INSERT INTO `ORDER` (Customer_ID, Product_ID, Quantity, Order_Date, Final_Price) VALUES (?, ?, 1, CURDATE(), ?)';
        const [orderResult] = await connection.execute(orderQuery, [Customer_ID, Product_ID, Offered_Price]);
        const orderId = orderResult.insertId;

        // 3. Update Offer Status (DML UPDATE)
        await connection.execute('UPDATE OFFER SET Status = "Accepted (Manual)" WHERE Offer_ID = ?', [offerId]);

        // 4. Update Leaderboard (DML UPDATE/INSERT) - Giving 100 points for a successful bargain
        const points = 100;
        await connection.execute(
            'INSERT INTO LEADERBOARD (Customer_ID, Points, Last_Updated) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE Points = Points + ?, Last_Updated = NOW()',
            [Customer_ID, points, points]
        );

        // 5. EXP 4: COMMIT TRANSACTION
        await connection.commit(); 

        res.status(200).json({ success: true, message: `Offer accepted. Order ID ${orderId} created, and ${points} awarded.` });
    } catch (error) {
        // EXP 4: ROLLBACK TRANSACTION on error
        await connection.rollback(); 
        console.error('Transaction failed:', error);
        res.status(500).json({ success: false, message: 'Transaction failed. Order creation rolled back.' });
    } finally {
        connection.release();
    }
});

// --- EXP 5: Joins (Cross Join Demonstration) ---

/**
 * GET /api/cross-join-demo: Demonstrates a CROSS JOIN (Exp 5).
 */
app.get('/api/cross-join-demo', async (req, res) => {
    try {
        // EXP 5: CROSS JOIN - every customer is theoretically matched with every product
        const query = `
            SELECT C.Name AS CustomerName, P.Product_Name 
            FROM CUSTOMER C
            CROSS JOIN PRODUCT P
            LIMIT 10;
        `;
        const [results] = await db.execute(query);
        res.status(200).json({ 
            success: true, 
            message: 'Cross Join: Showing potential matches (limited to 10 rows).', 
            data: results 
        });
    } catch (error) {
        console.error('Cross Join Error:', error);
        res.status(500).json({ success: false, message: 'Failed to perform cross join.' });
    }
});


// --- EXP 6: Aggregates, Group By, Having ---

/**
 * GET /api/shopkeeper/stats/:sellerId: Demonstrates Aggregates (AVG, COUNT), GROUP BY, and HAVING (Exp 6).
 */
app.get('/api/shopkeeper/stats/:sellerId', async (req, res) => {
    const sellerId = req.params.sellerId;
    
    try {
        // EXP 6: Aggregate Functions, GROUP BY, and HAVING
        const query = `
            SELECT 
                P.Product_Name, 
                COUNT(O.Offer_ID) AS TotalOffers,
                AVG(O.Offered_Price) AS AvgOfferPrice,
                MAX(O.Offered_Price) AS MaxOffer
            FROM PRODUCT P
            LEFT JOIN OFFER O ON P.Product_ID = O.Product_ID
            WHERE P.Seller_ID = ?
            GROUP BY P.Product_Name
            HAVING AvgOfferPrice >= 1000 
            ORDER BY TotalOffers DESC;
        `;
        const [results] = await db.execute(query, [sellerId]);

        res.status(200).json({ 
            success: true, 
            message: 'Shopkeeper sales statistics (only shows products with Avg Offer >= 1000).', 
            data: results 
        });
    } catch (error) {
        console.error('Stats Error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch shopkeeper stats.' });
    }
});


// --- EXP 9: Sub-Query ---

/**
 * GET /api/high-value-customers: Demonstrates a Sub-Query (Exp 9).
 */
app.get('/api/high-value-customers', async (req, res) => {
    try {
        // EXP 9: Sub-Query - Find customers who have made an offer higher than the overall average offer.
        const query = `
            SELECT DISTINCT C.Name, C.Customer_ID
            FROM CUSTOMER C
            JOIN OFFER O ON C.Customer_ID = O.Customer_ID
            WHERE O.Offered_Price > (
                -- Subquery calculates the average offered price across all offers
                SELECT AVG(Offered_Price) FROM OFFER
            );
        `;
        const [results] = await db.execute(query);

        res.status(200).json({ 
            success: true, 
            message: 'Customers who offered more than the global average offer price.', 
            data: results 
        });
    } catch (error) {
        console.error('Sub-Query Error:', error);
        res.status(500).json({ success: false, message: 'Failed to execute sub-query demo.' });
    }
});


// ----------------------------------------------------
// --- Core Application Routes (Simplified/Kept) ---
// ----------------------------------------------------

/**
 * GET /api/shopkeeper/products/:sellerId (MODIFIED to return raw array, like offers)
 */
app.get('/api/shopkeeper/products/:sellerId', async (req, res) => {
    const sellerId = req.params.sellerId;
    
    try {
        const query = 'SELECT Product_ID, Product_Name, Standard_Price, Min_Price, Max_Price FROM PRODUCT WHERE Seller_ID = ? ORDER BY Product_ID DESC';
        const [results] = await db.execute(query, [sellerId]);
        
        // Return the results array directly, matching the Offers API structure.
        res.status(200).json(results); 
        
    } catch (error) {
        console.error('Error fetching seller products:', error);
        // If query fails, still send an empty array or handle gracefully in production
        res.status(500).json([]); 
    }
});


/**
 * POST /api/register (Exp 3: DML INSERT)
 */
app.post('/api/register', async (req, res) => {
    const { name, email, password, role } = req.body;
    
    // Check for valid role (delivery removed)
    if (role !== 'customer' && role !== 'shopkeeper') {
        return res.status(400).json({ success: false, message: 'Invalid role specified for registration.' });
    }

    try {
        const [existing] = await db.execute('SELECT 1 FROM USER WHERE Email = ?', [email]);
        if (existing.length > 0) {
             return res.status(409).json({ success: false, message: 'User with this email already exists.' });
        }
        
        const stakeholderId = await insertStakeholder(role, name);

        // EXP 3: DML INSERT
        const simulatedHash = `hash_${password}`; 
        const userQuery = 'INSERT INTO USER (Email, Password_Hash, Role, Stakeholder_ID) VALUES (?, ?, ?, ?)';
        await db.execute(userQuery, [email, simulatedHash, role, stakeholderId]);
        
        res.status(201).json({ success: true, message: `Registration successful for ${role}! Please proceed to login.`, userId: stakeholderId });
    } catch (error) {
        console.error('Registration Error:', error);
        res.status(500).json({ success: false, message: 'Error during registration. Check if ' + role + ' table is correctly set up.' });
    }
});


/**
 * POST /api/login (Exp 5: Joins implicit via utility functions)
 */
app.post('/api/login', async (req, res) => {
    const { email, password, role } = req.body;

    // Check for valid role (delivery removed)
    if (role !== 'customer' && role !== 'shopkeeper') {
        return res.status(400).json({ success: false, message: 'Invalid role selected.' });
    }
    
    try {
        // 1. Find user in the central USER table
        const authQuery = 'SELECT Password_Hash, Stakeholder_ID FROM USER WHERE Email = ? AND Role = ?';
        const [results] = await db.execute(authQuery, [email, role]);
        
        if (results.length === 0) {
            return res.status(401).json({ success: false, message: 'Invalid email, password, or role selected.' });
        }
        
        const userRecord = results[0];
        const simulatedHash = `hash_${password}`; 
        
        if (simulatedHash !== userRecord.Password_Hash) { 
            return res.status(401).json({ success: false, message: 'Invalid email or password.' });
        }
        
        // 2. Authentication successful: Fetch the user's name 
        const roleInfo = getTableName(role);
        
        const stakeholderId = userRecord.Stakeholder_ID; 
        
        const nameQuery = `SELECT ${roleInfo.nameColumn} AS Name FROM ${roleInfo.table} WHERE ${roleInfo.idColumn} = ?`;

        const [nameResults] = await db.execute(nameQuery, [stakeholderId]);
        
        // Error Check: Did we find the corresponding stakeholder record?
        if (nameResults.length === 0) {
             console.error(`Login Name Fetch Error: Could not find ${role} with ID ${stakeholderId}`);
             return res.status(401).json({ success: false, message: 'Authentication failed: User profile missing.' });
        }

        res.status(200).json({ 
            success: true, 
            message: `Welcome back, ${nameResults[0].Name}!`,
            user: { id: stakeholderId, name: nameResults[0].Name, role: role }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, message: 'Database error during login.' });
    }
});


/**
 * GET /api/products (Exp 3: DML SELECT)
 */
app.get('/api/products', async (req, res) => {
    try {
        // EXP 3: DML SELECT
        const query = 'SELECT Product_ID, Product_Name, Standard_Price, Min_Price, Max_Price FROM PRODUCT;';
        const [results] = await db.execute(query);
        res.status(200).json(results);
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({ error: 'Database error fetching products.' });
    }
});


/**
 * GET /api/leaderboard (NEW Endpoint to fetch customer leaderboard data)
 */
app.get('/api/leaderboard', async (req, res) => {
    try {
        // Query joins Customer names with their points from the Leaderboard table
        const query = `
            SELECT 
                C.Name, 
                L.Points 
            FROM CUSTOMER C
            INNER JOIN LEADERBOARD L ON C.Customer_ID = L.Customer_ID
            ORDER BY L.Points DESC 
            LIMIT 10;
        `;
        const [results] = await db.execute(query);
        
        // Return the raw array of results
        res.status(200).json(results); 
    } catch (error) {
        console.error('Error fetching leaderboard:', error);
        // Return an empty array on failure
        res.status(500).json([]); 
    }
});


/**
 * POST /api/bargain (Exp 3: DML INSERT)
 */
app.post('/api/bargain', async (req, res) => {
    const { customerId, productId, offeredPrice } = req.body;
    
    try {
        const [results] = await db.execute('SELECT Min_Price, Standard_Price FROM PRODUCT WHERE Product_ID = ?', [productId]);
        if (results.length === 0) {
            return res.status(404).json({ success: false, message: 'Product not found.' });
        }
        
        const { Min_Price, Standard_Price } = results[0];
        let status;
        let message;
        
        if (offeredPrice < Min_Price) {
            status = 'Rejected (AI)';
            message = `Your offer is below the minimum acceptable price of ₹${Min_Price}.`;
        } else if (offeredPrice >= Min_Price && offeredPrice < Standard_Price) {
            status = 'Pending';
            message = 'Your offer is within the acceptable range. Awaiting shopkeeper response.';
        } else {
            status = 'Accepted (Auto)';
            message = 'Congratulations! Your offer has been accepted automatically at the standard price.';
        }

        // EXP 3: DML INSERT
        const insertOfferQuery = 'INSERT INTO OFFER (Customer_ID, Product_ID, Offered_Price, Offer_Date_Time, Status) VALUES (?, ?, ?, NOW(), ?)';
        const [insertResult] = await db.execute(insertOfferQuery, [customerId, productId, offeredPrice, status]);
        
        // EXP 8: TRIGGER: If the database has a BEFORE INSERT trigger on OFFER, it would run here.

        res.status(200).json({ success: true, offer_id: insertResult.insertId, status: status, message: message });
    } catch (error) {
        console.error('Error submitting offer:', error);
        res.status(500).json({ success: false, message: 'Error submitting offer to database.' });
    }
});


/**
 * GET /api/shopkeeper/offers/:sellerId (Exp 5: Joins)
 */
app.get('/api/shopkeeper/offers/:sellerId', async (req, res) => {
    const sellerId = req.params.sellerId;
    
    try {
        const query = `
            SELECT 
                O.Offer_ID, O.Offered_Price, O.Status AS OfferStatus, 
                P.Product_Name, P.Product_ID, P.Standard_Price, P.Min_Price, P.Max_Price,
                C.Name AS CustomerName
            FROM OFFER O
            INNER JOIN PRODUCT P ON O.Product_ID = P.Product_ID
            INNER JOIN CUSTOMER C ON O.Customer_ID = C.Customer_ID
            WHERE P.Seller_ID = ? AND (O.Status = 'Pending' OR O.Status = 'Accepted (Auto)')
            ORDER BY O.Offered_Price DESC;
        `;

        const [results] = await db.execute(query, [sellerId]);
        res.status(200).json(results);
    } catch (error) {
        console.error('Error fetching shopkeeper offers:', error);
        res.status(500).json({ error: 'Database error fetching offers.' });
    }
});


/**
 * POST /api/shopkeeper/product (Exp 3: DML INSERT)
 */
app.post('/api/shopkeeper/product', async (req, res) => {
    const { productId, productName, standardPrice, minPrice, maxPrice, sellerId } = req.body;
    
    try {
        // EXP 3: DML INSERT
        const query = 'INSERT INTO PRODUCT (Product_ID, Seller_ID, Product_Name, Standard_Price, Min_Price, Max_Price) VALUES (?, ?, ?, ?, ?, ?)';
        await db.execute(query, [productId, sellerId, productName, standardPrice, minPrice, maxPrice]);
        
        res.status(201).json({ success: true, message: 'Product uploaded successfully!' });
    } catch (err) {
        console.error('Error uploading product:', err);
        if (err.code === 'ER_DUP_ENTRY') {
             return res.status(409).json({ success: false, message: 'Error: Product ID already exists.' });
        }
        res.status(500).json({ success: false, message: 'Error uploading product to database.' });
    }
});

/**
 * DELETE /api/shopkeeper/product/:id: Deletes a product listed by the shopkeeper.
 */
app.delete('/api/shopkeeper/product/:id', async (req, res) => {
    const productId = req.params.id;
    // NOTE: In a real app, you must verify the Seller_ID against the session user ID
    // but for this demo, we rely on the client sending the correct product ID.
    
    try {
        // Ensure to delete related records first if necessary (e.g., offers, using foreign key CASCADE is better)
        // Here, we just delete the product itself.
        const deleteQuery = 'DELETE FROM PRODUCT WHERE Product_ID = ?';
        const [result] = await db.execute(deleteQuery, [productId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: `Product ID ${productId} not found.` });
        }
        res.status(200).json({ success: true, message: `Product ${productId} successfully deleted.` });
    } catch (error) {
        console.error('Product Delete Error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete product.' });
    }
});

/**
 * GET /api/customer/orders/:customerId: Fetches all orders for a specific customer ID.
 */
app.get('/api/customer/orders/:customerId', async (req, res) => {
    const customerId = req.params.customerId;
    
    try {
        const query = `
            SELECT 
                O.Order_ID, O.Order_Date, O.Final_Price, O.Quantity,
                P.Product_Name, P.Standard_Price,
                S.Name AS ShopkeeperName
            FROM \`ORDER\` O
            INNER JOIN PRODUCT P ON O.Product_ID = P.Product_ID
            INNER JOIN SHOPKEEPER S ON P.Seller_ID = S.Seller_ID
            WHERE O.Customer_ID = ?
            ORDER BY O.Order_Date DESC;
        `;
        // NOTE: Using backticks around 'ORDER' to avoid SQL keyword error.
        const [results] = await db.execute(query, [customerId]);
        res.status(200).json(results);
    } catch (error) {
        console.error('Error fetching customer orders:', error);
        res.status(500).json({ error: 'Database error fetching customer orders.' });
    }
});

/**
 * GET /api/shopkeeper/orders/:sellerId: Fetches all accepted orders for a given shopkeeper.
 */
app.get('/api/shopkeeper/orders/:sellerId', async (req, res) => {
    const sellerId = req.params.sellerId;
    
    try {
        const query = `
            SELECT 
                O.Order_ID, O.Order_Date, O.Final_Price, O.Quantity,
                P.Product_Name, P.Product_ID,
                C.Name AS CustomerName
            FROM \`ORDER\` O
            INNER JOIN PRODUCT P ON O.Product_ID = P.Product_ID
            INNER JOIN CUSTOMER C ON O.Customer_ID = C.Customer_ID
            WHERE P.Seller_ID = ?
            ORDER BY O.Order_Date DESC;
        `;
        const [results] = await db.execute(query, [sellerId]);
        res.status(200).json(results);
    } catch (error) {
        console.error('Error fetching shopkeeper orders:', error);
        res.status(500).json({ error: 'Database error fetching shopkeeper orders.' });
    }
});


// 3. Start the Server
app.listen(port, () => {
    console.log(`\n==========================================`);
    console.log(`🚀 BargainBazaar Backend Online (SQL Demo Mode)`);
    console.log(`Backend API running at http://localhost:${port}`);
    console.log(`==========================================`);
    console.log(`\nDemo Routes (access via browser or tool like Postman):`);
    console.log(`- DDL/View: http://localhost:3000/api/setup-db`);
    console.log(`- TCL (Transaction): POST http://localhost:3000/api/transaction-accept-offer/:id`);
    console.log(`- Joins (Cross): http://localhost:3000/api/cross-join-demo`);
    console.log(`- Aggregates/Having: http://localhost:3000/api/shopkeeper/stats/:sellerId`);
    console.log(`- Sub-Query: http://localhost:3000/api/high-value-customers`);
    console.log(`------------------------------------------`);
});