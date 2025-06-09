const pool = require('../config/db');
const upload = require('../middleware/upload');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const socket = require('../socket/socketService');

async function ensureDefaultRoomExists() {
  const defaultRoomName = 'General Chat';

  const [existing] = await pool.query(
    'SELECT id FROM chat_rooms WHERE name = ? AND is_group = 1',
    [defaultRoomName]
  );

  if (existing.length) return existing[0].id;

  const [creatorRow] = await pool.query('SELECT id FROM employees LIMIT 1');
  const createdBy = creatorRow[0]?.id;

  if (!createdBy) throw new Error('No employees available to assign as room creator');

  const roomId = uuidv4();
  await pool.query(
    `INSERT INTO chat_rooms (id, name, is_group, created_by, image_url)
     VALUES (?, ?, ?, ?, ?)`,
    [roomId, defaultRoomName, 1, createdBy, null]
  );

  const [employees] = await pool.query('SELECT id FROM employees');
  for (const emp of employees) {
    await pool.query(
      'INSERT INTO room_participants (id, room_id, employee_id) VALUES (?, ?, ?)',
      [uuidv4(), roomId, emp.id]
    );
  }

  return roomId;
}


const chatController = {
createRoom: async (req, res) => {
  try {
    const { employeeIds, name, isGroup, imageUrl } = req.body;
    const createdBy = req.user?.id || req.query.userId;

    await pool.query('BEGIN');

    // Create room
    const roomId = uuidv4();
    await pool.query(
      'INSERT INTO chat_rooms (id, name, is_group, created_by, image_url) VALUES (?, ?, ?, ?, ?)',
      [roomId, name, isGroup, createdBy, imageUrl || null]
    );

    // Add participants (including creator)
    const participants = [...new Set([createdBy, ...employeeIds])];
    for (const employeeId of participants) {
      await pool.query(
        'INSERT INTO room_participants (id, room_id, employee_id) VALUES (?, ?, ?)',
        [uuidv4(), roomId, employeeId]
      );
    }

    await pool.query('COMMIT');

    // Notify participants via WebSocket
    socket.notifyRoomCreation(roomId, participants);

    res.status(201).json({
      success: true,
      room: {
        id: roomId,
        name,
        isGroup,
        imageUrl: imageUrl || null,
        participants
      }
    });
  } catch (err) {
    await pool.query('ROLLBACK');
    res.status(500).json({
      success: false,
      error: 'Failed to create chat room',
      details: err.message
    });
  }
},

sendMessage: async (req, res) => {
  try {
    const { roomId } = req.params;
    const { content, contentType = 'text' } = req.body;
    const senderId = req.user?.id || req.query.userId;

    // Validate inputs
    if (!content || !roomId || !senderId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields (content, roomId, senderId)',
      });
    }

    // Verify participant
    const [participant] = await pool.query(
      'SELECT 1 FROM room_participants WHERE room_id = ? AND employee_id = ?',
      [roomId, senderId]
    );

    if (!participant.length) {
      return res.status(403).json({
        success: false,
        error: 'Not a room participant',
      });
    }

    // Create message
    const messageId = uuidv4();
    await pool.query(
      `INSERT INTO messages 
       (id, room_id, sender_id, content, content_type) 
       VALUES (?, ?, ?, ?, ?)`,
      [messageId, roomId, senderId, content, contentType]
    );

    // Get all participants in room
    const [participants] = await pool.query(
      'SELECT employee_id FROM room_participants WHERE room_id = ?',
      [roomId]
    );

    // Add message status for each participant
    for (const { employee_id } of participants) {
      await pool.query(
        `INSERT INTO message_status 
         (id, message_id, employee_id, status) 
         VALUES (?, ?, ?, ?)`,
        [
          uuidv4(),
          messageId,
          employee_id,
          employee_id === senderId ? 'read' : 'delivered',
        ]
      );
    }

    // WebSocket notification
    socket.notifyNewMessage(roomId, messageId, senderId);

    res.status(201).json({
      success: true,
      message: {
        id: messageId,
        roomId,
        senderId,
        content,
        contentType,
      },
    });
  } catch (err) {
    console.error('sendMessage error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to send message',
      details: err.message,
    });
  }
},

markAsRead: async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.query.userId || req.user?.id;

    // Update message status to 'read' for the current employee
    await pool.query(
      'UPDATE message_status SET status = "read" WHERE message_id = ? AND employee_id = ?',
      [messageId, userId]
    );

    // Fetch message to get room_id and sender_id
    const [message] = await pool.query(
      'SELECT room_id, sender_id FROM messages WHERE id = ?',
      [messageId]
    );

    if (message.length && message[0].sender_id !== userId) {
      // Notify sender that message was read
      socket.notifyMessageRead(message[0].room_id, messageId, userId);
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Error in markAsRead:", err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to mark message as read',
      details: err.message,
    });
  }
},

