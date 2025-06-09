// const pool = require('../config/db');
// const fs = require('fs');
// const path = require('path');

// module.exports = {
//   // Create a new project with description and photo
//   createProject: async (req, res) => {
//     try {
//       const { name, description, start_date, deadline, priority_level = 'Medium' } = req.body;
//       const photoFile = req.file;

//       // Validate required fields
//       if (!name || !start_date || !deadline) {
//         // Clean up uploaded file if validation fails
//         if (photoFile && fs.existsSync(photoFile.path)) {
//           fs.unlinkSync(photoFile.path);
//         }
//         return res.status(400).json({ error: 'Name, start_date, and deadline are required' });
//       }

//       // Handle photo upload
//       let photoPath = null;
//       if (photoFile) {
//         const uploadDir = path.join(__dirname, '../../uploads');
//         if (!fs.existsSync(uploadDir)) {
//           fs.mkdirSync(uploadDir, { recursive: true });
//         }
        
//         const ext = path.extname(photoFile.originalname);
//         const filename = `project-${Date.now()}${ext}`;
//         photoPath = `/uploads/${filename}`;
        
//         fs.renameSync(photoFile.path, path.join(uploadDir, filename));
//       }

//       // Insert project with both description and photo
//       const [result] = await pool.execute(
//         'INSERT INTO projects (name, description, start_date, deadline, priority_level, photo) VALUES (?, ?, ?, ?, ?, ?)',
//         [name, description || null, start_date, deadline, priority_level, photoPath]
//       );

//       const [project] = await pool.execute('SELECT * FROM projects WHERE id = ?', [result.insertId]);
      
//       // Include full photo URL in response
//       const response = {
//         ...project[0],
//         photo_url: project[0].photo ? `${req.protocol}://${req.get('host')}${project[0].photo}` : null
//       };
      
//       res.status(201).json(response);
//     } catch (error) {
//       // Clean up uploaded file if error occurs
//       if (req.file && fs.existsSync(req.file.path)) {
//         fs.unlinkSync(req.file.path);
//       }
//       console.error(error);
//       res.status(500).json({ 
//         error: "Failed to create project",
//         details: process.env.NODE_ENV === 'development' ? error.message : undefined
//       });
//     }
//   },

//   // Get all projects with description and photo URLs
//   getProjects: async (req, res) => {
//     try {
//       const [projects] = await pool.execute(`
//         SELECT p.*, 
//           COUNT(pa.id) AS total_people,
//           COUNT(t.id) AS all_tasks,
//           SUM(CASE WHEN t.status = 'In Progress' THEN 1 ELSE 0 END) AS active_tasks
//         FROM projects p
//         LEFT JOIN project_assignments pa ON p.id = pa.project_id
//         LEFT JOIN tasks t ON p.id = t.project_id
//         GROUP BY p.id
//       `);
      
//       // Add full photo URLs to each project
//       const projectsWithPhotoUrls = projects.map(project => ({
//         ...project,
//         photo_url: project.photo ? `${req.protocol}://${req.get('host')}${project.photo}` : null
//       }));
      
//       res.json(projectsWithPhotoUrls);
//     } catch (error) {
//       console.error(error);
//       res.status(500).json({ error: error.message });
//     }
//   },

//   // Get project details with description and photo URL
//   getProjectDetails: async (req, res) => {
//     try {
//       const projectId = req.params.id;
//       const [project] = await pool.execute('SELECT * FROM projects WHERE id = ?', [projectId]);

//       if (!project.length) {
//         return res.status(404).json({ error: 'Project not found' });
//       }

//       const [assignments] = await pool.execute(`
//         SELECT pa.*, e.name AS employee_name, e.designation, t.title AS task_title
//         FROM project_assignments pa
//         JOIN employees e ON pa.employee_id = e.id
//         LEFT JOIN tasks t ON pa.task_id = t.id
//         WHERE pa.project_id = ?
//       `, [projectId]);

//       const [tasks] = await pool.execute('SELECT * FROM tasks WHERE project_id = ?', [projectId]);

//       res.json({
//         ...project[0],
//         description: project[0].description || "", // Ensure description is always returned
//         photo_url: project[0].photo ? `${req.protocol}://${req.get('host')}${project[0].photo}` : null,
//         assignments,
//         tasks
//       });
//     } catch (error) {
//       console.error(error);
//       res.status(500).json({ error: error.message });
//     }
//   },

//   // Update project photo (new method)
//   updateProjectPhoto: async (req, res) => {
//     try {
//       const projectId = req.params.id;
//       const photoFile = req.file;

//       if (!photoFile) {
//         return res.status(400).json({ error: 'No photo uploaded' });
//       }

//       // Get current project to check for existing photo
//       const [project] = await pool.execute('SELECT photo FROM projects WHERE id = ?', [projectId]);
//       if (!project.length) {
//         return res.status(404).json({ error: 'Project not found' });
//       }

//       // Handle new photo upload
//       const uploadDir = path.join(__dirname, '../../uploads');
//       if (!fs.existsSync(uploadDir)) {
//         fs.mkdirSync(uploadDir, { recursive: true });
//       }
      
//       const ext = path.extname(photoFile.originalname);
//       const filename = `project-${Date.now()}${ext}`;
//       const photoPath = `/uploads/${filename}`;
      
//       fs.renameSync(photoFile.path, path.join(uploadDir, filename));

//       // Delete old photo if it exists
//       if (project[0].photo) {
//         const oldPhotoPath = path.join(__dirname, '../..', project[0].photo);
//         if (fs.existsSync(oldPhotoPath)) {
//           fs.unlinkSync(oldPhotoPath);
//         }
//       }

//       // Update project with new photo path
//       await pool.execute(
//         'UPDATE projects SET photo = ? WHERE id = ?',
//         [photoPath, projectId]
//       );

//       const [updatedProject] = await pool.execute('SELECT * FROM projects WHERE id = ?', [projectId]);
      
//       res.json({
//         ...updatedProject[0],
//         photo_url: `${req.protocol}://${req.get('host')}${photoPath}`
//       });
//     } catch (error) {
//       console.error(error);
//       res.status(500).json({ 
//         error: "Failed to update project photo",
//         details: process.env.NODE_ENV === 'development' ? error.message : undefined
//       });
//     }
//   }
// };