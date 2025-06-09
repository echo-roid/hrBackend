const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const pool = require('./../config/db');
const { parseTwoDigitYear } = require('moment/moment');

const verifyRoomCreator = async (req, res, next) => {
  const { roomId } = req.params;

  const userId = req.user?.id || req.query.userId;

  const [room] = await pool.query(
    'SELECT created_by FROM chat_rooms WHERE id = ?',
    [roomId]
  );

  console.log(room, userId)
  if (!room.length || room[0].created_by != userId) {
    return res.status(403).json({
      success: false,
      error: 'Only the room creator can perform this action',
    });
  }
  next();
};
// Create a new chat room
router.post('/rooms', chatController.createRoom);

// Get user's chat rooms
router.get('/rooms', chatController.getUserRooms);

// Send message to room
router.post('/rooms/:roomId/messages', chatController.sendMessage);

// Get room messages
router.get('/rooms/:roomId/messages', chatController.getRoomMessages);

// Mark message as read
router.put('/messages/:messageId/read', chatController.markAsRead);


router.patch('/messages/:messageId', chatController.editMessage);
router.delete('/messages/:messageId', chatController.deleteMessage);



// Routes
router.delete('/rooms/:roomId/participants/:employeeId', verifyRoomCreator, chatController.removeEmployeeFromGroup);
router.delete('/rooms/:roomId', verifyRoomCreator, chatController.deleteRoom);
router.put('/rooms/:roomId', verifyRoomCreator, chatController.editRoomDetails);



module.exports = router;