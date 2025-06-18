const pool = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const cron = require('node-cron');



const taskController = {
createTask: async (req, res) => {
  const {
    task_name, description, priority, tag_label, assign_datetime,
    end_datetime, included_people, created_by
  } = req.body;

  try {
    await pool.query('START TRANSACTION');
    const taskId = uuidv4();

    await pool.query(
      `INSERT INTO tasks (
        id, task_name, description, priority, tag_label, 
        assign_datetime, end_datetime, created_by, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        taskId, task_name, description, priority, tag_label,
        assign_datetime, end_datetime, created_by
      ]
    );

    await pool.query(
      `INSERT INTO task_participants (id, task_id, employee_id, is_creator) 
       VALUES (?, ?, ?, true)`,
      [uuidv4(), taskId, created_by]
    );

    if (included_people && included_people.length > 0) {
      for (const employeeId of included_people) {
        await pool.query(
          `INSERT INTO task_participants (id, task_id, employee_id) 
           VALUES (?, ?, ?)`,
          [uuidv4(), taskId, employeeId]
        );
      }
    }

    const participants = [created_by, ...(included_people || [])];
    for (const participantId of new Set(participants)) {
      await pool.query(
        `INSERT INTO notificationstask (
          id, employee_id, task_id, title, message, type
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          uuidv4(),
          participantId,
          taskId,
          'New Task Assigned',
          `You have been assigned to task: ${task_name}`,
          'task_assignment'
        ]
      );
    }

    const [taskResult] = await pool.query(`SELECT * FROM tasks WHERE id = ?`, [taskId]);

    await pool.query('COMMIT');

    // ✅ Schedule deadline notification
    if (new Date(end_datetime) > new Date()) {
      scheduleDeadlineNotification(taskId, task_name, end_datetime, participants);
    }

    res.status(201).json({ success: true, task: taskResult[0] });

  } catch (err) {
    await pool.query('ROLLBACK');
    console.error('Error creating task:', err);
    res.status(500).json({ error: 'Failed to create task', details: err.message });
  }
},

getUserTasks: async (req, res) => {
  const userId = req.query.userId || req.body.userId;

  if (!userId) {
    return res.status(400).json({ error: "Missing user ID" });
  }

  try {
    // Step 1: Get tasks assigned to the user
    const [tasks] = await pool.query(`
      SELECT t.*, tp.is_creator
      FROM tasks t
      JOIN task_participants tp ON t.id = tp.task_id
      WHERE tp.employee_id = ?
      ORDER BY 
        CASE t.priority
          WHEN 'high' THEN 1
          WHEN 'medium' THEN 2
          WHEN 'low' THEN 3
          ELSE 4
        END,
        t.end_datetime ASC
    `, [userId]);

    const taskIds = tasks.map(task => task.id);
    let participantsMap = {};

    // Step 2: Get all participants with photo (instead of avatar)
    if (taskIds.length > 0) {
      const [participants] = await pool.query(`
        SELECT tp.task_id, e.id, e.name, e.photo, tp.is_creator
        FROM task_participants tp
        JOIN employees e ON tp.employee_id = e.id
        WHERE tp.task_id IN (?)
      `, [taskIds]);

      // Group participants by task_id
      participantsMap = participants.reduce((acc, curr) => {
        if (!acc[curr.task_id]) acc[curr.task_id] = [];
        acc[curr.task_id].push({
          id: curr.id,
          name: curr.name,
          photo: ` http://localhost:5000/uploads/${curr.photo}` || `https://i.pravatar.cc/150?u=${curr.id}`, // fallback photo
          is_creator: curr.is_creator
        });
        return acc;
      }, {});
    }

    // Step 3: Attach participants and reminder flag
    const now = new Date();
    const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);

    const tasksWithParticipants = tasks.map(task => {
      const taskEnd = new Date(task.end_datetime);
      const reminder_due = taskEnd > now && taskEnd <= oneHourLater;

      return {
        ...task,
        participants: participantsMap[task.id] || [],
        reminder_due
      };
    });

    res.json({ success: true, tasks: tasksWithParticipants });

  } catch (err) {
    console.error('Error fetching tasks:', err);
    res.status(500).json({ error: 'Failed to fetch tasks', details: err.message });
  }
}

