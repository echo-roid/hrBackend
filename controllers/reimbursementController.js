const pool = require('../config/db'); // Adjust path as needed

const reimbursementController = {
  // Create new reimbursement
  // Create multiple reimbursements (one per invoice)
  createReimbursement: async (req, res) => {
    const {
      employee_id,
      submission_date,
      manager_id,
      team_name,
      invoices
    } = req.body;
  
    const connection = await pool.getConnection();
  
    try {
      await connection.beginTransaction();
  
      // Calculate total amount from invoices
      const totalAmount = invoices.reduce((sum, invoice) => {
        return sum + parseFloat(invoice.amount || 0);
      }, 0);
  
      // Insert into reimbursements table
      const [reimbursementResult] = await connection.query(
        `INSERT INTO reimbursements 
          (employee_id, amount, submission_date, manager_id, team_name)
         VALUES (?, ?, ?, ?, ?)`,
        [employee_id, totalAmount, submission_date, manager_id, team_name]
      );
  
      const reimbursementId = reimbursementResult.insertId;
  
      // Insert each invoice into reimbursement_invoices
      for (const invoice of invoices) {
        const {
          amount,
          category,
          description,
          receipt_url,
          travelType,
          location,
          kilometers,
        } = invoice;
  
        await connection.query(
          `INSERT INTO reimbursement_invoices 
            (reimbursement_id, amount, category, description, receipt_url, travel_type, location, kilometers)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            reimbursementId,
            amount,
            category,
            description,
            receipt_url || null,
            travelType || null,
            travelType === 'own' ? location : null,
            travelType === 'own' ? kilometers : null
          ]
        );
      }
  
      await connection.commit();
      res.status(201).json({ message: 'Reimbursement submitted successfully' });
  
    } catch (error) {
      await connection.rollback();
      console.error('Create reimbursement error:', error);
      res.status(500).json({ error: 'Failed to create reimbursement' });
    } finally {
      connection.release();
    }
  },
  
  
  

  // Get all reimbursements
  getAllReimbursements: async (req, res) => {
    try {
      const [reimbursements] = await pool.query(
        `SELECT r.*, 
                e.name AS employee_name, 
                a.name AS approver_name,
                m.name AS manager_name
         FROM reimbursements r
         LEFT JOIN employees e ON r.employee_id = e.id
         LEFT JOIN employees a ON r.approved_by = a.id
         LEFT JOIN employees m ON r.manager_id = m.id
         ORDER BY r.submission_date DESC`
      );
  
      // Fetch invoices in one query
      const [invoices] = await pool.query(
        `SELECT * FROM reimbursement_invoices`
      );
  
      // Group invoices under each reimbursement
      const reimbursementsWithInvoices = reimbursements.map((r) => ({
        ...r,
        invoices: invoices.filter((inv) => inv.reimbursement_id === r.id),
      }));
  
      res.json(reimbursementsWithInvoices);
    } catch (error) {
      console.error('Fetch reimbursements error:', error);
      res.status(500).json({ error: 'Failed to fetch reimbursements' });
    }
  }  
  ,
  
  

  // Approve or reject reimbursement
  updateReimbursementStatus: async (req, res) => {
    const { id } = req.params;
    const { status, approved_by, approval_date } = req.body;
  
    try {
      const [result] = await pool.query(
        `UPDATE reimbursements
         SET status = ?, approved_by = ?, approval_date = ?
         WHERE id = ?`,
        [status, approved_by, approval_date, id]
      );
  
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Reimbursement not found' });
      }
  
      res.json({ message: 'Reimbursement status updated' });
    } catch (error) {
      console.error('Update status error:', error);
      res.status(500).json({ error: 'Failed to update reimbursement status' });
    }
  }
  
  ,
  // Get reimbursements by employee ID
  getReimbursementsByEmployeeId: async (req, res) => {
    const { employeeId } = req.params;
  
    try {
      const [reimbursements] = await pool.query(
        `SELECT r.*, 
                e.name AS employee_name, 
                a.name AS approver_name,
                m.name AS manager_name
         FROM reimbursements r
         LEFT JOIN employees e ON r.employee_id = e.id
         LEFT JOIN employees a ON r.approved_by = a.id
         LEFT JOIN employees m ON r.manager_id = m.id
         WHERE r.employee_id = ?
         ORDER BY r.submission_date DESC`,
        [employeeId]
      );
  
      const [invoices] = await pool.query(
        `SELECT * FROM reimbursement_invoices`
      );
  
      const result = reimbursements.map((r) => ({
        ...r,
        invoices: invoices.filter((inv) => inv.reimbursement_id === r.id),
      }));
  
      res.json(result);
    } catch (error) {
      console.error('Fetch reimbursements by employee error:', error);
      res.status(500).json({ error: 'Failed to fetch reimbursements for employee' });
    }
  }   ,


getUserNotifications: async (req, res) => {
    const { userId, role } = req.params;

    try {
      if (role === 'manager') {
        // Manager: Pending reimbursements
        const [pendingReimbursements] = await pool.query(
          `SELECT r.*, e.name AS employee_name
           FROM reimbursements r
           LEFT JOIN employees e ON r.employee_id = e.id
           WHERE r.manager_id = ? AND r.status = 'pending'
           ORDER BY r.submission_date DESC`,
          [userId]
        );

        return res.json({
          role: 'manager',
          pendingReimbursements
        });

      } else if (role === 'employee') {
        // Employee: Approved/rejected reimbursements
        const [statusUpdates] = await pool.query(
          `SELECT r.*, m.name AS manager_name
           FROM reimbursements r
           LEFT JOIN employees m ON r.manager_id = m.id
           WHERE r.employee_id = ? AND r.status IN ('approved', 'rejected')
           ORDER BY r.approval_date DESC`,
          [userId]
        );

        return res.json({
          role: 'employee',
          reimbursementUpdates: statusUpdates
        });
      } else {
        return res.status(400).json({ error: 'Invalid role provided' });
      }

    } catch (error) {
      console.error('Get user notifications error:', error);
      res.status(500).json({ error: 'Failed to fetch notifications' });
    }
  },

  
};

module.exports = reimbursementController;
