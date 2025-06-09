const pool = require('../config/db');

// Helper function to safely parse JSON strings
function tryParseJSON(jsonString) {
  try {
    return JSON.parse(jsonString);
  } catch (e) {
    return null;  // Return null if parsing fails
  }
}

module.exports = {
  // Get current leave settings
  getLeaveSettings: async (req, res) => {
    try {
      const [settings] = await pool.query('SELECT * FROM leave_settings LIMIT 1');
      
      if (settings.length === 0) {
        // Default settings
        const defaultLeaveTypes = [
          'Sick Leave',
          'Casual Leave',
          'Earned Leave',
          'Maternity Leave',
          'Paternity Leave',
          'Compensatory Leave'
        ];
        
        const defaultLeaveStatus = Object.fromEntries(
          defaultLeaveTypes.map(type => [type, true])
        );
        
        const defaultLeaveQuotas = Object.fromEntries(
          defaultLeaveTypes.map(type => [type, { yearly: 0, monthly: 0 }])
        );

        return res.status(200).json({
          workingHours: 8,
          workingDays: 5,
          leaveTypes: defaultLeaveTypes,
          customLeaves: [],
          leaveStatus: defaultLeaveStatus,
          leaveQuotas: defaultLeaveQuotas,
          selectedLeaves: defaultLeaveTypes // Default to all leaves selected
        });
      }

      const setting = settings[0];

      res.status(200).json({
        workingHours: setting.working_hours,
        workingDays: setting.working_days,
        leaveTypes: (setting.leave_types) || [],
        customLeaves: (setting.custom_leaves) || [],
        leaveStatus: (setting.leave_status) || {},
        leaveQuotas: (setting.leave_quotas) || {},
        selectedLeaves: (setting.selected_leaves) || []
      });

    } catch (err) {
      console.error('Error fetching leave settings:', err);
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Get all active leave types

    getActiveLeaveTypes: async (req, res) => {
      try {
        const [settings] = await pool.query(`
          SELECT leave_status, leave_types, custom_leaves, leave_quotas 
          FROM leave_settings LIMIT 1
        `);
  
        // Default active leaves if no settings are found
        if (settings.length === 0) {
          return res.status(200).json({
            activeLeaves: ['Sick Leave', 'Casual Leave'],
            leaveQuotas: {}  // Default empty quotas
          });
        }
  
        const setting = settings[0];
  
        // Safely parse the leave_status, leave_types, custom_leaves, and leave_quotas
        const leaveStatus = typeof setting.leave_status === 'string' 
          ? tryParseJSON(setting.leave_status) || {} 
          : setting.leave_status || {};
  
        const standardLeaves = Array.isArray(setting.leave_types) 
          ? setting.leave_types 
          : (typeof setting.leave_types === 'string' ? tryParseJSON(setting.leave_types) : []);
  
        const customLeaves = Array.isArray(setting.custom_leaves) 
          ? setting.custom_leaves 
          : (typeof setting.custom_leaves === 'string' ? tryParseJSON(setting.custom_leaves) : []);
  
        const leaveQuotas = typeof setting.leave_quotas === 'string' 
          ? tryParseJSON(setting.leave_quotas) || {} 
          : setting.leave_quotas || {};
  
        // Combine standard leaves and custom leaves
        const allLeaves = [...standardLeaves, ...customLeaves];
  
        // Filter out the active leaves based on leaveStatus
        const activeLeaves = allLeaves.filter(leave => leaveStatus[leave]);
  
        // Build the response data including quotas for both monthly and yearly
        const leaveQuotaData = activeLeaves.reduce((acc, leave) => {
          const quotas = leaveQuotas[leave] || { monthly: 0, yearly: 0 };
          acc[leave] = {
            monthly: quotas.monthly,
            yearly: quotas.yearly
          };
          return acc;
        }, {});
  
        // Return active leave types along with monthly and yearly quotas
        res.status(200).json({
          activeLeaves,
          leaveQuotas: leaveQuotaData
        });
  
      } catch (err) {
        console.error('Error fetching active leave types:', err);
        res.status(500).json({ error: 'Server error' });
      }
    }
  ,

  // Save leave settings
 // Save leave settings - improved version
saveLeaveSettings: async (req, res) => {
  try {
    const {
      workingHours,
      workingDays,
      leaveTypes = [],
      customLeaves = [],
      leaveStatus = {},
      leaveQuotas = {},
      selectedLeaves = []
    } = req.body;

    const [existingRows] = await pool.query('SELECT * FROM leave_settings LIMIT 1');

    if (existingRows.length > 0) {
      const existing = existingRows[0];

      // Parse existing data
      const existingLeaveTypes = tryParseJSON(existing.leave_types) || [];
      const existingCustomLeaves = tryParseJSON(existing.custom_leaves) || [];
      const existingLeaveStatus = tryParseJSON(existing.leave_status) || {};
      const existingLeaveQuotas = tryParseJSON(existing.leave_quotas) || {};
      const existingSelectedLeaves = tryParseJSON(existing.selected_leaves) || [];

      // For leave types and custom leaves, use the new arrays if they're not empty
      // Otherwise keep the existing ones
      const finalLeaveTypes = leaveTypes.length > 0 ? leaveTypes : existingLeaveTypes;
      const finalCustomLeaves = customLeaves.length > 0 ? customLeaves : existingCustomLeaves;
      
      // For status and quotas, merge the new values with existing ones
      const finalLeaveStatus = { ...existingLeaveStatus, ...leaveStatus };
      const finalLeaveQuotas = { ...existingLeaveQuotas, ...leaveQuotas };
      
      // For selected leaves, use the new array if not empty, otherwise keep existing
      const finalSelectedLeaves = selectedLeaves.length > 0 ? selectedLeaves : existingSelectedLeaves;

      // Update existing settings
      await pool.query(`
        UPDATE leave_settings SET
          working_hours = ?,
          working_days = ?,
          leave_types = ?,
          custom_leaves = ?,
          leave_status = ?,
          leave_quotas = ?,
          selected_leaves = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [
        workingHours,
        workingDays,
        JSON.stringify(finalLeaveTypes),
        JSON.stringify(finalCustomLeaves),
        JSON.stringify(finalLeaveStatus),
        JSON.stringify(finalLeaveQuotas),
        JSON.stringify(finalSelectedLeaves),
        existing.id
      ]);
    } else {
      // Insert new settings
      await pool.query(`
        INSERT INTO leave_settings (
          working_hours, working_days,
          leave_types, custom_leaves,
          leave_status, leave_quotas,
          selected_leaves
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        workingHours,
        workingDays,
        JSON.stringify(leaveTypes),
        JSON.stringify(customLeaves),
        JSON.stringify(leaveStatus),
        JSON.stringify(leaveQuotas),
        JSON.stringify(selectedLeaves)
      ]);
    }

    res.status(200).json({
      success: true,
      message: 'Settings saved successfully'
    });

  } catch (err) {
    console.error('Error saving leave settings:', err);
    res.status(500).json({
      success: false,
      error: `Failed to save settings: ${err.message}`
    });
  }
}
  ,
};
