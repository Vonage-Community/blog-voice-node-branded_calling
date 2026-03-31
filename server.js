'use strict';

const fs = require('node:fs');
const path = require('node:path');

const express = require('express');
const { Vonage } = require('@vonage/server-sdk');
require('dotenv').config();

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function loadPrivateKey(value) {
  if (value.includes('BEGIN PRIVATE KEY')) {
    return value;
  }

  const resolvedPath = path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
  return fs.readFileSync(resolvedPath, 'utf8');
}

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

const port = Number(process.env.PORT || 3000);

let vonage;
function getVonage() {
  if (vonage) return vonage;

  const applicationId = requiredEnv('VONAGE_APPLICATION_ID');
  const privateKeyValue = requiredEnv('VONAGE_PRIVATE_KEY_PATH');

  vonage = new Vonage({
    applicationId,
    privateKey: loadPrivateKey(privateKeyValue),
  });

  return vonage;
}

function getPublicBaseUrl() {
  const base = requiredEnv('PUBLIC_BASE_URL');
  return base.replace(/\/$/, '');
}

app.get('/health', (req, res) => {
  res.status(200).json({ ok: true });
});

app.post('/call', async (req, res) => {
  try {
    const to = (req.body && req.body.to) || process.env.TO_NUMBER;
    if (!to) {
      return res.status(400).json({ error: 'Missing destination number. Provide JSON body {"to":"+E164"} or set TO_NUMBER in env.' });
    }

    const fromNumber = requiredEnv('FROM_NUMBER');
    const publicBaseUrl = getPublicBaseUrl();

    const answerUrl = `${publicBaseUrl}/answer`;
    const eventUrl = `${publicBaseUrl}/event`;

    const client = getVonage();

    const resp = await client.voice.createOutboundCall({
      to: [{ type: 'phone', number: to }],
      from: { type: 'phone', number: fromNumber },
      answer_url: [answerUrl],
      event_url: [eventUrl],
    });

    return res.status(200).json({
      ok: true,
      to,
      from: fromNumber,
      answer_url: answerUrl,
      event_url: eventUrl,
      vonage: resp,
    });
  } catch (err) {
    return res.status(500).json({ error: err && err.message ? err.message : String(err) });
  }
});

app.get('/answer', (req, res) => {
  const companyName = process.env.COMPANY_NAME || 'our company';
  const greeting = process.env.GREETING || 'Thanks for taking our call.';

  const text = `Hi, this is ${companyName}. ${greeting}`;

  res.json([
    {
      action: 'talk',
      text,
    },
  ]);
});

app.post('/event', (req, res) => {
  const payload = req.body || {};
  console.log('VOICE_EVENT', JSON.stringify(payload));
  res.status(204).end();
});

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
