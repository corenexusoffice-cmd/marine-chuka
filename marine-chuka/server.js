// Afropiano on Render: one small Node service that
//   1. serves the HTML/CSS/JS site from /public
//   2. runs the /api routes (orders, payment check, tickets, admin)
// The database is Supabase Postgres, reached only from here through DATABASE_URL.
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { URL } = require('url');

const PUBLIC = path.join(__dirname, 'public');
const PORT = process.env.PORT || 3000;

const API = {
  'catalog': require('./api/catalog'),
  'verify': require('./api/verify'),
  'status':
