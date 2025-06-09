const pool = require('../../config/db');
const moment = require('moment');

module.exports = {
  getTeamSettings: async (teamName) => {
    const [settings] = await pool.query(
      `SELECT working_hours, working_days, late_threshold_minutes, overtime_threshold 
       FROM leave_settings WHERE team_name = ?`, 
      [teamName]
    );
    return settings[0] || {
      working_hours: 8,
      working_days: '[1,2,3,4,5]',
      late_threshold_minutes: 15,
      overtime_threshold: 1
    };
  },

  checkLeaveStatus: async (employeeId, date) => {
    const [leave] = await pool.query(
      `SELECT leave_type FROM leave_records 
       WHERE employee_id = ? AND ? BETWEEN start_date AND end_date AND status = 'approved'`,
      [employeeId, date]
    );
    return leave[0];
  },

  createAttendanceRecord: async (record) => {
    const result = await pool.query(
      `INSERT INTO attendance SET ?`, 
      [record]
    );
    return result;
  },

  updateAttendanceRecord: async (id, updates) => {
    const result = await pool.query(
      `UPDATE attendance SET ? WHERE id = ?`,
      [updates, id]
    );
    return result;
  },

  getEmployeeAttendance: async (employeeId, startDate, endDate) => {
    const [records] = await pool.query(
      `SELECT * FROM attendance 
       WHERE employee_id = ? AND date BETWEEN ? AND ? 
       ORDER BY date`,
      [employeeId, startDate, endDate]
    );
    return records;
  }
};