require('dotenv').config();
const app = require('./app');
const pool = require('./config/db');

// Test database connection
pool.execute('SELECT 1')
  .then(() => console.log('Database connected successfully'))
  .catch(err => console.error('Database connection failed:', err));

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API Documentation:`);
  console.log(`- Employees: http://localhost:${PORT}/api/employees`);
  console.log(`- Projects: http://localhost:${PORT}/api/projects`);
  console.log(`- Health Check: http://localhost:${PORT}/api/health`);
});