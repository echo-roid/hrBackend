const express = require('express');
const router = express.Router();
const taskController = require('../controllers/taskController');


router.post('/tasks' , taskController.createTask);
router.get('/tasks' , taskController.getUserTasks);
// router.get('/tasks/:id' , taskController.getTaskDetails);
router.put('/tasks/:id/status', taskController.updateTaskStatus);
router.post('/tasks/notify', taskController.sendTaskNotification);
router.get('/tasks/notifyGet', taskController.getTaskNotifications);
module.exports = router;
