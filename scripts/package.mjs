/**
 * Assembles the folder that gets handed to an HR machine.
 *
 * `vite build` produces the UI in dist/; this bundles the server that serves
 * it (nodemailer and all) into a single .cjs, drops a copy of node.exe beside
 * it so the machine needs nothing installed, and adds the one-time installer.
 * The whole handover is then "copy this folder, run Setup.ps1 once".
 */
import { build } from 'esbuild'
import { cpSync, copyFileSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const APP_NAME = 'Ganit Attendance'
const OUT = join('release', APP_NAME)

if (!statSync('dist/index.html', { throwIfNoEntry: false })) {
  throw new Error('dist/index.html not found — run "npm run build" first.')
}

rmSync('release', { recursive: true, force: true })
mkdirSync(join(OUT, 'app'), { recursive: true })

// The UI, exactly as vite built it.
cpSync('dist', join(OUT, 'app', 'dist'), { recursive: true })

// The server, bundled to one file so no node_modules travel with it.
await build({
  entryPoints: ['server/launch.js'],
  outfile: join(OUT, 'app', 'ganit-attendance.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  minify: true,
  legalComments: 'none',
})

// Its own Node runtime — this is what removes the "install Node first" step.
copyFileSync(process.execPath, join(OUT, 'node.exe'))

copyFileSync('launcher/Setup.ps1', join(OUT, 'Setup.ps1'))
// The front door. A .ps1 cannot be one: mailed or zipped, PowerShell refuses
// to run it, and a right-click launch closes the window before the error can
// be read. The .cmd runs regardless of execution policy, clears the zip's
// internet mark from every file, and holds the window open.
copyFileSync('launcher/Start Here.cmd', join(OUT, 'Start Here.cmd'))

writeFileSync(join(OUT, 'READ ME FIRST.txt'), [
  `${APP_NAME}`,
  '='.repeat(APP_NAME.length),
  '',
  'TO INSTALL (once per computer)',
  '',
  '  IF THIS CAME AS A ZIP FILE, EXTRACT IT FIRST.',
  '  Right-click the zip -> "Extract All..." -> Extract, then open the',
  '  folder it creates. Opening the zip by double-clicking is NOT enough:',
  '  Windows only unpacks the one file you click, and the install fails.',
  '',
  '  1. Copy the extracted folder onto the computer (the Desktop is fine).',
  '  2. Double-click "Start Here.cmd".',
  '  3. If a blue "Windows protected your PC" box appears, click',
  '     "More info" and then "Run anyway".',
  `  4. A "${APP_NAME}" icon appears on the Desktop.`,
  '',
  '  The window shows what it did and waits for you to press Enter. If',
  '  anything went wrong it says so in red - send a photo of that window.',
  '',
  'TO USE',
  '',
  `  Double-click the "${APP_NAME}" icon on the Desktop.`,
  '',
  '  1. Upload the swipe report from the attendance machine.',
  '  2. Optionally upload the card-assignment sheet so cards show real',
  '     names instead of "Card 1234". It is remembered afterwards.',
  '  3. Read the dashboard, or click "Download Excel" for the full',
  '     month in a spreadsheet.',
  '',
  '  A small black window appears while the app is running. That is the',
  '  app itself - leave it alone. It closes by itself when you close the',
  '  app window.',
  '',
  'SENDING THE LOW-ATTENDANCE EMAILS',
  '',
  '  "Draft emails" needs the employee list (names and email addresses)',
  '  once, then sends through Microsoft 365 using your own work email and',
  '  password. The password is used for that one send and is never saved.',
  '',
  '  If sign-in fails, ask IT whether SMTP AUTH is enabled for the mailbox,',
  '  and whether an app password is required.',
  '',
  'GOOD TO KNOW',
  '',
  '  - Nothing is installed system-wide and no admin rights are needed.',
  '  - Attendance data stays on this computer. The only thing that ever',
  '    leaves it is an email you explicitly choose to send.',
  '  - The app is only reachable from this computer, not over the network.',
  '',
  'TO REMOVE',
  '',
  '  Open PowerShell in this folder and run:',
  '     powershell -ExecutionPolicy Bypass -File Setup.ps1 -Uninstall',
  '',
  'IF IT WILL NOT INSTALL',
  '',
  '  - "Missing the app folder / node.exe": the zip was not extracted.',
  '    Extract it properly and run "Start Here.cmd" from the extracted',
  '    folder, not from inside the zip.',
  '  - "The bundled Node runtime would not start": antivirus or a company',
  '    policy is blocking programs in AppData. Show IT the path printed',
  '    in the window.',
  '  - Anything else: send a photo of the window. It prints the Windows',
  '    version and settings needed to work out why.',
  '',
].join('\r\n'))

const mb = (p) => (statSync(p).size / 1024 / 1024).toFixed(1)
const dirMb = (p) => {
  let total = 0
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, e.name)
      if (e.isDirectory()) walk(full)
      else total += statSync(full).size
    }
  }
  walk(p)
  return (total / 1024 / 1024).toFixed(1)
}

console.log(`\n  release/${APP_NAME}/`)
console.log(`    app/               ${dirMb(join(OUT, 'app')).padStart(5)} MB   <- the UI + the bundled server`)
console.log(`    node.exe           ${mb(join(OUT, 'node.exe')).padStart(5)} MB   <- so the machine needs nothing installed`)
console.log(`    Start Here.cmd     ${mb(join(OUT, 'Start Here.cmd')).padStart(5)} MB   <- double-click this, once per machine`)
console.log(`    Setup.ps1          ${mb(join(OUT, 'Setup.ps1')).padStart(5)} MB   <- what it runs`)
console.log(`    READ ME FIRST.txt  ${mb(join(OUT, 'READ ME FIRST.txt')).padStart(5)} MB`)
console.log(`\n  Total ${dirMb(OUT)} MB. Ready to hand over.\n`)
