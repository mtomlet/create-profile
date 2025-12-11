const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

const CONFIG = {
  AUTH_URL: 'https://d18devmarketplace.meevodev.com/oauth2/token',
  API_URL: 'https://d18devpub.meevodev.com/publicapi/v1',
  CLIENT_ID: 'a7139b22-775f-4938-8ecb-54aa23a1948d',
  CLIENT_SECRET: 'b566556f-e65d-47dd-a27d-dd1060d9fe2d',
  TENANT_ID: '4',
  LOCATION_ID: '5'
};

let token = null;
let tokenExpiry = null;

async function getToken() {
  if (token && tokenExpiry && Date.now() < tokenExpiry - 300000) return token;

  const res = await axios.post(CONFIG.AUTH_URL, {
    client_id: CONFIG.CLIENT_ID,
    client_secret: CONFIG.CLIENT_SECRET
  });

  token = res.data.access_token;
  tokenExpiry = Date.now() + (res.data.expires_in * 1000);
  return token;
}

app.post('/create', async (req, res) => {
  try {
    const { first_name, last_name, phone, email, date_of_birth, how_did_you_hear } = req.body;

    if (!first_name || !last_name || !email) {
      return res.json({
        success: false,
        error: 'Please provide first_name, last_name, and email'
      });
    }

    // Note: DOB and Referral are collected but NOT sent to Meevo
    // (Meevo Public API doesn't support these fields)
    console.log('Collected (not saved to Meevo):', { date_of_birth, how_did_you_hear });

    const authToken = await getToken();

    // Step 1: Check if client already exists
    const clientsRes = await axios.get(
      `${CONFIG.API_URL}/clients?TenantId=${CONFIG.TENANT_ID}&LocationId=${CONFIG.LOCATION_ID}`,
      { headers: { Authorization: `Bearer ${authToken}` }}
    );

    const clients = clientsRes.data.data || clientsRes.data;
    const existingClient = clients.find(c =>
      c.email?.toLowerCase() === email.toLowerCase()
    );

    if (existingClient) {
      console.log('Client already exists:', existingClient.id);
      return res.json({
        success: true,
        client_id: existingClient.id,
        message: 'Profile already exists',
        client_name: `${existingClient.firstName} ${existingClient.lastName}`,
        existing: true
      });
    }

    // Step 2: Create new client profile
    const clientData = {
      FirstName: first_name,
      LastName: last_name,
      EmailAddress: email,  // Correct field name
      ObjectState: 2026,  // Active
      OnlineBookingAccess: true
    };

    // Add phone number in correct array format
    if (phone) {
      const cleanPhone = phone.replace(/\D/g, '');
      clientData.PhoneNumbers = [{
        Type: 21,  // Mobile phone type
        CountryCode: "1",
        Number: cleanPhone,
        IsPrimary: true,
        SmsCommOptedInState: 2087
      }];
    }

    // DOB and Referral NOT supported by Meevo Public API
    // These fields are collected by Retell but not saved to Meevo

    const createRes = await axios.post(
      `${CONFIG.API_URL}/client?TenantId=${CONFIG.TENANT_ID}&LocationId=${CONFIG.LOCATION_ID}`,
      clientData,
      { headers: { Authorization: `Bearer ${authToken}` }}
    );

    const clientId = createRes.data.clientId || createRes.data.data?.clientId || createRes.data.id;
    console.log('New client created:', clientId);

    if (!clientId) {
      return res.json({
        success: false,
        error: 'Client profile created but no ID returned',
        debug: createRes.data
      });
    }

    res.json({
      success: true,
      client_id: clientId,
      message: 'Profile created successfully',
      client_name: `${first_name} ${last_name}`,
      existing: false
    });

  } catch (error) {
    console.error('Create profile error:', error.message);
    res.json({
      success: false,
      error: error.response?.data?.error?.message || error.message
    });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Create profile server running on port ${PORT}`));