getRoomMessages: async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.query.userId;
    const { limit = 50, offset = 0 } = req.query;

    // Check if the user is a participant
    const [participant] = await pool.query(
      'SELECT 1 FROM room_participants WHERE room_id = ? AND employee_id = ?',
      [roomId, userId]
    );

    if (!participant.length) {
      return res.status(403).json({
        success: false,
        error: 'Not a room participant',
      });
    }

    // Get messages with employee info
    const [messages] = await pool.query(
      `SELECT m.*, e.name AS sender_name, e.photo AS sender_avatar 
       FROM messages m
       JOIN employees e ON m.sender_id = e.id
       WHERE m.room_id = ?
       ORDER BY m.created_at DESC
       LIMIT ? OFFSET ?`,
      [roomId, parseInt(limit), parseInt(offset)]
    );

    // Add read status for each message
    for (const message of messages) {
      const [status] = await pool.query(
        'SELECT status FROM message_status WHERE message_id = ? AND employee_id = ?',
        [message.id, userId]
      );
      message.user_status = status[0]?.status || 'sent';
    }

    // Get room image URL
    const [roomInfo] = await pool.query(
      'SELECT image_url FROM chat_rooms WHERE id = ?',
      [roomId]
    );

    res.json({
      success: true,
      room_image_url: roomInfo[0]?.image_url || null,
      messages: messages.reverse(),
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'Failed to get messages',
      details: err.message,
    });
  }
},

// getUserRooms: async (req, res) => {
//   try {
//     const userId = req.user?.id || req.query.userId; // fallback if auth is removed

//     const [rooms] = await pool.query(
//       `SELECT r.id, r.name, r.is_group, r.image_url,
//               (SELECT content FROM messages WHERE room_id = r.id ORDER BY created_at DESC LIMIT 1) as last_message,
//               (SELECT created_at FROM messages WHERE room_id = r.id ORDER BY created_at DESC LIMIT 1) as last_message_time,
//               (SELECT COUNT(*) FROM messages m 
//                JOIN message_status ms ON m.id = ms.message_id 
//                WHERE m.room_id = r.id AND ms.employee_id = ? AND ms.status = 'delivered') as unread_count
//        FROM chat_rooms r
//        JOIN room_participants rp ON r.id = rp.room_id
//        WHERE rp.employee_id = ?
//        ORDER BY last_message_time DESC`,
//       [userId, userId]
//     );

//     res.json({ 
//       success: true,
//       rooms 
//     });
//   } catch (err) {
//     res.status(500).json({ 
//       success: false,
//       error: 'Failed to get chat rooms',
//       details: err.message
//     });
//   }
// },

editMessage: async (req, res) => {
  try {
    const { messageId } = req.params;
    const { content } = req.body;
    // Try to get userId from req.user, then query params, then body as fallback
    const userId = req.user?.id || req.query.userId || req.body.userId;

    console.log('Editing message:', messageId, 'by user:', userId);

    if (!content) {
      return res.status(400).json({
        success: false,
        error: 'Content is required to edit the message',
      });
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User identification is required',
      });
    }

    // Ensure the user is the sender
    const [messageCheck] = await pool.query(
      'SELECT sender_id FROM messages WHERE id = ?',
      [messageId]
    );

    if (!messageCheck.length) {
      return res.status(404).json({
        success: false,
        error: 'Message not found',
      });
    }

    if (messageCheck[0].sender_id !== parseInt(userId)) {
      return res.status(403).json({
        success: false,
        error: 'You can only edit your own messages',
      });
    }

    // Update the message
    await pool.query(
      'UPDATE messages SET content = ?, updated_at = NOW() WHERE id = ?',
      [content, messageId]
    );

    res.json({ success: true, message: 'Message updated successfully' });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'Failed to update message',
      details: err.message,
    });
  }
},


deleteMessage: async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = Number(req.user?.id || req.query.userId); // Ensure it's a number

    if (!userId || !messageId) {
      return res.status(400).json({ success: false, error: 'Missing user ID or message ID' });
    }

    // Check if the message exists and belongs to the user
    const [rows] = await pool.query(
      'SELECT sender_id FROM messages WHERE id = ?',
      [messageId]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }

    if (Number(rows[0].sender_id) !== userId) {
      return res.status(403).json({ success: false, error: 'You can only delete your own messages' });
    }

    // Soft delete (optional: marks message instead of deleting row)
    await pool.query(
      'UPDATE messages SET content = "[message deleted]", content_type = "text" WHERE id = ?',
      [messageId]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'Failed to delete message',
      details: err.message
    });
  }
},

