import '../instrument.server.mjs'

import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/react-start/server'

const fetch = createStartHandler(defaultStreamHandler)

export default {
  async fetch(...args: Parameters<typeof fetch>) {
    return await fetch(...args)
  },
}
