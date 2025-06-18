const db = require('../config/db');

exports.getAllContacts = async (req, res) => {
  try {
    const [contacts] = await db.query(`
      SELECT c.*, 
        GROUP_CONCAT(cc.company_name SEPARATOR ', ') AS companies
      FROM contacts c
      LEFT JOIN contact_companies cc ON c.id = cc.contact_id
      GROUP BY c.id
    `);
    
    res.status(200).json({
      status: 'success',
      results: contacts.length,
      data: { contacts }
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: err.message
    });
  }
};

exports.getContact = async (req, res) => {
  try {
    const [contactRows] = await db.query('SELECT * FROM contacts WHERE id = ?', [req.params.id]);
    
    if (contactRows.length === 0) {
      return res.status(404).json({
        status: 'fail',
        message: 'No contact found with that ID'
      });
    }

    const [companyRows] = await db.query(
      'SELECT company_name FROM contact_companies WHERE contact_id = ?', 
      [req.params.id]
    );

    const contact = contactRows[0];
    contact.companies = companyRows.map(row => row.company_name);

    res.status(200).json({
      status: 'success',
      data: { contact }
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: err.message
    });
  }
};

exports.createContact = async (req, res) => {
  const { name, phone, email, additionalNumber, companies, status = 'Active' } = req.body;
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // Insert contact
    const [contactResult] = await connection.query(
      'INSERT INTO contacts (name, phone, email, additional_number, status) VALUES (?, ?, ?, ?, ?)',
      [name, phone, email, additionalNumber, status]
    );

    // Insert companies
    const companyInserts = companies.map(company => 
      connection.query(
        'INSERT INTO contact_companies (contact_id, company_name) VALUES (?, ?)',
        [contactResult.insertId, company]
      )
    );
    await Promise.all(companyInserts);

    await connection.commit();

    // Get the newly created contact with companies
    const [newContactRows] = await connection.query('SELECT * FROM contacts WHERE id = ?', [contactResult.insertId]);
    const [newCompanyRows] = await connection.query(
      'SELECT company_name FROM contact_companies WHERE contact_id = ?', 
      [contactResult.insertId]
    );

    const newContact = newContactRows[0];
    newContact.companies = newCompanyRows.map(row => row.company_name);

    res.status(201).json({
      status: 'success',
      data: { contact: newContact }
    });
  } catch (err) {
    await connection.rollback();
    res.status(400).json({
      status: 'fail',
      message: err.message
    });
  } finally {
    connection.release();
  }
};

exports.updateContact = async (req, res) => {
  const { name, phone, email, additionalNumber, companies, status } = req.body;
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // Update contact
    const [updateResult] = await connection.query(
      'UPDATE contacts SET name = ?, phone = ?, email = ?, additional_number = ?, status = ? WHERE id = ?',
      [name, phone, email, additionalNumber, status, req.params.id]
    );

    if (updateResult.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({
        status: 'fail',
        message: 'No contact found with that ID'
      });
    }

    // Update companies - delete existing and insert new
    await connection.query('DELETE FROM contact_companies WHERE contact_id = ?', [req.params.id]);

    const companyInserts = companies.map(company => 
      connection.query(
        'INSERT INTO contact_companies (contact_id, company_name) VALUES (?, ?)',
        [req.params.id, company]
      )
    );
    await Promise.all(companyInserts);

    await connection.commit();

    // Get the updated contact with companies
    const [updatedContactRows] = await connection.query('SELECT * FROM contacts WHERE id = ?', [req.params.id]);
    const [updatedCompanyRows] = await connection.query(
      'SELECT company_name FROM contact_companies WHERE contact_id = ?', 
      [req.params.id]
    );

    const updatedContact = updatedContactRows[0];
    updatedContact.companies = updatedCompanyRows.map(row => row.company_name);

    res.status(200).json({
      status: 'success',
      data: { contact: updatedContact }
    });
  } catch (err) {
    await connection.rollback();
    res.status(400).json({
      status: 'fail',
      message: err.message
    });
  } finally {
    connection.release();
  }
};

exports.deleteContact = async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM contacts WHERE id = ?', [req.params.id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({
        status: 'fail',
        message: 'No contact found with that ID'
      });
    }

    res.status(204).json({
      status: 'success',
      data: null
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: err.message
    });
  }
};

exports.searchContacts = async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) {
      return res.status(400).json({
        status: 'fail',
        message: 'Search query is required'
      });
    }

    const [contacts] = await db.query(`
      SELECT c.*, 
        GROUP_CONCAT(cc.company_name SEPARATOR ', ') AS companies
      FROM contacts c
      LEFT JOIN contact_companies cc ON c.id = cc.contact_id
      WHERE c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ? OR cc.company_name LIKE ?
      GROUP BY c.id
    `, [`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`]);

    res.status(200).json({
      status: 'success',
      results: contacts.length,
      data: { contacts }
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: err.message
    });
  }
};