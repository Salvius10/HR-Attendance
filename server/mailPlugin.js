// Vite plugin that adds a POST /api/send-emails endpoint to the dev/preview
// server. Sends via Microsoft 365 SMTP with credentials supplied per-request
// from the UI — nothing is stored server-side.
import nodemailer from 'nodemailer'

const SMTP_HOST = 'smtp.office365.com'
const SMTP_PORT = 587

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new Error('Invalid JSON body'))
      }
    })
    req.on('error', reject)
  })
}

function sendJson(res, status, data) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(data))
}

async function handleSend(req, res) {
  let body
  try {
    body = await readJsonBody(req)
  } catch (err) {
    return sendJson(res, 400, { error: err.message })
  }
  const { from, password, messages } = body ?? {}
  if (!from || !from.includes('@')) return sendJson(res, 400, { error: 'A valid from address is required.' })
  if (!password) return sendJson(res, 400, { error: 'The email password is required.' })
  if (!Array.isArray(messages) || messages.length === 0) {
    return sendJson(res, 400, { error: 'No messages to send.' })
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: false, // STARTTLS
    auth: { user: from, pass: password },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
  })

  // Fail fast on bad credentials before attempting any sends.
  try {
    await transporter.verify()
  } catch (err) {
    return sendJson(res, 401, {
      error: `Could not sign in to ${SMTP_HOST} as ${from}: ${err.message}. ` +
        'Check the password (or app password) and that SMTP AUTH is enabled for this mailbox.',
    })
  }

  const results = []
  for (const m of messages) {
    if (!m?.to || !String(m.to).includes('@')) {
      results.push({ to: m?.to ?? '', ok: false, error: 'Missing recipient address' })
      continue
    }
    try {
      await transporter.sendMail({ from, to: m.to, subject: m.subject ?? '', html: m.html ?? '' })
      results.push({ to: m.to, ok: true })
    } catch (err) {
      results.push({ to: m.to, ok: false, error: err.message })
    }
  }
  transporter.close()
  sendJson(res, 200, { results })
}

function middleware(req, res, next) {
  if (req.url !== '/api/send-emails') return next()
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST only' })
  handleSend(req, res).catch((err) => sendJson(res, 500, { error: err.message }))
}

export default function mailPlugin() {
  return {
    name: 'hr-attendance-mail',
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}
