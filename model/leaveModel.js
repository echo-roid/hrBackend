const pool = require('../config/db');
const path = require('path');
module.exports = {
    async getEmployeeLeaveInfo(employeeId) {
        const [employee] = await pool.execute(
            `SELECT e.*, 
              lb.vacation_leave_remaining, lb.sick_leave_remaining,
              (SELECT COUNT(*) FROM leave_requests lr 
               WHERE lr.employee_id = e.id AND lr.status = 'approved' 
               AND YEAR(lr.start_date) = YEAR(CURDATE())) AS leaves_taken_this_year
       FROM employees e
       LEFT JOIN leave_balances lb ON e.id = lb.employee_id AND lb.year = YEAR(CURDATE())
       WHERE e.id = ?`,
            [employeeId]
        );
        return employee[0];
    },

    async createLeaveRequest(employeeId, leaveData) {
        const { managerId, leave_type_id, start_date, end_date, reason, medical_certificate, contact } = leaveData;
        const [result] = await pool.execute(
            `INSERT INTO leave_requests 
       (employee_id, manager_id, leave_type_id, start_date, end_date, reason, medical_certificate, contact_during_leave)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [employeeId, managerId, leave_type_id, start_date, end_date, reason, medical_certificate || null, contact]
        );
        return result.insertId;
    },

    async approveLeaveRequest(requestId, managerId, comments) {
        await pool.query('START TRANSACTION');
        try {
            // Update request status
            await pool.execute(
                `UPDATE leave_requests 
             SET status = 'approved', 
                 approved_by = ?,
                 approval_comments = ?,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
                [managerId, comments, requestId]
            );

            // Get request details
            const [request] = await pool.execute(
                `SELECT employee_id, leave_type_id, days_requested 
             FROM leave_requests WHERE id = ?`,
                [requestId]
            );

            // Get leave type
            const [leaveTypeRows] = await pool.execute(
                `SELECT name FROM leave_types WHERE id = ?`,
                [request[0].leave_type_id]
            );

            let balanceField;
            const leaveTypeName = leaveTypeRows[0]?.name || '';

            if (leaveTypeName.includes('Sick')) {
                balanceField = 'sick_leave_used';
            } else if (leaveTypeName.includes('Annual')) {
                balanceField = 'vacation_leave_used';
            }

            // Update leave balance if applicable
            if (balanceField) {
                await pool.execute(
                    `UPDATE leave_balances 
               SET ${balanceField} = ${balanceField} + ?
               WHERE employee_id = ? AND year = YEAR(CURDATE())`,
                    [request[0].days_requested, request[0].employee_id]
                );
            }

            // ✅ Mark the notification as inactive so it doesn't show again
            await pool.execute(
                `UPDATE leave_notifications 
             SET is_active = FALSE 
             WHERE request_id = ?`,
                [requestId]
            );

            await pool.query('COMMIT');
            return true;

        } catch (error) {
            await pool.query('ROLLBACK');
            throw error;
        }
    }
    ,


    async getLeaveStatusList(options = {}, baseUrl) {
        try {
            let query = `
            SELECT 
              lr.id AS requestId,
              lr.employee_id,
              lr.start_date,
              lr.end_date,
              lr.reason,
              lr.status,
              lr.approval_comments,
              lr.created_at,
              lr.updated_at,
              lt.name AS leave_type,
              e.name AS employee_name,
              e.designation AS employee_designation,
              e.team_name AS employee_team,
              e.photo AS employee_photo,
              a.name AS approver_name,
              DATEDIFF(lr.end_date, lr.start_date) + 1 AS days_requested
            FROM leave_requests lr
            JOIN leave_types lt ON lr.leave_type_id = lt.id
            JOIN employees e ON lr.employee_id = e.id
            LEFT JOIN employees a ON lr.approved_by = a.id
            WHERE 1=1
        `;

            const params = [];

            if (options.employeeId) {
                query += ' AND lr.employee_id = ?';
                params.push(options.employeeId);
            }

            if (options.status) {
                query += ' AND lr.status = ?';
                params.push(options.status);
            }

            if (options.year) {
                query += ' AND YEAR(lr.start_date) = ?';
                params.push(options.year);
            }

            if (options.leave_type_id) {
                query += ' AND lr.leave_type_id = ?';
                params.push(options.leave_type_id);
            }

            if (options.team_name) {
                query += ' AND e.team_name = ?';
                params.push(options.team_name);
            }

            if (options.start_date && options.end_date) {
                query += ' AND lr.start_date BETWEEN ? AND ?';
                params.push(options.start_date, options.end_date);
            }

            query += ' ORDER BY lr.start_date DESC';

            const [leaves] = await pool.execute(query, params);

            return leaves.map(leave => ({
                requestId: leave.requestId,
                employee_id: leave.employee_id,
                employee_name: leave.employee_name,
                employee_designation: leave.employee_designation,
                employee_team: leave.employee_team,
                approver_name: leave.approver_name,
                leave_type: leave.leave_type,
                status: leave.status,
                reason: leave.reason,
                approval_comments: leave.approval_comments,
                days_requested: leave.days_requested,
                start_date: formatDate(leave.start_date),
                end_date: formatDate(leave.end_date),
                created_at: formatDateTime(leave.created_at),
                updated_at: leave.updated_at ? formatDateTime(leave.updated_at) : null,
                employee_photo: leave.employee_photo
                    ? `${baseUrl}/uploads/${path.basename(leave.employee_photo)}`
                    : null
            }));
        } catch (error) {
            console.error('Error fetching leave status list:', error);
            throw error;
        }
    },

    async getEmployeeBasicInfo(employeeId) {
        const [rows] = await pool.execute(`
          SELECT id, name, email, designation, photo FROM employees WHERE id = ?
        `, [employeeId]);
        return rows[0];
    },
    // Save notification to DB
    async createLeaveNotification({ managerId, employeeId, message, date, requestId }) {

        return await pool.execute(
            `INSERT INTO leave_notifications (manager_id, employee_id, message, created_at, request_id) VALUES (?, ?, ?, ?, ?)`,
            [managerId, employeeId, message, date, requestId]
        );
    },

    async getLeaveNotifications(managerId, req) {
        const [rows] = await pool.execute(
            `SELECT 
             ln.id,
             ln.message,
             ln.request_id,
             ln.manager_id,
             ln.created_at,
  
            e.name AS employee_name,
            e.photo AS employee_photo
            FROM leave_notifications ln
            JOIN employees e ON ln.employee_id = e.id
            WHERE ln.manager_id = ?
            AND ln.is_active = TRUE
            ORDER BY ln.created_at DESC`,
            [managerId]
        );

        const baseUrl = `${req.protocol}://${req.get('host')}/uploads/`;

        const updatedRows = rows.map((row) => ({
            ...row,
            employee_photo: row.employee_photo
                ? baseUrl + path.basename(row.employee_photo)
                : null
        }));

        return updatedRows;
    },
    async rejectLeaveRequest(requestId, managerId, comments) {
        await pool.execute(
            `UPDATE leave_requests 
           SET status = 'rejected', 
               approved_by = ?, 
               approval_comments = ?, 
               updated_at = CURRENT_TIMESTAMP 
           WHERE id = ?`,
            [managerId, comments, requestId]
        );

        // Mark notification inactive
        await pool.execute(
            `UPDATE leave_notifications 
           SET is_active = FALSE 
           WHERE request_id = ?`,
            [requestId]
        );
    },

    async cancelLeaveRequest(requestId, employeeId, reason) {
        await pool.execute(
            `UPDATE leave_requests 
           SET status = 'cancelled', 
               approval_comments = ?, 
               updated_at = CURRENT_TIMESTAMP 
           WHERE id = ? AND employee_id = ?`,
            [reason, requestId, employeeId]
        );

        // Mark notification inactive
        await pool.execute(
            `UPDATE leave_notifications 
           SET is_active = FALSE 
           WHERE request_id = ?`,
            [requestId]
        );
    },

    //   async autoCancelExpiredPendingLeaves() {
    //     return await pool.execute(`
    //       UPDATE leave_requests 
    //       SET 
    //         status = 'cancelled',
    //         approval_comments = 'Auto-cancelled: Start date passed without approval',
    //         updated_at = CURRENT_TIMESTAMP
    //       WHERE 
    //         status = 'pending' AND start_date < CURDATE()
    //     `);
    //   }
};

function formatDate(dateString) {
    return new Date(dateString).toISOString().split('T')[0];
}

function formatDateTime(dateTimeString) {
    return new Date(dateTimeString).toISOString();
}