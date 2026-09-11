// Entry point for the packaged app. Starts the local server, opens the UI in
// an Edge/Chrome app window, and shuts down when that window is closed.
//
// esbuild bundles this file (plus nodemailer) into one .cjs that runs on the
// node.exe shipped beside it, so an HR machine needs nothing installed.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { startServer } from './server.js'

const APP_NAME = 'Ganit Attendance'

// Edge is on every Windows 11 machine; Chrome is the fallback for the rest.
function findBrowser() {
  const candidates = [
    join(process.env['ProgramFiles(x86)'] ?? '', 'Microsoft/Edge/Application/msedge.exe'),
    join(process.env.ProgramFiles ?? '', 'Microsoft/Edge/Application/msedge.exe'),
    join(process.env['ProgramFiles(x86)'] ?? '', 'Google/Chrome/Application/chrome.exe'),
    join(process.env.ProgramFiles ?? '', 'Google/Chrome/Application/chrome.exe'),
    join(process.env.LOCALAPPDATA ?? '', 'Google/Chrome/Application/chrome.exe'),
  ]
  return candidates.find((p) => p && existsSync(p)) ?? null
}

function banner(lines) {
  const width = Math.max(...lines.map((l) => l.length)) + 4
  console.log('\n  ' + '='.repeat(width))
  for (const l of lines) console.log('  = ' + l.padEnd(width - 4) + ' =')
  console.log('  ' + '='.repeat(width) + '\n')
}

async function main() {
  const root = join(__dirname, 'dist')
  const profileDir = join(__dirname, 'browser-profile')

  const { server, port } = await startServer({ root })
  const url = `http://127.0.0.1:${port}/`
  process.title = `${APP_NAME} — keep this window open`

  // --no-browser: used by Setup.ps1 to prove the server starts, without
  // flashing a window in the installer's face.
  const browser = process.argv.includes('--no-browser') ? null : findBrowser()
  if (process.argv.includes('--no-browser')) {
    console.log(`  ${APP_NAME} is serving on ${url}`)
    return
  }
  if (browser) {
    banner([
      `${APP_NAME} is running.`,
      '',
      'Keep this window open while you use the app.',
      'Closing the app window closes this one too.',
    ])
    // A dedicated profile directory matters: without it Edge hands the URL to an
    // already-running Edge and exits immediately, and we would quit on the spot.
    const child = spawn(browser, [`--app=${url}`, `--user-data-dir=${profileDir}`, '--no-first-run'], {
      stdio: 'ignore',
    })
    child.on('exit', () => {
      server.close()
      process.exit(0)
    })
    child.on('error', () => {
      console.log(`  Could not start the browser. Open this address yourself: ${url}\n`)
    })
  } else {
    banner([
      `${APP_NAME} is running at ${url}`,
      '',
      'Neither Edge nor Chrome was found, so it opened in your',
      'default browser. Keep this window open while you use it.',
    ])
    spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', detached: true }).unref()
  }

  process.on('SIGINT', () => {
    server.close()
    process.exit(0)
  })
}

main().catch((err) => {
  console.error(`
  ${APP_NAME} could not start: ${err.message}
`)
  process.exitCode = 1
})
