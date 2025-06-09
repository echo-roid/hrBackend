const pool = require('../config/db');

module.exports = {
  // Add holiday or event
  addEvent: async (req, res) => {
    try {
      const { title, description, start_date, end_date, event_type, is_recurring, recurrence_pattern } = req.body;
      
      const [result] = await pool.execute(
        `INSERT INTO calendar_events 
        (title, description, start_date, end_date, event_type, is_recurring, recurrence_pattern)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [title, description, start_date, end_date, event_type, is_recurring, recurrence_pattern]
      );

      const [event] = await pool.execute(
        'SELECT * FROM calendar_events WHERE event_id = ?',
        [result.insertId]
      );

      res.status(201).json(event[0]);
    } catch (error) {
      console.error(error);
      res.status(400).json({ error: error.message });
    }
  },

  // List all events including holidays and birthdays
  listEvents: async (req, res) => {
    try {
      const { month, year } = req.query;
      
      // Get calendar events
      let eventsQuery = 'SELECT * FROM calendar_events WHERE 1=1';
      const params = [];
      
      if (month && year) {
        eventsQuery += ' AND MONTH(start_date) = ? AND YEAR(start_date) = ?';
        params.push(month, year);
      }
      
      const [events] = await pool.execute(eventsQuery, params);
      
      // Get employee birthdays
      let birthdaysQuery = `
        SELECT 
          id, 
          name, 
          date_of_birth,
          DATE_FORMAT(date_of_birth, '%m-%d') as month_day,
          CONCAT(YEAR(CURDATE()), '-', DATE_FORMAT(date_of_birth, '%m-%d')) as this_years_birthday
        FROM employees
      `;
      
      if (month) {
        birthdaysQuery += ' WHERE MONTH(date_of_birth) = ?';
        params.push(month);
      }
      
      const [birthdays] = await pool.execute(birthdaysQuery, month ? [month] : []);
      
      // Format birthdays as calendar events
      const birthdayEvents = birthdays.map(emp => ({
        event_id: `birthday_${emp.id}`,
        title: `${emp.name}'s Birthday`,
        description: `${emp.name} turns ${new Date().getFullYear() - new Date(emp.date_of_birth).getFullYear()} this year`,
        start_date: emp.this_years_birthday,
        end_date: emp.this_years_birthday,
        event_type: 'birthday',
        is_recurring: true,
        recurrence_pattern: 'yearly',
        is_birthday: true,
        employee_id: emp.id
      }));
      
      // Combine both event types
      const allEvents = [...events, ...birthdayEvents];
      
      // Sort by date
      allEvents.sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
      
      res.json(allEvents);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  }
};