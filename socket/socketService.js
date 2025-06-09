const socketio = require('socket.io');
let io;

module.exports = {
  initialize: (server) => {
    io = socketio(server, {
      cors: {
        origin: process.env.CLIENT_URL,
        methods: ['GET', 'POST']
      }
    });

    io.on('connection', (socket) => {
      console.log('New client connected:', socket.id);

      socket.on('subscribe', (employeeId) => {
        // Join employee's personal room and all chat rooms they're in
        socket.join(`employee_${employeeId}`);
        
        // You might want to also join all chat rooms they're part of
        // This would require a database query to get their rooms
        console.log(`Employee ${employeeId} connected`);
      });

      socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
      });
    });
  },

  notifyRoomCreation: (roomId, participants) => {
    io.to(participants.map(id => `employee_${id}`)).emit('room_created', { roomId });
  },

  notifyNewMessage: (roomId, messageId, senderId) => {
    // Notify all room participants except sender
    io.to(`room_${roomId}`).except(`employee_${senderId}`).emit('new_message', { 
      roomId, 
      messageId 
    });
  },

  notifyMessageRead: (roomId, messageId, readerId) => {
    io.to(`room_${roomId}`).emit('message_read', { 
      messageId, 
      readerId 
    });
  },

  getIO: () => io
};