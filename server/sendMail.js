// POST /api/send-emails — sends the drafted low-attendance emails through
// Microsoft 365 SMTP with credentials supplied per-request from the UI.
// Nothing is stored: the password lives only for the duration of the request.
//
// Shared by two hosts: the Vite dev/preview server (server/mailPlugin.js) and
// the standalone server that ships to HR machines (server/server.js).
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

/** Accepts an array or a "a@x.com, b@y.com" string; returns trimmed, non-empty addresses. */
function normalizeAddresses(value) {
  const parts = Array.isArray(value) ? value : String(value ?? '').split(/[,;]/)
  return parts.map((a) => String(a ?? '').trim()).filter(Boolean)
}

export function sendJson(res, status, data) {
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
  const { from, password, cc, messages } = body ?? {}
  if (!from || !from.includes('@')) return sendJson(res, 400, { error: 'A valid from address is required.' })
  if (!password) return sendJson(res, 400, { error: 'The email password is required.' })
  if (!Array.isArray(messages) || messages.length === 0) {
    return sendJson(res, 400, { error: 'No messages to send.' })
  }

  // One cc list for the whole batch; a message may add its own on top.
  const ccAll = normalizeAddresses(cc)
  const bad = ccAll.find((a) => !a.includes('@'))
  if (bad) return sendJson(res, 400, { error: `"${bad}" is not a valid cc address.` })

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
    const ccFor = [...new Set([...ccAll, ...normalizeAddresses(m.cc)])]
      .filter((a) => a.toLowerCase() !== String(m.to).toLowerCase())
    try {
      await transporter.sendMail({
        from,
        to: m.to,
        ...(ccFor.length > 0 ? { cc: ccFor } : {}),
        subject: m.subject ?? '',
        html: m.html ?? '',
      })
      results.push({ to: m.to, ok: true, cc: ccFor })
    } catch (err) {
      results.push({ to: m.to, ok: false, error: err.message })
    }
  }
  transporter.close()
  sendJson(res, 200, { results })
}

/** Connect-style middleware: handles /api/send-emails, passes everything else on. */
export function mailMiddleware(req, res, next) {
  const path = (req.url ?? '').split('?')[0]
  if (path !== '/api/send-emails') return next()
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST only' })
  handleSend(req, res).catch((err) => sendJson(res, 500, { error: err.message }))
}