,

// getTaskDetails : async (req, res) => {
//     console.log(req?.query.userId,req.params.id)
//   const taskId = req.params.id;
// const userId = req.user?.id || req.query.userId; 

//   try {
//     const [access] = await pool.query(
//       `SELECT 1 FROM task_participants WHERE task_id = ? AND employee_id = ?`,
//       [taskId, userId]
//     );

//     if (access.length === 0) {
//       return res.status(403).json({ error: 'Unauthorized access to this task' });
//     }

//     const [task] = await pool.query(`
//       SELECT t.*, p.name as project_name
//       FROM tasks t
//       LEFT JOIN projects p ON t.project_id = p.id
//       WHERE t.id = ?
//     `, [taskId]);

//     const [participants] = await pool.query(`
//       SELECT e.id, e.name, e.email, e.avatar, tp.is_creator
//       FROM task_participants tp
//       JOIN employees e ON tp.employee_id = e.id
//       WHERE tp.task_id = ?
//     `, [taskId]);

//     res.json({ success: true, task: task[0], participants });

//   } catch (err) {
//     console.error('Error fetching task details:', err);
//     res.status(500).json({ error: 'Failed to fetch task details', details: err.message });
//   }
// },

updateTaskStatus:async (req, res) => {
  const taskId = req.params.id;
  const { status } = req.body;
  const userId = req.query.userId;

  try {
    const [access] = await pool.query(
      `SELECT 1 FROM task_participants WHERE task_id = ? AND employee_id = ?`,
      [taskId, userId]
    );

    if (access.length === 0) {
      return res.status(403).json({ error: 'Unauthorized access to this task' });
    }

    await pool.query(`UPDATE tasks SET status = ? WHERE id = ?`, [status, taskId]);

    const [participants] = await pool.query(
      `SELECT employee_id FROM task_participants WHERE task_id = ?`,
      [taskId]
    );

    const [task] = await pool.query(`SELECT task_name FROM tasks WHERE id = ?`, [taskId]);

    for (const participant of participants) {
      await pool.query(
        `INSERT INTO notificationstask (
          id, employee_id, task_id, title, message, type
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          uuidv4(),
          participant.employee_id,
          taskId,
          'Task Status Updated',
          `Task "${task[0].task_name}" status changed to ${status}`,
          'task_update'
        ]
      );
    }

    res.json({ success: true, message: 'Task status updated successfully' });

  } catch (err) {
    console.error('Error updating task status:', err);
    res.status(500).json({ error: 'Failed to update task status', details: err.message });
  }
},



sendTaskNotification: async (req, res) => {
  const { task_id, title, message, type } = req.body;

  if (!task_id || !title || !message || !type) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const typeMapping = {
    info: 'task_assignment',
    warning: 'task_reminder',
    urgent: 'task_reminder',
    update: 'task_update'
  };

  const mappedType = typeMapping[type];
  if (!mappedType) {
    return res.status(400).json({
      error: `Invalid type value. Must be one of: ${Object.keys(typeMapping).join(', ')}`
    });
  }

  try {
    const [participants] = await pool.query(
      `SELECT employee_id FROM task_participants WHERE task_id = ?`,
      [task_id]
    );

    if (!participants.length) {
      return res.status(404).json({ error: 'No participants found for this task' });
    }

    for (const participant of participants) {
      await pool.query(
        `INSERT INTO notificationstask (
          id, employee_id, task_id, title, message, type
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          uuidv4(),
          participant.employee_id,
          task_id,
          title,
          message,
          mappedType
        ]
      );
    }

    res.json({ success: true, message: 'Notifications sent successfully' });

  } catch (err) {
    console.error('Error sending manual task notification:', err);
    res.status(500).json({ error: 'Failed to send task notifications', details: err.message });
  }
}
,

