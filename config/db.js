// cls
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  // host: 'localhost',
  // user: 'root', // replace with your MySQL username
  // password: 'itinerary@123', // replace with your MySQL password
  // database: 'employee_db',
  // waitForConnections: true,
  // connectionLimit: 10,
  // queueLimit: 0  
  host:"auth-db672.hstgr.io",
  user: "u339252844_HRpanel",
  password: "HRpanel@123",
  database: "u339252844_HRpanel",
  port: 3306,
});

module.exports = pool;