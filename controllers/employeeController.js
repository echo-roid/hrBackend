const pool = require('../config/db');
const upload = require('../middleware/upload');
const path = require('path');
const bcrypt = require('bcrypt');
const saltRounds = 10; // For bcrypt hashing

const employeeController = {
  // Create a new employee with photo and password
   createEmployee:async (req, res) => {
    try {
      const {
        name,
        designation,
        level,
        email,
        password,
        age,
        identity_id,
        contact_number,
        house_address,
        date_of_birth,
        team_name,
        reporting_manager_id,
        reporting_manager,
        father_name,
        mother_name,
        joining_date,
        current_project,
        appraisal_points,
        leaves
      } = req.body;
  
      // Validate required fields
      if (!name || !email || !level || !designation || !password) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
  
      const validLevels = ['Intern', 'Junior', 'Mid', 'Senior', 'Lead', 'Manager'];
      if (!validLevels.includes(level)) {
        return res.status(400).json({ error: 'Invalid level value' });
      }
  
      // Check if email already exists
      const [existing] = await pool.execute(
        'SELECT id FROM employees WHERE email = ?',
        [email]
      );
      if (existing.length > 0) {
        return res.status(409).json({ error: 'Email already exists' });
      }
  
      // Hash password
      const hashedPassword = await bcrypt.hash(password, saltRounds);
  
      // Handle photo upload (optional)
      const photo = req.file ? req.file.filename : null;
  
      // Insert employee
      const sql = `
        INSERT INTO employees (
          name, designation, level, email, password, age, identity_id, photo, contact_number,
          house_address, date_of_birth, team_name, reporting_manager, reporting_manager_id,
          father_name, mother_name, joining_date, current_project, appraisal_points,
          created_at, updated_at, deleted_at, password_plain, leaves
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
  
      const values = [
        name,
        designation,
        level,
        email,
        hashedPassword,
        age || null,
        identity_id || null,
        photo,
        contact_number || null,
        house_address || null,
        date_of_birth || null,
        team_name || null,
        reporting_manager || null,
        reporting_manager_id || null,
        father_name || null,
        mother_name || null,
        joining_date || null,
        current_project || null,
        appraisal_points || 0,
        new Date(),
        new Date(),
        null, // deleted_at
        password, // password_plain
        JSON.stringify(leaves || []) // Store `leaves` as JSON
      ];
  
      await pool.execute(sql, values);
  
      res.status(201).json({ message: 'Employee created successfully' });
    } catch (error) {
      console.error('Create Employee Error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Get all employees (exclude passwords)
  getAllEmployees: async (req, res) => {
    try {
      const [employees] = await pool.execute(`
        SELECT 
          id, name, designation, level, email, password, password_plain, age, identity_id, 
          photo, contact_number, house_address, date_of_birth, 
          team_name, reporting_manager, leaves, 
          father_name, mother_name, joining_date, 
          current_project, appraisal_points
        FROM employees
      `);

      const updatedEmployees = employees.map(emp => ({
        ...emp,
        photo: emp.photo
          ? `${req.protocol}://${req.get('host')}/uploads/${path.basename(emp.photo)}`
          : null,
        leaves: typeof emp.leaves === 'string' ? JSON.parse(emp.leaves) : emp.leaves
      }));

      res.json(updatedEmployees);
    } catch (error) {
      console.error('Get All Employees Error:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Delete an employee
  deleteEmployee: async (req, res) => {
    let connection;
    try {
      const { id } = req.params;
      connection = await pool.getConnection();

      const [employee] = await connection.query(
        'SELECT id, photo FROM employees WHERE id = ?',
        [id]
      );

      if (employee.length === 0) {
        return res.status(404).json({ error: 'Employee not found' });
      }

      await connection.beginTransaction();

      try {
        await connection.query('DELETE FROM leave_requests WHERE employee_id = ?', [id]);
        await connection.query('DELETE FROM leave_adjustments WHERE employee_id = ?', [id]);
        await connection.query('DELETE FROM leave_balances WHERE employee_id = ?', [id]);
        await connection.query('DELETE FROM employees WHERE id = ?', [id]);

        if (employee[0].photo) {
          const fs = require('fs');
          const photoPath = path.join(__dirname, '../uploads', employee[0].photo);
          if (fs.existsSync(photoPath)) {
            fs.unlinkSync(photoPath);
          }
        }

        await connection.commit();
        res.json({ message: 'Employee deleted successfully' });
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    } catch (error) {
      console.error('Delete Employee Error:', error);
      res.status(500).json({ error: 'Internal server error', message: error.message });
    } finally {
      if (connection) connection.release();
    }
  },

  // Soft delete alternative (if you prefer archiving over permanent deletion)
  softDeleteEmployee: async (req, res) => {
    try {
      const { id } = req.params;

      const [employee] = await pool.execute(
        'SELECT id FROM employees WHERE id = ? AND deleted_at IS NULL',
        [id]
      );

      if (employee.length === 0) {
        return res.status(404).json({ error: 'Employee not found or already deleted' });
      }

      await pool.execute(
        'UPDATE employees SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?',
        [id]
      );

      res.json({ message: 'Employee deactivated successfully' });
    } catch (error) {
      console.error('Soft Delete Error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Get one employee by ID (exclude password)
  getEmployeeById: async (req, res) => {
    try {
      const { id } = req.params;

      const [rows] = await pool.execute(`
        SELECT 
          id, name, designation, level, email, password, password_plain, age, identity_id, 
          photo, contact_number, house_address, date_of_birth, 
          team_name, reporting_manager, leaves,
          father_name, mother_name, joining_date, 
          current_project, appraisal_points
        FROM employees 
        WHERE id = ?
      `, [id]);

      if (rows.length === 0) {
        return res.status(404).json({ error: 'Employee not found' });
      }

      const employee = rows[0];
      employee.photo = employee.photo
        ? `${req.protocol}://${req.get('host')}/uploads/${path.basename(employee.photo)}`
        : null;
      employee.leaves = typeof employee.leaves === 'string' ? JSON.parse(employee.leaves) : employee.leaves;

      res.json(employee);
    } catch (error) {
      console.error('Get Employee By ID Error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Get all managers
  getAllManagers: async (req, res) => {
    try {
      // Example: assuming managers have levels 'Senior' or 'Lead'
      const [managers] = await pool.execute(`
        SELECT 
          id, name, designation, level, email, photo
        FROM employees
        WHERE designation = 'Manager'
      `);

      const updatedManagers = managers.map(manager => ({
        ...manager,
        photo: manager.photo
          ? `${req.protocol}://${req.get('host')}/uploads/${path.basename(manager.photo)}`
          : null,
      }));

      res.json(updatedManagers);
    } catch (error) {
      console.error('Get All Managers Error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Update employee details (with optional photo)
editEmployee: async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch existing employee to check presence and photo
    const [existingRows] = await pool.execute(
      'SELECT photo FROM employees WHERE id = ?',
      [id]
    );

    if (existingRows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const existingPhoto = existingRows[0].photo;

    // Destructure fields from request body
    const {
      name,
      designation,
      level,
      email,
      age,
      identity_id,
      contact_number,
      house_address,
      date_of_birth,
      team_name,
      reporting_manager_id,
      reporting_manager,
      father_name,
      mother_name,
      joining_date,
      current_project,
      appraisal_points,
      leaves
    } = req.body;

    // Handle optional new photo
    const photo = req.file ? req.file.filename : existingPhoto;

    const updated_at = new Date();
    const leavesJSON = leaves ? JSON.stringify(leaves) : null;

    const updateQuery = `
      UPDATE employees
      SET name = ?, designation = ?, level = ?, email = ?, age = ?, identity_id = ?, 
          photo = ?, contact_number = ?, house_address = ?, date_of_birth = ?, 
          team_name = ?, reporting_manager = ?, reporting_manager_id = ?, 
          father_name = ?, mother_name = ?, joining_date = ?, current_project = ?, 
          appraisal_points = ?, updated_at = ?, leaves = ?
      WHERE id = ?
    `;

    const values = [
      name,
      designation,
      level,
      email,
      age || null,
      identity_id || null,
      photo,
      contact_number || null,
      house_address || null,
      date_of_birth || null,
      team_name || null,
      reporting_manager || null,
      reporting_manager_id || null,
      father_name || null,
      mother_name || null,
      joining_date || null,
      current_project || null,
      appraisal_points || 0,
      updated_at,
      leavesJSON,
      id
    ];

    await pool.execute(updateQuery, values);

    res.json({ message: 'Employee updated successfully' });

  } catch (error) {
    console.error('Edit Employee Error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
},

};

module.exports = employeeController;
