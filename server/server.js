// The server that ships to an HR machine: serves the built UI and mounts the
// same /api/send-emails endpoint the dev server uses.
//
// It binds to 127.0.0.1 only, so the app is reachable from this computer and
// nothing else on the network.
import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, join, normalize, sep } from 'node:path'
import { mailMiddleware, sendJson } from './sendMail.js'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

async function serveStatic(root, req, res) {
  const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0])

  // Resolve inside root and reject anything that climbs out of it.
  const resolved = normalize(join(root, urlPath))
  if (resolved !== root && !resolved.startsWith(root + sep)) {
    res.statusCode = 403
    return res.end('Forbidden')
  }

  let file = resolved
  const info = await stat(file).catch(() => null)
  if (info?.isDirectory()) file = join(file, 'index.html')
  else if (!info) file = join(root, 'index.html') // single-page app fallback

  const final = await stat(file).catch(() => null)
  if (!final?.isFile()) {
    res.statusCode = 404
    return res.end('Not found')
  }

  res.setHeader('Content-Type', MIME[extname(file).toLowerCase()] ?? 'application/octet-stream')
  res.setHeader('Content-Length', final.size)
  // The bundle filenames are content-hashed by Vite, but this app is reinstalled
  // in place, so never let a stale copy survive an upgrade.
  res.setHeader('Cache-Control', 'no-store')
  createReadStream(file).pipe(res)
}

/**
 * Listen on the first free port at or after `port` on 127.0.0.1.
 * @returns {Promise<{server: import('node:http').Server, port: number}>}
 */
export function startServer({ root, port = 7331, maxTries = 20 }) {
  const staticRoot = normalize(root)

  const server = createServer((req, res) => {
    mailMiddleware(req, res, () => {
      serveStatic(staticRoot, req, res).catch((err) => sendJson(res, 500, { error: err.message }))
    })
  })

  return new Promise((resolve, reject) => {
    let attempt = 0
    const tryListen = () => {
      server.listen(port + attempt, '127.0.0.1')
    }
    server.on('listening', () => resolve({ server, port: server.address().port }))
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE' && ++attempt < maxTries) tryListen()
      else reject(err)
    })
    tryListen()
  })
}