// Backend API to get notifications for a user
getTaskNotifications: async (req, res) => {
  
  try {
    // Get employee_id from JWT token
    const employee_id = req.user?.id || req.query.userId;
    const [notifications] = await pool.query(
      `SELECT * FROM notificationstask 
       WHERE employee_id = ? 
       ORDER BY created_at DESC`,
      [employee_id]
    );

    res.json(notifications);
  } catch (err) {
    console.error('Error fetching task notifications:', err);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
}
,
editTask: async (req, res) => {
  const taskId = req.params.id;
  const {
    task_name, description, priority, tag_label,
    assign_datetime, end_datetime, included_people
  } = req.body;

  try {
    await pool.query('START TRANSACTION');

    // 1. Update main task info
    await pool.query(
      `UPDATE tasks 
       SET task_name = ?, description = ?, priority = ?, tag_label = ?, 
           assign_datetime = ?, end_datetime = ?
       WHERE id = ?`,
      [
        task_name, description, priority, tag_label,
        assign_datetime, end_datetime, taskId
      ]
    );

    // 2. Get current participants (excluding creator)
    const [currentParticipants] = await pool.query(
      `SELECT employee_id FROM task_participants 
       WHERE task_id = ? AND is_creator = false`,
      [taskId]
    );
    const currentParticipantIds = currentParticipants.map(p => p.employee_id);

    // 3. Determine participants to add and remove
    const newParticipantIds = included_people || [];
    const participantsToAdd = newParticipantIds.filter(
      id => !currentParticipantIds.includes(id)
    );
    const participantsToRemove = currentParticipantIds.filter(
      id => !newParticipantIds.includes(id)
    );

    // 4. Remove participants no longer included
    if (participantsToRemove.length > 0) {
      await pool.query(
        `DELETE FROM task_participants 
         WHERE task_id = ? AND employee_id IN (?) AND is_creator = false`,
        [taskId, participantsToRemove]
      );
    }

    // 5. Add new participants
    if (participantsToAdd.length > 0) {
      for (const employeeId of participantsToAdd) {
        try {
          await pool.query(
            `INSERT INTO task_participants (id, task_id, employee_id) 
             VALUES (?, ?, ?)`,
            [uuidv4(), taskId, employeeId]
          );
        } catch (err) {
          // Skip duplicate entries
          if (err.code !== 'ER_DUP_ENTRY') throw err;
        }
      }
    }

    // 6. Notify all participants about the update
    const [allParticipants] = await pool.query(
      `SELECT employee_id FROM task_participants WHERE task_id = ?`,
      [taskId]
    );

    for (const participant of allParticipants) {
      await pool.query(
        `INSERT INTO notificationstask (
          id, employee_id, task_id, title, message, type, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [
          uuidv4(),
          participant.employee_id,
          taskId,
          'Task Updated',
          `Task "${task_name}" was updated.`,
          'task_update'
        ]
      );
    }

    await pool.query('COMMIT');

    // Get the updated task with participants to return
    const [updatedTask] = await pool.query(
      `SELECT t.*, 
        (SELECT GROUP_CONCAT(employee_id) 
         FROM task_participants 
         WHERE task_id = t.id AND is_creator = false) AS participant_ids
       FROM tasks t WHERE t.id = ?`,
      [taskId]
    );

    res.json({ 
      success: true, 
      message: 'Task updated successfully',
      task: updatedTask[0]
    });

  } catch (err) {
    await pool.query('ROLLBACK');
    console.error('Error editing task:', err);
    res.status(500).json({ 
      error: 'Failed to edit task', 
      details: err.message 
    });
  }
},

}

// Deadline scheduler
function scheduleDeadlineNotification(taskId, taskName, endDatetime, participants) {
  const notifyTime = new Date(endDatetime);
  notifyTime.setHours(notifyTime.getHours() - 1);

  if (notifyTime > new Date()) {
    const cronTime = `${notifyTime.getMinutes()} ${notifyTime.getHours()} ${notifyTime.getDate()} ${notifyTime.getMonth() + 1} *`;
    cron.schedule(cronTime, async () => {
      try {
        for (const participantId of participants) {
          await pool.query(
            `INSERT INTO notifications (
              id, employee_id, task_id, title, message, type
            ) VALUES (?, ?, ?, ?, ?, ?)`,
            [
              uuidv4(),
              participantId,
              taskId,
              'Task Deadline Approaching',
              `Task "${taskName}" is due in 1 hour`,
              'task_reminder'
            ]
          );
        }
      } catch (err) {
        console.error('Error sending deadline notification:', err);
      }
    });
  }
}



module.exports = taskController;