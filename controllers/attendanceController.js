const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const attendanceService = require('./services/attendanceService');
const pool = require('../config/db');

module.exports = {



checkIn: async (req, res) => {
  try {
    const { employeeId, latitude, longitude } = req.body;
    const photoPath = req.file?.path;
    const today = moment().format('YYYY-MM-DD');
    const currentTime = moment().format('HH:mm:ss');

    // 1. Get employee
    const [employeeRows] = await pool.query(
      `SELECT id, team_name FROM employees WHERE id = ? AND deleted_at IS NULL`,
      [employeeId]
    );

    if (employeeRows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const employee = employeeRows[0];

    // 2. Check approved leave
    const [leaveRows] = await pool.query(
      `SELECT leave_type FROM leave_records 
       WHERE employee_id = ? 
         AND ? BETWEEN start_date AND end_date
         AND status = 'approved'`,
      [employeeId, today]
    );

    if (leaveRows.length > 0) {
      return res.status(400).json({
        error: 'Cannot check in during approved leave',
        leave_type: leaveRows[0].leave_type
      });
    }

    // 3. Get global leave settings (no team_name involved)
    const [settingsRows] = await pool.query(
      `SELECT working_days, late_threshold_minutes FROM leave_settings LIMIT 1`
    );

    let workingDays;
    let lateThreshold = 15;

    try {
      const settings = settingsRows[0];
      workingDays = settings?.working_days
        ? JSON.parse(settings.working_days)
        : [1, 2, 3, 4, 5]; // Mon–Fri default
      if (!Array.isArray(workingDays)) throw new Error();
      lateThreshold = settings?.late_threshold_minutes ?? 15;
    } catch {
      workingDays = [1, 2, 3, 4, 5];
      lateThreshold = 15;
    }

    // 4. Check if today is a working day
    const todayWeekday = moment().isoWeekday();
    if (!workingDays.includes(todayWeekday)) {
      return res.status(400).json({
        error: 'Today is not a working day',
        working_days: workingDays.map(d => moment().isoWeekday(d).format('ddd'))
      });
    }

    // 5. Check if already checked in
    const [existingRows] = await pool.query(
      'SELECT id FROM attendance WHERE employee_id = ? AND date = ?',
      [employeeId, today]
    );

    if (existingRows.length > 0) {
      return res.status(400).json({ error: 'Already checked in today' });
    }

    // 6. Determine status
    const lateTime = moment().set({ hour: 9, minute: lateThreshold, second: 0 });
    const status = moment().isAfter(lateTime) ? 'late' : 'present';

    // 7. Insert attendance
    const attendanceId = uuidv4();
    await pool.query(
      `INSERT INTO attendance (
        id, employee_id, date, check_in, status,
        check_in_photo, check_in_latitude, check_in_longitude, team_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        attendanceId,
        employeeId,
        today,
        currentTime,
        status,
        photoPath,
        latitude,
        longitude,
        employee.team_name
      ]
    );

    // 8. Response
    res.status(201).json({
      message: 'Checked in successfully',
      check_in: {
        time: currentTime,
        date: today,
        status,
        photo: photoPath,
        coordinates: { latitude, longitude }
      }
    });

  } catch (err) {
    console.error('Check-in error:', err);
    res.status(500).json({ 
      error: 'Server error',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
}
,
checkOut: async (req, res) => {
  try {
    const { employeeId, latitude, longitude } = req.body;
    const photoPath = req.file?.path;
    const today = moment().format('YYYY-MM-DD');
    const currentTime = moment().format('HH:mm:ss');

    // 1. Verify employee
    const [employeeRows] = await pool.query(
      `SELECT id, team_name FROM employees WHERE id = ? AND deleted_at IS NULL`,
      [employeeId]
    );

    if (employeeRows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const employee = employeeRows[0];

    // 2. Check existing attendance with check-in but no check-out
    const [attendanceRows] = await pool.query(
      `SELECT id, check_in FROM attendance 
       WHERE employee_id = ? AND date = ? AND check_out IS NULL`,
      [employeeId, today]
    );

    if (attendanceRows.length === 0) {
      return res.status(400).json({ error: 'No check-in record found or already checked out' });
    }

    const attendance = attendanceRows[0];

    // 3. Get global working hours and overtime settings
    const [settingsRows] = await pool.query(
      `SELECT working_hours, overtime_threshold FROM leave_settings LIMIT 1`
    );

    let workingStart = moment(`${today} 09:00:00`);
    let workingEnd = moment(`${today} 17:00:00`);
    let overtimeThreshold = 60;

    if (settingsRows.length > 0) {
      const settings = settingsRows[0];

      if (typeof settings.working_hours === 'string' && settings.working_hours.includes('-')) {
        const [startStr, endStr] = settings.working_hours.split('-');
        if (startStr && endStr) {
          workingStart = moment(`${today} ${startStr}`);
          workingEnd = moment(`${today} ${endStr}`);
        }
      }

      if (typeof settings.overtime_threshold === 'number') {
        overtimeThreshold = settings.overtime_threshold;
      }
    }

    // 4. Determine check-out status
    const checkOutMoment = moment(`${today} ${currentTime}`);
    let status = 'left_on_time';

    if (checkOutMoment.isAfter(workingEnd.clone().add(overtimeThreshold, 'minutes'))) {
      status = 'overtime';
    } else if (checkOutMoment.isBefore(workingEnd)) {
      status = 'left_early';
    }

    // 5. Update attendance with check-out info
    await pool.query(
      `UPDATE attendance SET 
         check_out = ?, 
         check_out_photo = ?, 
         check_out_latitude = ?, 
         check_out_longitude = ?, 
         status = ?
       WHERE id = ?`,
      [
        currentTime,
        photoPath,
        latitude,
        longitude,
        status,
        attendance.id
      ]
    );

    // 6. Respond
    res.status(200).json({
      message: 'Checked out successfully',
      check_out: {
        time: currentTime,
        date: today,
        status,
        photo: photoPath,
        coordinates: { latitude, longitude }
      }
    });

  } catch (err) {
    console.error('Check-out error:', err);
    res.status(500).json({
      error: 'Server error',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
},

// Get all attendance records (with optional filters)
getAttendanceRecords: async (req, res) => {
  try {
    const { date, team, status } = req.query;

    // Start query with join to get employee name and photo
    let query = `
      SELECT 
        a.*, 
        e.name AS employee_name, 
        e.photo AS employee_photo
      FROM attendance a
      JOIN employees e ON a.employee_id = e.id
    `;

    const params = [];
    const conditions = [];

    // Apply filters if provided
    if (date) {
      conditions.push('a.date = ?');
      params.push(date);
    }

    if (team) {
      conditions.push('a.team_name = ?');
      params.push(team);
    }

    if (status) {
      conditions.push('a.status = ?');
      params.push(status);
    }

    // If any filters exist, append WHERE clause
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY a.date DESC';

    const [records] = await pool.query(query, params);

    res.status(200).json(records);
  } catch (err) {
    console.error('Get attendance error:', err);
    res.status(500).json({ error: 'Failed to fetch attendance records' });
  }
},

// Get specific employee's attendance


getEmployeeAttendance: async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { startDate, endDate } = req.query;

    // Fetch employee details
    const [employeeDetails] = await pool.query(
      `SELECT name AS employee_name, photo AS employee_photo, designation FROM employees WHERE id = ?`,
      [employeeId]
    );

    if (employeeDetails.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const { employee_name, employee_photo, designation } = employeeDetails[0];

    // Attendance history
    let query = 'SELECT * FROM attendance WHERE employee_id = ?';
    const params = [employeeId];

    if (startDate && endDate) {
      query += ' AND date BETWEEN ? AND ?';
      params.push(startDate, endDate);
    }

    query += ' ORDER BY date DESC';
    const [records] = await pool.query(query, params);

    // Week and month range
    const startOfWeek = moment().startOf('isoWeek').format('YYYY-MM-DD');
    const endOfWeek = moment().endOf('isoWeek').format('YYYY-MM-DD');
    const startOfMonth = moment().startOf('month').format('YYYY-MM-DD');
    const endOfMonth = moment().endOf('month').format('YYYY-MM-DD');

    // Weekly data
    const [weeklyData] = await pool.query(
      `SELECT * FROM attendance WHERE employee_id = ? AND date BETWEEN ? AND ?`,
      [employeeId, startOfWeek, endOfWeek]
    );

    // Monthly data
    const [monthlyData] = await pool.query(
      `SELECT * FROM attendance WHERE employee_id = ? AND date BETWEEN ? AND ?`,
      [employeeId, startOfMonth, endOfMonth]
    );

    // Monthly stats
    let presentDays = 0;
    let leaveDays = 0;
    let absentDays = 0;
    let totalOvertime = 0;

    monthlyData.forEach(record => {
      if (record.status === 'Present') presentDays++;
      else if (record.status === 'Leave') leaveDays++;
      else if (record.status === 'Absent') absentDays++;

      if (record.overtime_hours) {
        totalOvertime += parseFloat(record.overtime_hours);
      }
    });

    const totalWorkingDays = presentDays + leaveDays + absentDays;
    const attendancePercentage = totalWorkingDays > 0
      ? ((presentDays / totalWorkingDays) * 100).toFixed(2)
      : '0.00';

    res.status(200).json({
      employee: {
        employeeId,
        name: employee_name,
        photo: employee_photo,
        designation
      },
      history: records,
      summary: {
        weekly: {
          days: weeklyData.length,
          records: weeklyData
        },
        monthly: {
          presentDays,
          leaveDays,
          absentDays,
          totalWorkingDays,
          attendancePercentage: `${attendancePercentage}%`,
          totalOvertimeHours: totalOvertime
        }
      }
    });

  } catch (err) {
    console.error('Get employee attendance error:', err);
    res.status(500).json({ error: 'Failed to fetch employee attendance' });
  }
},

// Get team attendance

getTeamAttendance: async (req, res) => {
  try {
    const { teamName } = req.params;
    const { date } = req.query;

    // Get team members and their attendance records
    let query = `
      SELECT a.*, e.name as employee_name, e.photo as employee_photo, e.designation, e.team_name
      FROM attendance a
      JOIN employees e ON a.employee_id = e.id
      WHERE e.team_name = ?
    `;
    const params = [teamName];

    if (date) {
      query += ' AND a.date = ?';
      params.push(date);
    }

    query += ' ORDER BY a.date DESC, e.name ASC';

    const [records] = await pool.query(query, params);

    // Group records by employee ID
    const employeeMap = {};
    records.forEach((r) => {
      if (!employeeMap[r.employee_id]) {
        employeeMap[r.employee_id] = [];
      }
      employeeMap[r.employee_id].push(r);
    });

    const startOfWeek = moment().startOf('isoWeek').format('YYYY-MM-DD');
    const endOfWeek = moment().endOf('isoWeek').format('YYYY-MM-DD');
    const startOfMonth = moment().startOf('month').format('YYYY-MM-DD');
    const endOfMonth = moment().endOf('month').format('YYYY-MM-DD');

    const teamSummary = [];

    for (const employeeId of Object.keys(employeeMap)) {
      const firstRecord = employeeMap[employeeId][0];
      const name = firstRecord?.employee_name;
      const photo = firstRecord?.employee_photo;
      const designation = firstRecord?.designation;

      // Fetch weekly data
      const [weeklyData] = await pool.query(
        `SELECT * FROM attendance WHERE employee_id = ? AND date BETWEEN ? AND ?`,
        [employeeId, startOfWeek, endOfWeek]
      );

      // Fetch monthly data
      const [monthlyData] = await pool.query(
        `SELECT * FROM attendance WHERE employee_id = ? AND date BETWEEN ? AND ?`,
        [employeeId, startOfMonth, endOfMonth]
      );

      let presentDays = 0;
      let leaveDays = 0;
      let absentDays = 0;
      let totalOvertime = 0;

      monthlyData.forEach(record => {
        if (record.status === 'Present') presentDays++;
        else if (record.status === 'Leave') leaveDays++;
        else if (record.status === 'Absent') absentDays++;

        if (record.overtime_hours) {
          totalOvertime += parseFloat(record.overtime_hours);
        }
      });

      const totalWorkingDays = presentDays + leaveDays + absentDays;
      const attendancePercentage = totalWorkingDays > 0
        ? ((presentDays / totalWorkingDays) * 100).toFixed(2)
        : '0.00';

      teamSummary.push({
        employee_id: employeeId,
        name,
        photo,  // Added photo here
        designation,
        weekly: {
          days: weeklyData.length,
        },
        monthly: {
          presentDays,
          leaveDays,
          absentDays,
          totalWorkingDays,
          attendancePercentage: `${attendancePercentage}%`,
          totalOvertimeHours: totalOvertime
        }
      });
    }

    res.status(200).json({ summary: teamSummary });

  } catch (err) {
    console.error('Get team attendance error:', err);
    res.status(500).json({ error: 'Failed to fetch team attendance' });
  }
},


getAttendanceSummary: async (req, res) => {
  try {
    const today = moment().format('YYYY-MM-DD');

    // 1. Get all active employees
    const [allEmployees] = await pool.query(
      `SELECT id, name, photo, team_name FROM employees WHERE deleted_at IS NULL`
    );

    // 2. Get employee IDs who checked in today
    const [attendance] = await pool.query(
      `SELECT employee_id FROM attendance WHERE date = ?`,
      [today]
    );
    const presentIds = new Set(attendance.map(a => a.employee_id));

    // 3. Get employee IDs who are on approved leave today
    const [leaves] = await pool.query(
      `SELECT employee_id FROM leave_records 
       WHERE status = 'approved' AND ? BETWEEN start_date AND end_date`,
      [today]
    );
    const onLeaveIds = new Set(leaves.map(l => l.employee_id));

    // 4. Categorize employees
    const presentEmployees = [];
    const leaveEmployees = [];
    const absentEmployees = [];

    for (const emp of allEmployees) {
      if (presentIds.has(emp.id)) {
        presentEmployees.push(emp);
      } else if (onLeaveIds.has(emp.id)) {
        leaveEmployees.push(emp);
      } else {
        absentEmployees.push(emp);
      }
    }

    // 5. Return summary
    res.status(200).json({
      totalEmployees: allEmployees.length,
      totalPresent: presentEmployees.length,
      totalOnLeave: leaveEmployees.length,
      totalAbsent: absentEmployees.length,
      presentEmployees,
      leaveEmployees,
      absentEmployees,
      allEmployees
    });

  } catch (err) {
    console.error('Attendance summary error:', err);
    res.status(500).json({ error: 'Server error' });
  }
},

getAttendanceSummaryAll: async (req, res) => {
  try {
    const { period = 'month', employeeId } = req.query;
    const today = moment();

    let startDate;
    if (period === 'week') {
      startDate = today.clone().startOf('isoWeek').format('YYYY-MM-DD');
    } else {
      startDate = today.clone().startOf('month').format('YYYY-MM-DD');
    }
    const endDate = today.format('YYYY-MM-DD');

    // 1. Get active employees
    let employeeQuery = `SELECT id, name, team_name, photo FROM employees WHERE deleted_at IS NULL`;
    const params = [];

    if (employeeId) {
      employeeQuery += ' AND id = ?';
      params.push(employeeId);
    }

    const [employees] = await pool.query(employeeQuery, params);

    if (employees.length === 0) {
      return res.status(404).json({ error: 'No employees found' });
    }

    // 2. Get working days
    const [settingsRows] = await pool.query(`SELECT working_days FROM leave_settings LIMIT 1`);
    let workingDays = [1, 2, 3, 4, 5]; // Mon–Fri default

    if (settingsRows.length > 0 && settingsRows[0].working_days) {
      try {
        const parsed = JSON.parse(settingsRows[0].working_days);
        if (Array.isArray(parsed)) workingDays = parsed;
      } catch {}
    }

    // 3. Loop through employees and build summary
    const summary = [];

    for (const emp of employees) {
      // Get attendance
      const [attendance] = await pool.query(
        `SELECT date, status FROM attendance WHERE employee_id = ? AND date BETWEEN ? AND ?`,
        [emp.id, startDate, endDate]
      );

      // Count only present or late as present
      const presentDays = attendance.filter(a => ['present', 'late'].includes(a.status)).length;

      // Calculate total working days in the range
      let totalWorkingDays = 0;
      let current = moment(startDate);
      const end = moment(endDate);

      while (current <= end) {
        if (workingDays.includes(current.isoWeekday())) {
          totalWorkingDays++;
        }
        current.add(1, 'day');
      }

      const presentPercentage = totalWorkingDays > 0 
        ? ((presentDays / totalWorkingDays) * 100).toFixed(2)
        : '0.00';

      summary.push({
        employee_id: emp.id,
        name: emp.name,
        team_name: emp.team_name,
        photo: emp.photo,
        period,
        startDate,
        endDate,
        total_working_days: totalWorkingDays,
        days_present: presentDays,
        present_percentage: `${presentPercentage}%`,
        attendance_records: attendance,
      });
    }

    res.status(200).json(summary);
  } catch (err) {
    console.error('Get all employee summary error:', err);
    res.status(500).json({ error: 'Failed to fetch attendance summary' });
  }
},

// Add this to your existing attendanceController.js file

  getTodayPresentEmployeesByTeam: async (req, res) => {
    try {
      const today = moment().format('YYYY-MM-DD');

      // 1. Get present employees grouped by team
      const [presentEmployees] = await pool.query(`
        SELECT 
          e.team_name,
          JSON_ARRAYAGG(
            JSON_OBJECT(
              'id', e.id,
              'name', e.name,
              'photo', e.photo,
              'designation', e.designation,
              'check_in', a.check_in,
              'check_out', a.check_out,
              'status', a.status,
              'check_in_photo', a.check_in_photo,
              'check_out_photo', a.check_out_photo
            )
          ) AS employees
        FROM attendance a
        JOIN employees e ON a.employee_id = e.id
        WHERE a.date = ?
        GROUP BY e.team_name
        ORDER BY e.team_name ASC
      `, [today]);

      // 2. Format present employees
      const formattedResult = presentEmployees.map(team => {
        const employees = typeof team.employees === 'string'
          ? JSON.parse(team.employees)
          : team.employees;

        return {
          team_name: team.team_name,
          employees,
          count: employees.length
        };
      });

      // 3. Get all active employees grouped by team
      const [allEmployeesByTeam] = await pool.query(`
        SELECT 
          team_name,
          COUNT(*) AS total
        FROM employees
        WHERE deleted_at IS NULL
        GROUP BY team_name
        ORDER BY team_name ASC
      `);

      // 4. Get employees on leave today grouped by team
      const [onLeaveEmployees] = await pool.query(`
        SELECT 
          e.team_name,
          JSON_ARRAYAGG(
            JSON_OBJECT(
              'id', e.id,
              'name', e.name,
              'photo', e.photo,
              'designation', e.designation,
              'leave_type', l.leave_type,
              'start_date', l.start_date,
              'end_date', l.end_date
            )
          ) AS employees
        FROM leave_records l
        JOIN employees e ON l.employee_id = e.id
        WHERE ? BETWEEN l.start_date AND l.end_date
          AND l.status = 'approved'
          AND e.deleted_at IS NULL
        GROUP BY e.team_name
        ORDER BY e.team_name ASC
      `, [today]);

      // 5. Format leave employees
      const formattedLeaveResult = onLeaveEmployees.map(team => {
        const employees = typeof team.employees === 'string'
          ? JSON.parse(team.employees)
          : team.employees;

        return {
          team_name: team.team_name,
          employees,
          count: employees.length
        };
      });

      // 6. Generate summary by team
      const teamSummaries = allEmployeesByTeam.map(team => {
        const presentTeam = formattedResult.find(t => t.team_name === team.team_name);
        const leaveTeam = formattedLeaveResult.find(t => t.team_name === team.team_name);

        return {
          team_name: team.team_name,
          total_employees: team.total,
          present_count: presentTeam ? presentTeam.count : 0,
          leave_count: leaveTeam ? leaveTeam.count : 0,
          present_percentage: team.total
            ? ((presentTeam?.count || 0) / team.total * 100).toFixed(2) + '%'
            : '0%',
          leave_percentage: team.total
            ? ((leaveTeam?.count || 0) / team.total * 100).toFixed(2) + '%'
            : '0%'
        };
      });

      // 7. Overall summary
      const total_employees = allEmployeesByTeam.reduce((sum, t) => sum + t.total, 0);
      const total_present = formattedResult.reduce((sum, t) => sum + t.count, 0);
      const total_on_leave = formattedLeaveResult.reduce((sum, t) => sum + t.count, 0);

      // 8. Final response
      res.status(200).json({
        date: today,
        by_team: {
          present: formattedResult,
          on_leave: formattedLeaveResult,
          summary: teamSummaries
        },
        overall_summary: {
          total_employees,
          total_present,
          total_on_leave
        }
      });

    } catch (err) {
      console.error('Get today present employees by team error:', err);
      res.status(500).json({
        error: 'Failed to fetch today present employees by team',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
      });
    }
  }

,

};