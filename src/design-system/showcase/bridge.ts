import { createBridgeClient } from '../../bridge/client'

/** Cliente único da ponte na vitrine (handshake e app.exit). */
export const bridge = createBridgeClient()
