const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const pool = require('../config/db');

module.exports = {
  processLeaveDays: async () => {
    try {
      const today = moment().format('YYYY-MM-DD');
      
      const [leaves] = await pool.query(
        `SELECT l.employee_id, l.leave_type, e.team_name
         FROM leave_records l
         JOIN employees e ON l.employee_id = e.id
         WHERE ? BETWEEN l.start_date AND l.end_date
           AND l.status = 'approved'
           AND e.deleted_at IS NULL`,
        [today]
      );

      for (const leave of leaves) {
        const [existing] = await pool.query(
          'SELECT id FROM attendance WHERE employee_id = ? AND date = ?',
          [leave.employee_id, today]
        );

        if (!existing.length) {
          await pool.query(
            `INSERT INTO attendance SET ?`,
            [{
              id: uuidv4(),
              employee_id: leave.employee_id,
              date: today,
              status: 'on-leave',
              team_name: leave.team_name,
              is_leave_day: true,
              leave_type: leave.leave_type
            }]
          );
        }
      }
      
      console.log(`Processed ${leaves.length} leave records for ${today}`);
    } catch (err) {
      console.error('Leave processing error:', err);
    }
  }
};