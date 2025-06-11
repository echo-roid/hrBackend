const pool = require('../config/db');


const BASE_URL = 'hrbackend-production-34b4.up.railway.app'; // Adjust if deployed

function getFullUrl(filePath) {
    return filePath ? `${BASE_URL}/${filePath.replace(/\\/g, '/')}` : null;
}



module.exports = {

    submitEmployeeForm: async (req, res) => {
        try {
            const data = req.body;
            const files = req.files || {};
            let emergencyContacts = [];
            try {
                emergencyContacts = Array.isArray(data.emergencyContacts)
                    ? data.emergencyContacts
                    : JSON.parse(data.emergencyContacts || '[]');
            } catch (e) {
                console.error("Failed to parse emergencyContacts:", data.emergencyContacts);
                return res.status(400).json({ error: 'Invalid emergencyContacts format' });
            }

            // Basic details
            const {
                title, firstName, lastName, contactNumber,
                fatherName, motherName, birthDate, email, bloodGroup
            } = data;

            // Identity details
            const {
                aadharCard, address, houseNumber, state, city
            } = data;

            // Passport details (optional)
            const {
                passportSurname, passportGivenNames, passportDob, passportPlaceOfBirth,
                passportNumber, passportIssueDate, passportExpireDate, passportNationality,
                passportSex, passportPlaceOfIssue, passportMotherName, passportFatherName
            } = data;

            // Financial details
            const {
                pan, bankAccountName, bankName, bankAccountNumber, bankIfsc, bankBranch, uan
            } = data;

            // File paths
            const photoPath = files.photo?.[0]?.path || null;
            const aadharFrontPath = files.Aadhar?.[0]?.path || null;
            const aadharBackPath = files.AadharBack?.[0]?.path || null;
            const passportFrontPath = files.passportFront?.[0]?.path || null;
            const passportBackPath = files.passportBack?.[0]?.path || null;
            const edu10thPath = files.edu10th?.[0]?.path || null;
            const edu12thPath = files.edu12th?.[0]?.path || null;
            const graduationPath = files.graduation?.[0]?.path || null;
            const diplomaPath = files.diploma?.[0]?.path || null;
            const panDocumentPath = files.panDocument?.[0]?.path || null;
            const cancelChequePath = files.cancelCheque?.[0]?.path || null;
            const uanDocumentPath = files.uanDocument?.[0]?.path || null;

            // Start transaction
            await pool.query('START TRANSACTION');

            // Insert main employee record
            const insertEmployeeQuery = `
            INSERT INTO empshateform (
              title, first_name, last_name, contact_number, father_name, mother_name,
              birth_date, email, blood_group, photo_path,
              aadhar_number, address, house_number, state, city,
              aadhar_front_path, aadhar_back_path,
              passport_surname, passport_given_names, passport_dob, passport_place_of_birth,
              passport_number, passport_issue_date, passport_expire_date, passport_nationality,
              passport_sex, passport_place_of_issue, passport_mother_name, passport_father_name,
              passport_front_path, passport_back_path,
              pan_number, bank_account_name, bank_name, bank_account_number, bank_ifsc, bank_branch,
              uan_number, pan_document_path, cancel_cheque_path, uan_document_path,
              edu_10th_path, edu_12th_path, graduation_path, diploma_path
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `;
          

          const [employeeResult] = await pool.query(insertEmployeeQuery, [
            title, firstName, lastName, contactNumber, fatherName, motherName,
            birthDate, email, bloodGroup, photoPath,
            aadharCard, address, houseNumber, state, city,
            aadharFrontPath, aadharBackPath,
            passportSurname, passportGivenNames, passportDob, passportPlaceOfBirth,
            passportNumber, passportIssueDate, passportExpireDate, passportNationality,
            passportSex, passportPlaceOfIssue, passportMotherName, passportFatherName,
            passportFrontPath, passportBackPath,
            pan, bankAccountName, bankName, bankAccountNumber, bankIfsc, bankBranch,
            uan, panDocumentPath, cancelChequePath, uanDocumentPath,
            edu10thPath, edu12thPath, graduationPath, diplomaPath
          ]);
          

            const employeeId = employeeResult.insertId;

            // Insert emergency contacts
            if (emergencyContacts.length > 0) {
                const insertContactQuery = `
            INSERT INTO emergency_contacts (employee_id, name, relation, phone)
            VALUES (?, ?, ?, ?)
          `;

                for (const contact of emergencyContacts) {
                    await pool.query(insertContactQuery, [
                        employeeId,
                        contact.name,
                        contact.relation,
                        contact.phone
                    ]);
                }
            }

            // Commit transaction
            await pool.query('COMMIT');

            // Get the full employee record with emergency contacts
            const [employeeRows] = await pool.query('SELECT * FROM empshateform WHERE id = ?', [employeeId]);
            const [contactRows] = await pool.query('SELECT * FROM emergency_contacts WHERE employee_id = ?', [employeeId]);

            const employee = {
                ...employeeRows[0],
                emergencyContacts: contactRows,
                photo_path: getFullUrl(employeeRows[0].photo_path),
                aadhar_front_path: getFullUrl(employeeRows[0].aadhar_front_path),
                aadhar_back_path: getFullUrl(employeeRows[0].aadhar_back_path),
                passport_front_path: getFullUrl(employeeRows[0].passport_front_path),
                passport_back_path: getFullUrl(employeeRows[0].passport_back_path),
                edu_10th_path: getFullUrl(employeeRows[0].edu_10th_path),
                edu_12th_path: getFullUrl(employeeRows[0].edu_12th_path),
                graduation_path: getFullUrl(employeeRows[0].graduation_path),
                diploma_path: getFullUrl(employeeRows[0].diploma_path),
                pan_document_path: getFullUrl(employeeRows[0].pan_document_path),
                cancel_cheque_path: getFullUrl(employeeRows[0].cancel_cheque_path),
                uan_document_path: getFullUrl(employeeRows[0].uan_document_path)
            };

            res.status(201).json({
                message: 'Employee registered successfully!',
                employee
            });

        } catch (err) {
            await pool.query('ROLLBACK');
            console.error('Error submitting employee form:', err);
            res.status(500).json({ error: 'Server error' });
        }
    },

    listEmployees: async (req, res) => {
        try {
            // Get all employees with their emergency contacts
            const [employeeRows] = await pool.query('SELECT * FROM empshateform ORDER BY id DESC');

            const employees = await Promise.all(employeeRows.map(async (emp) => {
                const [contacts] = await pool.query('SELECT * FROM emergency_contacts WHERE employee_id = ?', [emp.id]);

                return {
                    ...emp,
                    emergencyContacts: contacts,
                    photo_path: getFullUrl(emp.photo_path),
                    aadhar_front_path: getFullUrl(emp.aadhar_front_path),
                    aadhar_back_path: getFullUrl(emp.aadhar_back_path),
                    passport_front_path: getFullUrl(emp.passport_front_path),
                    passport_back_path: getFullUrl(emp.passport_back_path),
                    edu_10th_path: getFullUrl(emp.edu_10th_path),
                    edu_12th_path: getFullUrl(emp.edu_12th_path),
                    graduation_path: getFullUrl(emp.graduation_path),
                    diploma_path: getFullUrl(emp.diploma_path),
                    pan_document_path: getFullUrl(emp.pan_document_path),
                    cancel_cheque_path: getFullUrl(emp.cancel_cheque_path),
                    uan_document_path: getFullUrl(emp.uan_document_path)
                };
            }));

            res.status(200).json({ employees });
        } catch (err) {
            console.error('Error fetching employee list:', err);
            res.status(500).json({ error: 'Server error' });
        }
    }
};