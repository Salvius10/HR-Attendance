// Vite plugin that adds the POST /api/send-emails endpoint to the dev and
// preview servers. The shipped build gets the same endpoint from
// server/server.js — both mount the one handler in server/sendMail.js.
import { mailMiddleware } from './sendMail.js'

export default function mailPlugin() {
  return {
    name: 'hr-attendance-mail',
    configureServer(server) {
      server.middlewares.use(mailMiddleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(mailMiddleware)
    },
  }
}
