const pool = require('../config/db');
const multer = require('multer');
const path = require('path');

// Configure storage for uploaded files
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage }).array('files');

// Helper to parse lead data
const parseLead = (row) => {
  // Handle upload_documents conversion safely
  let uploadDocuments = [];
  
  if (row.upload_documents) {
    try {
      // Try to parse as JSON
      const parsed = JSON.parse(row.upload_documents);
      uploadDocuments = Array.isArray(parsed) ? parsed : [parsed];
    } catch (e) {
      // If not valid JSON, treat as string path
      uploadDocuments = [row.upload_documents];
    }
  }

  return {
    id: row.id,
    date: row.date.toISOString().split('T')[0],
    client: row.client,
    salesPerson: row.sales_person,
    clientCoordinator: row.client_coordinator,
    destination: row.destination,
    paxCount: row.pax_count,
    travelingDate: row.traveling_date.toISOString().split('T')[0],
    quoteDateTime: row.quote_date_time.toISOString().replace('T', ' ').substring(0, 16),
    modeOfBidding: row.mode_of_bidding,
    rfqStatus: row.rfq_status,
    totalPaxDataReceived: row.total_pax_data_received,
    finalTravelerCount: row.final_traveler_count,
    finalCost: parseFloat(row.final_cost),
    l1Cost: parseFloat(row.l1_cost),
    dateOfRfqConfirm: row.date_of_rfq_confirm.toISOString().split('T')[0],
    remark: row.remark,
    whoWinTheRfq: row.who_win_the_rfq,
    operationFileLink: row.operation_file_link,
    uploadDocuments: uploadDocuments,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

// Get all leads
const getLeads = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM leads ORDER BY created_at DESC');
    const leads = rows.map(parseLead);
    res.json(leads);
  } catch (error) {
    console.error('Error fetching leads:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Create a new lead
const createLead = (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      console.error('File upload error:', err);
      return res.status(400).json({ message: 'File upload failed' });
    }

    try {
      // Extract form data
      const formData = req.body;
      
      // Get file paths
      const filePaths = req.files ? req.files.map(file => `/uploads/${file.filename}`) : [];
      
      // Prepare data for database
      const leadData = {
        date: new Date(formData.date),
        client: formData.client,
        sales_person: formData.salesPerson,
        client_coordinator: formData.clientCoordinator,
        destination: formData.destination,
        pax_count: parseInt(formData.paxCount),
        traveling_date: new Date(formData.travelingDate),
        quote_date_time: new Date(formData.quoteDateTime),
        mode_of_bidding: formData.modeOfBidding,
        rfq_status: formData.rfqStatus,
        total_pax_data_received: parseInt(formData.totalPaxDataReceived),
        final_traveler_count: parseInt(formData.finalTravelerCount),
        final_cost: parseFloat(formData.finalCost),
        l1_cost: parseFloat(formData.l1Cost),
        date_of_rfq_confirm: new Date(formData.dateOfRfqConfirm),
        remark: formData.remark,
        who_win_the_rfq: formData.whoWinTheRfq,
        operation_file_link: formData.operationFileLink,
        upload_documents: JSON.stringify(filePaths)
      };

      const [result] = await pool.query('INSERT INTO leads SET ?', [leadData]);
      
      // Fetch the new lead
      const [newLead] = await pool.query('SELECT * FROM leads WHERE id = ?', [result.insertId]);
      res.status(201).json(parseLead(newLead[0]));
    } catch (error) {
      console.error('Error creating lead:', error);
      res.status(400).json({ message: 'Error creating lead' });
    }
  });
};

// Update a lead
const updateLead = async (req, res) => {
  const leadId = req.params.id;
  const updateData = req.body;

  try {
    await pool.query(
      `UPDATE leads SET
        date = ?,
        client = ?,
        sales_person = ?,
        client_coordinator = ?,
        destination = ?,
        pax_count = ?,
        traveling_date = ?,
        quote_date_time = ?,
        mode_of_bidding = ?,
        rfq_status = ?,
        total_pax_data_received = ?,
        final_traveler_count = ?,
        final_cost = ?,
        l1_cost = ?,
        date_of_rfq_confirm = ?,
        remark = ?,
        who_win_the_rfq = ?,
        operation_file_link = ?,
        upload_documents = ?
      WHERE id = ?`,
      [
        new Date(updateData.date),
        updateData.client,
        updateData.salesPerson,
        updateData.clientCoordinator,
        updateData.destination,
        parseInt(updateData.paxCount),
        new Date(updateData.travelingDate),
        new Date(updateData.quoteDateTime),
        updateData.modeOfBidding,
        updateData.rfqStatus,
        parseInt(updateData.totalPaxDataReceived),
        parseInt(updateData.finalTravelerCount),
        parseFloat(updateData.finalCost),
        parseFloat(updateData.l1Cost),
        new Date(updateData.dateOfRfqConfirm),
        updateData.remark,
        updateData.whoWinTheRfq,
        updateData.operationFileLink,
        JSON.stringify(updateData.uploadDocuments || []),
        leadId
      ]
    );

    const [updatedLead] = await pool.query('SELECT * FROM leads WHERE id = ?', [leadId]);
    if (!updatedLead.length) {
      return res.status(404).json({ message: 'Lead not found' });
    }
    
    res.json(parseLead(updatedLead[0]));
  } catch (error) {
    console.error('Error updating lead:', error);
    res.status(400).json({ message: 'Error updating lead' });
  }
};

// Delete a lead
const deleteLead = async (req, res) => {
  const leadId = req.params.id;
  
  try {
    const [result] = await pool.query('DELETE FROM leads WHERE id = ?', [leadId]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Lead not found' });
    }
    
    res.json({ message: 'Lead deleted successfully' });
  } catch (error) {
    console.error('Error deleting lead:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getLeads,
  createLead,
  updateLead,
  deleteLead
};