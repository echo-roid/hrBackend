const db = require('../config/db');

exports.getAllCompanies = async (req, res) => {
  try {
    const [companies] = await db.query(`
      SELECT * FROM companies
      ORDER BY created_at DESC
    `);
    
    res.status(200).json({
      status: 'success',
      results: companies.length,
      data: { companies }
    });
  } catch (err) {
    console.error('Error fetching companies:', err);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch companies'
    });
  }
};

exports.getCompany = async (req, res) => {
  try {
    const [company] = await db.query(`
      SELECT * FROM companies 
      WHERE id = ?
    `, [req.params.id]);

    if (company.length === 0) {
      return res.status(404).json({
        status: 'fail',
        message: 'No company found with that ID'
      });
    }

    res.status(200).json({
      status: 'success',
      data: { company: company[0] }
    });
  } catch (err) {
    console.error('Error fetching company:', err);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch company'
    });
  }
};

exports.createCompany = async (req, res) => {
  // Basic validation
  if (!req.body.name || !req.body.email || !req.body.contactPerson || !req.body.contactNumber) {
    return res.status(400).json({
      status: 'fail',
      message: 'Missing required fields (name, email, contactPerson, contactNumber)'
    });
  }

  const {
    name,
    email,
    address,
    contactPerson,
    cinNumber,
    gstNumber,
    website,
    panNumber,
    state,
    pinCode,
    relationManager,
    clientType,
    contactNumber,
    contracts,
    salesOwner,
    industryType,
    businessType,
    status = 'Active'
  } = req.body;

  try {
    const [result] = await db.query(`
      INSERT INTO companies (
        name, email, address, contact_person, cin_number, gst_number, 
        website, pan_number, state, pin_code, relation_manager, 
        client_type, contact_number, contracts, sales_owner, 
        industry_type, business_type, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      name, email, address, contactPerson, cinNumber, gstNumber,
      website, panNumber, state, pinCode, relationManager,
      clientType, contactNumber, contracts, salesOwner,
      industryType, businessType, status
    ]);

    const [newCompany] = await db.query(`
      SELECT * FROM companies 
      WHERE id = ?
    `, [result.insertId]);

    res.status(201).json({
      status: 'success',
      data: { company: newCompany[0] }
    });
  } catch (err) {
    console.error('Error creating company:', err);
    res.status(500).json({
      status: 'error',
      message: 'Failed to create company'
    });
  }
};

exports.updateCompany = async (req, res) => {
  // Basic validation
  if (!req.body.name || !req.body.email || !req.body.contactPerson || !req.body.contactNumber) {
    return res.status(400).json({
      status: 'fail',
      message: 'Missing required fields (name, email, contactPerson, contactNumber)'
    });
  }

  const {
    name,
    email,
    address,
    contactPerson,
    cinNumber,
    gstNumber,
    website,
    panNumber,
    state,
    pinCode,
    relationManager,
    clientType,
    contactNumber,
    contracts,
    salesOwner,
    industryType,
    businessType,
    status
  } = req.body;

  try {
    const [result] = await db.query(`
      UPDATE companies SET
        name = ?, email = ?, address = ?, contact_person = ?, 
        cin_number = ?, gst_number = ?, website = ?, pan_number = ?, 
        state = ?, pin_code = ?, relation_manager = ?, client_type = ?, 
        contact_number = ?, contracts = ?, sales_owner = ?, 
        industry_type = ?, business_type = ?, status = ?
      WHERE id = ?
    `, [
      name, email, address, contactPerson, cinNumber, gstNumber,
      website, panNumber, state, pinCode, relationManager,
      clientType, contactNumber, contracts, salesOwner,
      industryType, businessType, status, req.params.id
    ]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        status: 'fail',
        message: 'No company found with that ID'
      });
    }

    const [updatedCompany] = await db.query(`
      SELECT * FROM companies 
      WHERE id = ?
    `, [req.params.id]);

    res.status(200).json({
      status: 'success',
      data: { company: updatedCompany[0] }
    });
  } catch (err) {
    console.error('Error updating company:', err);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update company'
    });
  }
};

exports.deleteCompany = async (req, res) => {
  try {
    const [result] = await db.query(`
      DELETE FROM companies 
      WHERE id = ?
    `, [req.params.id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        status: 'fail',
        message: 'No company found with that ID'
      });
    }

    res.status(204).json({
      status: 'success',
      data: null
    });
  } catch (err) {
    console.error('Error deleting company:', err);
    res.status(500).json({
      status: 'error',
      message: 'Failed to delete company'
    });
  }
};

exports.searchCompanies = async (req, res) => {
  const { query } = req.query;
  
  if (!query) {
    return res.status(400).json({
      status: 'fail',
      message: 'Search query is required'
    });
  }

  try {
    const [companies] = await db.query(`
      SELECT * FROM companies
      WHERE name LIKE ? OR email LIKE ? OR contact_person LIKE ? 
      OR contact_number LIKE ? OR cin_number LIKE ? OR gst_number LIKE ?
      ORDER BY created_at DESC
    `, [
      `%${query}%`, `%${query}%`, `%${query}%`, 
      `%${query}%`, `%${query}%`, `%${query}%`
    ]);

    res.status(200).json({
      status: 'success',
      results: companies.length,
      data: { companies }
    });
  } catch (err) {
    console.error('Error searching companies:', err);
    res.status(500).json({
      status: 'error',
      message: 'Search failed'
    });
  }
};