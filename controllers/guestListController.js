const pool = require('../config/db');

// Upload guest list and save as one record (replace old data)
exports.uploadGuestList = async (req, res) => {
    const { leadId } = req.params;
    const { guestData } = req.body; // Expecting an array of guests

    if (!Array.isArray(guestData) || guestData.length === 0) {
        return res.status(400).json({ success: false, message: 'No guest data provided.' });
    }

    try {
        // Verify lead exists
        const [leadCheck] = await pool.query(
            'SELECT id FROM leads WHERE id = ?',
            [leadId]
        );

        if (leadCheck.length === 0) {
            return res.status(404).json({ success: false, message: 'Lead not found.' });
        }

        // ✅ Delete old guest list for this lead
        await pool.query('DELETE FROM guest_lists WHERE lead_id = ?', [leadId]);

        // ✅ Save all guest data as a single JSON array
        await pool.query(
            'INSERT INTO guest_lists (lead_id, guest_data) VALUES (?, ?)',
            [leadId, JSON.stringify(guestData)]
        );

        res.status(201).json({
            success: true,
            message: 'Guest list uploaded successfully.'
        });

    } catch (error) {
        console.error('Error uploading guest list:', error);
        res.status(500).json({ success: false, message: 'Failed to upload guest list.' });
    }
};


exports.getGuestListByLead = async (req, res) => {
    try {
        const { leadId } = req.params;

        const [rows] = await pool.query('SELECT * FROM guest_lists WHERE lead_id = ?', [leadId]);

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Guest list not found for this lead' });
        }

        // Parse guest_data correctly
        const guestList = rows.map(row => ({
            ...row,
            guestData: typeof row.guest_data === 'string' ? JSON.parse(row.guest_data) : row.guest_data
        }));

        res.json(guestList[0]); // Return the first (and only) guest list for this lead

    } catch (error) {
        console.error('Error fetching guest list:', error);
        res.status(500).json({ error: 'Server error' });
    }
};
