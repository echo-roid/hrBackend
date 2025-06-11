const pool = require('../config/db');
const bcrypt = require('bcrypt');
const crypto = require('crypto');  // <-- add this line!

const jwt = require('jsonwebtoken');
const path = require('path');

const authController = {
  login: async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ 
          success: false,
          error: 'Email and password are required' 
        });
      }

      const [employees] = await pool.execute(
        'SELECT * FROM employees WHERE email = ?',
        [email]
      );

      if (employees.length === 0) {
        return res.status(401).json({ 
          success: false,
          error: 'Invalid credentials' 
        });
      }

      const employee = employees[0];
      const isPasswordValid = await bcrypt.compare(password, employee.password);
      
      if (!isPasswordValid) {
        return res.status(401).json({ 
          success: false,
          error: 'Invalid credentials' 
        });
      }

      // Create tokens
      const accessToken = jwt.sign(
        { 
          id: employee.id,
          email: employee.email,
          level: employee.level,
          designation: employee.designation
        },
        process.env.JWT_SECRET,
        { expiresIn: '15m' }
      );

      const refreshToken = jwt.sign(
        { email: employee.email },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: '7d' }
      );

      // Set refreshToken as HTTP-only cookie
      res.cookie('jwt', refreshToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'None',
        maxAge: 7 * 24 * 60 * 60 * 1000
      });

      // Prepare response without password
      const { password: _, ...employeeData } = employee;
      employeeData.photo = employeeData.photo
        ? `${req.protocol}://${req.get('host')}/uploads/${path.basename(employeeData.photo)}`
        : null;

      res.json({
        success: true,
        accessToken,
        employee: employeeData
      });

    } catch (error) {
      console.error('Login Error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Internal server error' 
      });
    }
  },

  refresh: (req, res) => {
    const cookies = req.cookies;
    if (!cookies?.jwt) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const refreshToken = cookies.jwt;

    jwt.verify(
      refreshToken,
      process.env.JWT_REFRESH_SECRET,
      async (err, decoded) => {
        if (err) return res.status(403).json({ success: false, error: 'Forbidden' });

        const [employees] = await pool.execute(
          'SELECT id, email, level, designation FROM employees WHERE email = ?',
          [decoded.email]
        );

        if (employees.length === 0) {
          return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        const employee = employees[0];
        const accessToken = jwt.sign(
          {
            id: employee.id,
            email: employee.email,
            level: employee.level,
            designation: employee.designation
          },
          process.env.JWT_SECRET,
          { expiresIn: '15m' }
        );

        res.json({ success: true, accessToken });
      }
    );
  },

  logout: (req, res) => {
    const cookies = req.cookies;
    if (!cookies?.jwt) return res.sendStatus(204); // No content
    res.clearCookie('jwt', {
      httpOnly: true,
      secure: true,
      sameSite: 'None'
    });
    res.json({ success: true, message: 'Logout successful' });
  },

  getProfile: async (req, res) => {
    try {
      const [employees] = await pool.execute(
        `SELECT 
          id, name, designation, level, email, age, identity_id, 
          photo, contact_number, house_address, date_of_birth, 
          team_name, reporting_manager, total_leave, sick_leave, 
          vacation_leave, father_name, mother_name, joining_date, 
          current_project, appraisal_points
         FROM employees 
         WHERE id = ?`,
        [req.employee.id]
      );

      if (employees.length === 0) {
        return res.status(404).json({ success: false, error: 'Employee not found' });
      }

      const employee = employees[0];
      employee.photo = employee.photo
        ? `${req.protocol}://${req.get('host')}/uploads/${path.basename(employee.photo)}`
        : null;

      res.json({ success: true, employee });
    } catch (error) {
      console.error('Get Profile Error:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  },
  forgotPassword: async (req, res) => {
  try {
    const { email } = req.body;
    console.log(email, "Requested for password reset");

    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    const [employees] = await pool.execute(
      'SELECT id FROM employees WHERE email = ?',
      [email]
    );

    if (employees.length === 0) {
      return res.status(404).json({ success: false, error: 'No user found with that email' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiration = new Date(Date.now() + 3600000); // 1 hour

    await pool.execute(
      'UPDATE employees SET reset_token = ?, reset_token_expiration = ? WHERE email = ?',
      [token, expiration, email]
    );

    const resetLink = `${req.protocol}://${req.get('host')}/reset-password/${token}`;

    // For development: log and send the token/link in response
    console.log(`🔗 Reset password link: ${resetLink}`);

    res.json({
      success: true,
      message: 'Password reset link sent to your email (simulated)',
      token,        // 🔐 Expose token for dev/testing
      resetLink     // 🌐 Optional: full link in response
    });

  } catch (error) {
    console.error('Forgot Password Error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
,

resetPassword: async (req, res) => {
  try {
    const { token } = req.params;
    const { newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ success: false, error: 'Token and new password are required' });
    }

    const [employees] = await pool.execute(
      'SELECT * FROM employees WHERE reset_token = ? AND reset_token_expiration > NOW()',
      [token]
    );

    if (employees.length === 0) {
      return res.status(400).json({ success: false, error: 'Invalid or expired token' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await pool.execute(
      'UPDATE employees SET password = ?, reset_token = NULL, reset_token_expiration = NULL WHERE reset_token = ?',
      [hashedPassword, token]
    );

    res.json({ success: true, message: 'Password reset successful' });

  } catch (error) {
    console.error('Reset Password Error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
},


};

module.exports = authController;