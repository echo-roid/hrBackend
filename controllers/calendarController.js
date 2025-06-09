const pool = require('../config/db');
const { generateGoogleMeetLink } = require('../utils/meetHelper');

module.exports = {
  // Add event or meeting
  addEvent: async (req, res) => {
    try {
      const { 
        title, 
        description, 
        start_date, 
        end_date, 
        start_time, 
        end_time, 
        event_type, 
        is_recurring, 
        recurrence_pattern,
        is_meeting,
        attendees,
        timezone,
        organizer_id // Added organizer/employee ID
      } = req.body;

      // Validation when it's a meeting
      if (is_meeting) {
        if (!organizer_id) {
          return res.status(400).json({
            success: false,
            error: "Organizer/employee ID is required for meetings"
          });
        }

        if (!attendees || !Array.isArray(attendees) || attendees.length === 0) {
          return res.status(400).json({
            success: false,
            error: "At least one attendee is required for meetings"
          });
        }

        // Verify all attendees exist in the system
        const [existingAttendees] = await pool.query(
          'SELECT id FROM employees WHERE email IN (?)',
          [attendees]
        );

        if (existingAttendees.length !== attendees.length) {
          const missingAttendees = attendees.filter(
            id => !existingAttendees.some(e => e.id === id)
          );
          return res.status(404).json({
            success: false,
            error: "Some attendees don't exist",
            missingAttendees
          });
        }
      }

      // Date/time processing
      let fullStartDate = start_date;
      let fullEndDate = end_date;

      if (is_meeting && start_time) {
        fullStartDate = `${start_date.split('T')[0]}T${start_time}:00`;
        fullEndDate = end_date ? `${end_date.split('T')[0]}T${end_time || '23:59'}:00` : null;
      }

      // Generate Google Meet link if meeting
      let google_meet_link = null;
      if (is_meeting) {
        google_meet_link = generateGoogleMeetLink(title, fullStartDate);
        
        // Send calendar invites (pseudo-code)
        await sendCalendarInvites({
          title,
          start: fullStartDate,
          end: fullEndDate,
          organizer: organizer_id,
          attendees,
          meetingLink: google_meet_link
        });
      }

      // Insert event
      const [result] = await pool.execute(
        `INSERT INTO calendar_events 
        (title, description, start_date, end_date, start_time, end_time, event_type, 
         is_recurring, recurrence_pattern, is_meeting, google_meet_link, 
         attendees, timezone, organizer_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          title, 
          description, 
          fullStartDate, 
          fullEndDate, 
          start_time || null,
          end_time || null,
          event_type, 
          is_recurring, 
          recurrence_pattern, 
          is_meeting || false,
          google_meet_link, 
          JSON.stringify(attendees || []), 
          timezone || 'Asia/Kolkata',
          organizer_id || null
        ]
      );

      // Fetch created event
      const [event] = await pool.execute(
        'SELECT * FROM calendar_events WHERE event_id = ?',
        [result.insertId]
      );

      // Parse attendees JSON
      const formattedEvent = {
        ...event[0],
        attendees: event[0]?.attendees ? JSON.parse(event[0].attendees) : []
      };

      res.status(201).json({
        success: true,
        data: formattedEvent,
        message: is_meeting ? "Meeting scheduled successfully" : "Event created successfully"
      });

    } catch (error) {
      console.error('Event creation error:', error);
      res.status(500).json({ 
        success: false,
        error: "Failed to create event",
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

  // List all events
  listEvents: async (req, res) => {
    try {
      const { month, year } = req.query;

      let eventsQuery = `
      SELECT 
        event_id,
        title,
        description,
        start_date,
        end_date,
        event_type,
        is_recurring,
        recurrence_pattern,
        is_meeting,
        google_meet_link,
        attendees,
        timezone,
         start_time,
        end_time
      FROM calendar_events 
      WHERE 1=1
    `;
    
      const params = [];
      
      if (month && year) {
        eventsQuery += ' AND MONTH(start_date) = ? AND YEAR(start_date) = ?';
        params.push(month, year);
      }
      
      const [events] = await pool.execute(eventsQuery, params);

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
      }
      
      const [birthdays] = await pool.execute(birthdaysQuery, month ? [month] : []);

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
        employee_id: emp.id,
        start_time: '00:00',
        end_time: '23:59'
      }));

      const allEvents = [...events, ...birthdayEvents];

      allEvents.forEach(event => {
        if (event.attendees) {
          event.attendees = JSON.parse(event.attendees);
        }
        if (!event.start_time) {
          event.start_time = event.start_date ? 
            new Date(event.start_date).toTimeString().substring(0, 5) : '00:00';
        }
        if (!event.end_time) {
          event.end_time = event.end_date ? 
            new Date(event.end_date).toTimeString().substring(0, 5) : '23:59';
        }
      });

      allEvents.sort((a, b) => new Date(a.start_date) - new Date(b.start_date));

      res.json({
        success: true,
        data: allEvents
      });
    } catch (error) {
      console.error('Event listing error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to fetch events',
        details: process.env.NODE_ENV === 'development' ? error : undefined
      });
    }
  },

  // Update event
  updateEvent: async (req, res) => {
    try {
      const { id } = req.params;
      const { 
        title, 
        description, 
        start_date, 
        end_date, 
        start_time, 
        end_time, 
        event_type, 
        is_recurring, 
        recurrence_pattern,
        is_meeting,
        attendees,
        timezone
      } = req.body;

      let fullStartDate = start_date;
      let fullEndDate = end_date;

      if (is_meeting && start_time) {
        fullStartDate = `${start_date.split('T')[0]}T${start_time}:00`;
        fullEndDate = end_date ? `${end_date.split('T')[0]}T${end_time || '23:59'}:00` : null;
      }

      let google_meet_link = null;
      if (is_meeting) {
        google_meet_link = generateGoogleMeetLink(title, fullStartDate);
      }

      await pool.execute(
        `UPDATE calendar_events 
         SET title = ?, description = ?, start_date = ?, end_date = ?, start_time = ?, end_time = ?, 
             event_type = ?, is_recurring = ?, recurrence_pattern = ?, is_meeting = ?, 
             google_meet_link = ?, attendees = ?, timezone = ?
         WHERE event_id = ?`,
        [
          title, 
          description, 
          fullStartDate, 
          fullEndDate, 
          start_time || null,
          end_time || null,
          event_type, 
          is_recurring, 
          recurrence_pattern, 
          is_meeting || false,
          google_meet_link, 
          JSON.stringify(attendees || []), 
          timezone || 'Asia/Kolkata',
          id
        ]
      );

      const [event] = await pool.execute(
        'SELECT * FROM calendar_events WHERE event_id = ?',
        [id]
      );

      if (event[0]?.attendees) {
        event[0].attendees = JSON.parse(event[0].attendees);
      }

      res.json({
        success: true,
        data: event[0]
      });
    } catch (error) {
      console.error('Event update error:', error);
      res.status(400).json({ 
        success: false,
        error: error.message,
        details: process.env.NODE_ENV === 'development' ? error : undefined
      });
    }
  },

  // Delete event
  deleteEvent: async (req, res) => {
    try {
      const { id } = req.params;

      const [result] = await pool.execute(
        'DELETE FROM calendar_events WHERE event_id = ?',
        [id]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: 'Event not found'
        });
      }

      res.json({
        success: true,
        message: 'Event deleted successfully'
      });
    } catch (error) {
      console.error('Event deletion error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to delete event',
        details: process.env.NODE_ENV === 'development' ? error : undefined
      });
    }
  },

  // Get meetings by organizer_id
getMeetingsByOrganizer: async (req, res) => {
    try {
      const { organizer_id } = req.query;
  
      if (!organizer_id) {
        return res.status(400).json({
          success: false,
          error: "organizer_id is required"
        });
      }
  
      const [meetings] = await pool.execute(
        `SELECT 
           event_id,
           title,
           description,
           start_date,
           end_date,
           event_type,
           is_recurring,
           recurrence_pattern,
           is_meeting,
           google_meet_link,
           attendees,
           timezone,
           DATE_FORMAT(start_date, '%H:%i') as start_time,
           DATE_FORMAT(end_date, '%H:%i') as end_time
         FROM calendar_events 
         WHERE is_meeting = true AND organizer_id = ?`,
        [organizer_id]
      );
  
      // Parse attendees
      meetings.forEach(event => {
        if (event.attendees) {
          event.attendees = JSON.parse(event.attendees);
        }
      });
  
      res.json({
        success: true,
        data: meetings
      });
  
    } catch (error) {
      console.error('Fetch organizer meetings error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to fetch meetings',
        details: process.env.NODE_ENV === 'development' ? error : undefined
      });
    }
  }
  
};
