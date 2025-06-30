const pool = require('../config/db');
const crypto = require('crypto');
// You'll need to create this

exports.createForm = async (req, res) => {
    const { lead_id, name, fields } = req.body;
    
    try {
        // Verify lead exists
        const [leadCheck] = await pool.query(
            'SELECT id FROM leads WHERE id = ?',
            [lead_id]
        );
        
        if (!leadCheck || leadCheck.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Lead not found' 
            });
        }

        // Start transaction
        await pool.query('START TRANSACTION');

        // Create form
        const [formResult] = await pool.query(
            'INSERT INTO forms (lead_id, name) VALUES (?, ?)',
            [lead_id, name]
        );
        
        const formId = formResult.insertId;
        const shareId = crypto.randomBytes(8).toString('hex');

        // Update form with share ID
        await pool.query(
            'UPDATE forms SET share_id = ? WHERE id = ?',
            [shareId, formId]
        );

        // Save form fields
        for (const [index, field] of fields.entries()) {
            // Parse config if it's a string (frontend might send stringified JSON)
            const config = typeof field.config === 'string' ? 
                JSON.parse(field.config) : 
                field.config;
                
            const styles = typeof field.styles === 'string' ? 
                JSON.parse(field.styles) : 
                field.styles;

            await pool.query(
                `INSERT INTO form_fields 
                (form_id, field_id, type, field_type, config, styles, sort_order) 
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    formId,
                    field.field_id,
                    field.type,  // Make sure this is included
                    field.type,
                    JSON.stringify(config),
                    JSON.stringify(styles),
                    index
                ]
            );
        }

        // Commit transaction
        await pool.query('COMMIT');

        res.status(201).json({
            success: true,
            message: 'Form created successfully',
            formId: formId,
            shareId: shareId,
            formUrl: `${""}/form/${shareId}`
        });
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Error creating form:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to create form',
            error: error.message
        });
    }
};
// Get forms by lead_id
exports.getFormsByLead = async (req, res) => {
    const leadId = req.params.leadId;
    
    try {
        // Verify lead exists - MySQL uses ? instead of $1
        const [leadCheck] = await pool.query(
            'SELECT id FROM leads WHERE id = ?',
            [leadId]
        );
        
        if (leadCheck.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Lead not found' 
            });
        }

        // Get forms with submission counts - use ? placeholder
        const [formsResult] = await pool.query(
            `SELECT f.id, f.name, f.share_id, f.created_at, 
                COUNT(s.id) AS submission_count
             FROM forms f
             LEFT JOIN form_submissions s ON f.id = s.form_id
             WHERE f.lead_id = ?
             GROUP BY f.id
             ORDER BY f.created_at DESC`,
            [leadId]
        );
        
        // Get field counts - use ? placeholder
        const formsWithDetails = await Promise.all(
            formsResult.map(async form => {
                const [fieldsResult] = await pool.query(
                    'SELECT COUNT(*) AS field_count FROM form_fields WHERE form_id = ?',
                    [form.id]
                );
                return {
                    ...form,
                    field_count: fieldsResult[0].field_count
                };
            })
        );
        
        res.status(200).json({
            success: true,
            forms: formsWithDetails
        });
    } catch (error) {
        console.error('Error fetching forms:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to fetch forms',
            error: error.message  // Include error message for debugging
        });
    }
};  
// Get form by share ID
exports.getSharedForm = async (req, res) => {
    const shareId = req.params.shareId;
    
    try {
        // Get form - using ? for MySQL parameter placeholder
        const [formResult] = await pool.query(
            'SELECT * FROM forms WHERE share_id = ?',
            [shareId]
        );
        
        if (formResult.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Form not found' 
            });
        }
        const form = formResult[0];

        // Get lead details
        const [leadResult] = await pool.query(
            'SELECT client, sales_person FROM leads WHERE id = ?',
            [form.lead_id]
        );
        const lead = leadResult[0];

        // Get form fields
        const [fieldsResult] = await pool.query(
            `SELECT field_id, type, config, styles 
             FROM form_fields 
             WHERE form_id = ? 
             ORDER BY sort_order`,
            [form.id]
        );
        
        res.status(200).json({
            success: true,
            form: {
                id: form.id,
                name: form.name,
                lead: {
                    client: lead.client,
                    sales_person: lead.sales_person
                },
                fields: fieldsResult
            }
        });
    } catch (error) {
        console.error('Error fetching form:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to fetch form' 
        });
    }
};

// Submit form response
exports.submitFormResponse = async (req, res) => {
    const { shareId, lead_id, responses } = req.body;
    
    try {
        // Get form ID
        const formResult = await pool.query(
            'SELECT id FROM forms WHERE share_id = $1',
            [shareId]
        );
        
        if (formResult.rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Form not found' 
            });
        }
        const formId = formResult.rows[0].id;

        // Save submission
        await pool.query(
            'INSERT INTO form_submissions (form_id, lead_id, data) VALUES ($1, $2, $3)',
            [formId, lead_id, responses]
        );
        
        res.status(201).json({ 
            success: true, 
            message: 'Form submitted successfully' 
        });
    } catch (error) {
        console.error('Error submitting form:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to submit form' 
        });
    }
};

// Get form submissions
exports.getFormSubmissions = async (req, res) => {
    const formId = req.params.formId;
    
    try {
        // Verify form exists
        const formCheck = await pool.query(
            'SELECT id FROM forms WHERE id = $1',
            [formId]
        );
        
        if (formCheck.rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Form not found' 
            });
        }

        // Get submissions with lead details
        const result = await pool.query(
            `SELECT s.*, l.client, l.sales_person, l.client_coordinator
             FROM form_submissions s
             JOIN leads l ON s.lead_id = l.id
             WHERE form_id = $1
             ORDER BY submitted_at DESC`,
            [formId]
        );
        
        res.status(200).json({
            success: true,
            submissions: result.rows
        });
    } catch (error) {
        console.error('Error fetching submissions:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to fetch submissions' 
        });
    }
};

// Get lead forms with submissions
exports.getLeadFormsWithSubmissions = async (req, res) => {
    const leadId = req.params.leadId;
    
    try {
        // Get forms
        const formsResult = await pool.query(
            'SELECT * FROM forms WHERE lead_id = $1 ORDER BY created_at DESC',
            [leadId]
        );
        
        // Get form details with submissions
        const formsWithSubmissions = await Promise.all(
            formsResult.rows.map(async form => {
                const submissions = await pool.query(
                    'SELECT COUNT(*) FROM form_submissions WHERE form_id = $1',
                    [form.id]
                );
                return {
                    ...form,
                    submission_count: parseInt(submissions.rows[0].count)
                };
            })
        );
        
        res.status(200).json({
            success: true,
            forms: formsWithSubmissions
        });
    } catch (error) {
        console.error('Error fetching lead forms:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to fetch lead forms' 
        });
    }
};
exports.updateForm = async (req, res) => {
  const { formId } = req.params;
  const { name, fields } = req.body;

  try {
    // Start transaction
    await pool.query('BEGIN');

    // 1. Update only the form name (remove styles from this query)
    await pool.query(
      'UPDATE forms SET name = ?, updated_at = NOW() WHERE id = ?',
      [name, formId]
    );

    // Rest of your existing code...
    // 2. Delete existing fields
    await pool.query(
      'DELETE FROM form_fields WHERE form_id = ?',
      [formId]
    );

    // 3. Insert the updated fields
    for (const field of fields) {
      await pool.query(
        `INSERT INTO form_fields 
         (form_id, field_id, type, field_type, config, styles, sort_order) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          formId,
          field.field_id,
          field.type,
          field.type,
          JSON.stringify(field.config || {}),
          JSON.stringify(field.styles || {}),
          field.sort_order || 0
        ]
      );
    }

    // Commit transaction
    await pool.query('COMMIT');

    // 4. Get the updated form to return
    const [updatedForm] = await pool.query(
      'SELECT * FROM forms WHERE id = ?',
      [formId]
    );

    const [formFields] = await pool.query(
      'SELECT * FROM form_fields WHERE form_id = ? ORDER BY sort_order',
      [formId]
    );

    res.status(200).json({
      success: true,
      form: {
        ...updatedForm[0],
        fields: formFields.map(f => ({
          ...f,
          config: typeof f.config === 'string' ? JSON.parse(f.config) : f.config,
          styles: typeof f.styles === 'string' ? JSON.parse(f.styles) : f.styles
        }))
      }
    });

  } catch (error) {
    // Rollback transaction on error
    await pool.query('ROLLBACK');
    console.error('Error updating form:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update form',
      error: error.message 
    });
  }
};