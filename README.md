BargainBazaar Marketplace

🛒 Project Overview

BargainBazaar is an innovative full-stack web application designed to simulate and manage a dynamic online marketplace where Customers negotiate prices directly with Shopkeepers. The platform highlights the integration of modern web technologies with core Database Management System (DBMS) principles, focusing specifically on transactional integrity and complex data aggregation.

The project successfully demonstrates critical backend operations, including atomic transactions for order fulfillment and sophisticated data reporting using views and aggregates.

🚀 Technology Stack

Backend (API): Node.js (runtime) & Express.js (framework)

Database: MySQL (bazaar_db)

Database Driver: mysql2/promise (for high-performance, asynchronous operations)

Frontend (UI): Vanilla HTML, CSS, JavaScript (Single-Page Application)

✨ Core Features & DBMS Demonstrations

Functional Features

Dual-Role Dashboards: Separate user experiences for Customers (browsing, bargaining, viewing orders, leaderboard) and Shopkeepers (product listing, managing offers, sales analytics).

AI-Assisted Bargaining Flow: Customers submit offers, which are processed against seller-defined price ranges.

Leaderboard: Tracks customer engagement by awarding points for successful transactions.

Database Management Demonstrations

This project implements the following key DBMS concepts:

Transaction Control (TCL): Atomic order finalization (POST /api/transaction-accept-offer/:id) ensuring ORDER insertion, OFFER update, and LEADERBOARD update succeed or fail together.

Triggers: The BEFORE INSERT ON OFFER trigger automatically enforces the seller's minimum price threshold, rejecting low bids at the database level.

Complex Queries (Aggregation): The Sales Statistics Dashboard uses AVG(), COUNT(), GROUP BY, and the HAVING clause to filter products based on their average offer performance.

Data Abstraction (DML): Full INSERT, SELECT, UPDATE, and DELETE operations are implemented for core entities, alongside Joins, Sub-Queries, and Views.

🛠️ Project Setup and Run Instructions

Prerequisites

Node.js: Ensure you have Node.js installed (LTS version recommended).

MySQL Server: A running MySQL instance is required.

1. Database Setup

Create the Database: Run the following command in your MySQL client:

CREATE DATABASE bazaar_db;


Install Dependencies: Install backend packages:

npm install express mysql2 body-parser


Configure Credentials: Open server.js and update the db connection configuration section with your local MySQL password:

// In server.js
db = mysql.createPool({
    host: 'localhost',
    user: 'root', 
    password: 'Aneesh#0253', // <--- YOUR PASSWORD HERE
    database: 'bazaar_db',
    // ...
});


2. Start the Application

Start the Backend API: Run the server file using Node.

node server.js


The console will confirm the API is running at http://localhost:3000.

Prepare the Database Schema: Execute the DDL setup route once by accessing this URL in your browser:
http://localhost:3000/api/setup-db

Access the Frontend: Open the index.html file directly in your web browser.

3. Testing Credentials (Simulated)

Use the registration page (/register) to create test accounts for both a Customer and a Shopkeeper.