getUserRooms: async (req, res) => {
  try {
    const userId = req.user?.id || req.query.userId;

    const defaultRoomId = await ensureDefaultRoomExists();

    // Ensure user is in default room
    const [inRoom] = await pool.query(
      'SELECT 1 FROM room_participants WHERE room_id = ? AND employee_id = ?',
      [defaultRoomId, userId]
    );

    if (!inRoom.length) {
      await pool.query(
        'INSERT INTO room_participants (id, room_id, employee_id) VALUES (?, ?, ?)',
        [uuidv4(), defaultRoomId, userId]
      );
    }

    // Get rooms with creator_id included
    const [rooms] = await pool.query(
      `SELECT r.id, r.name, r.is_group, r.image_url, r.created_by AS creator_id,
              (SELECT content FROM messages WHERE room_id = r.id ORDER BY created_at DESC LIMIT 1) as last_message,
              (SELECT created_at FROM messages WHERE room_id = r.id ORDER BY created_at DESC LIMIT 1) as last_message_time,
              (SELECT COUNT(*) FROM messages m 
               JOIN message_status ms ON m.id = ms.message_id 
               WHERE m.room_id = r.id AND ms.employee_id = ? AND ms.status = 'delivered') as unread_count,
              (SELECT COUNT(*) FROM room_participants WHERE room_id = r.id) as member_count
       FROM chat_rooms r
       JOIN room_participants rp ON r.id = rp.room_id
       WHERE rp.employee_id = ?
       ORDER BY last_message_time DESC`,
      [userId, userId]
    );

    // Add members preview
    for (const room of rooms) {
      const [members] = await pool.query(
        `SELECT e.id, e.name, e.photo
         FROM room_participants rp
         JOIN employees e ON e.id = rp.employee_id
         WHERE rp.room_id = ?`,
        [room.id]
      );
      room.members_preview = members;
    }

    res.json({ success: true, rooms });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'Failed to get chat rooms',
      details: err.message,
    });
  }
},
editRoomDetails: async (req, res) => {
  try {
    const { roomId } = req.params;
    const { name, imageUrl, employeeIds = [] } = req.body;
    const userId = req.user?.id || req.query.userId;

    // Verify if the user is the room creator
    const [room] = await pool.query(
      'SELECT created_by FROM chat_rooms WHERE id = ?',
      [roomId]
    );
    if (!room.length || room[0].created_by != userId) {
      return res.status(403).json({
        success: false,
        error: 'Only the room creator can edit room details',
      });
    }

    // Update room details
    await pool.query(
      'UPDATE chat_rooms SET name = ?, image_url = ? WHERE id = ?',
      [name, imageUrl || null, roomId]
    );

    // Validate and add new participants
    if (Array.isArray(employeeIds)) {
      for (const employeeId of employeeIds) {
        // Skip invalid employee IDs
        if (!employeeId || isNaN(employeeId)) continue;
        
        // Convert to number if it's a string
        const id = Number(employeeId);
        
        // Check if participant already exists
        const [existing] = await pool.query(
          'SELECT 1 FROM room_participants WHERE room_id = ? AND employee_id = ?',
          [roomId, id]
        );
        
        if (!existing.length) {
          await pool.query(
            'INSERT INTO room_participants (id, room_id, employee_id) VALUES (?, ?, ?)',
            [uuidv4(), roomId, id]
          );
        }
      }
    }

    // Notify via WebSocket
    // socket.notifyRoomUpdated(roomId, { name, imageUrl, employeeIds });

    res.json({ success: true });
  } catch (err) {
    console.error('Error in editRoomDetails:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to edit room details',
      details: err.message,
    });
  }
},


deleteRoom: async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user?.id || req.query.userId;

    const [room] = await pool.query(
      'SELECT created_by FROM chat_rooms WHERE id = ?',
      [roomId]
    );

    if (!room.length) {
      return res.status(404).json({ error: "Room not found" });
    }

    // Fix: Compare as numbers
    if (Number(room[0].created_by) !== Number(userId)) {
      return res.status(403).json({
        success: false,
        error: "Only the room creator can delete the room",
      });
    }

    // Proceed with deletion...
    await pool.query('DELETE FROM room_participants WHERE room_id = ?', [roomId]);
    await pool.query('DELETE FROM messages WHERE room_id = ?', [roomId]);
    await pool.query('DELETE FROM chat_rooms WHERE id = ?', [roomId]);

    // socket.notifyRoomDeleted(roomId); // Notify WebSocket clients
    res.json({ success: true });

  } catch (err) {
    res.status(500).json({
      success: false,
      error: "Failed to delete chat room",
      details: err.message,
    });
  }
},


removeEmployeeFromGroup: async (req, res) => {
  try {
    const { roomId, employeeId } = req.params;
    const userId = req.user?.id || req.query.userId;

    // Verify if the user is the room creator
    const [room] = await pool.query(
      'SELECT created_by FROM chat_rooms WHERE id = ?',
      [roomId]
    );
    if (!room.length || room[0].created_by != userId) {
      return res.status(403).json({
        success: false,
        error: 'Only the room creator can remove participants',
      });
    }

    // Remove the employee from the room
    await pool.query(
      'DELETE FROM room_participants WHERE room_id = ? AND employee_id = ?',
      [roomId, employeeId]
    );

    // Notify via WebSocket
    // socket.notifyParticipantRemoved(roomId, employeeId);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'Failed to remove employee from group',
      details: err.message,
    });
  }
},




}



module.exports = chatController;





